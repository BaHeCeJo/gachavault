use axum::{
    body::Body,
    extract::State,
    http::{
        header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE},
        StatusCode,
    },
    response::Response,
    routing::any,
    Router,
};
use redis::AsyncCommands;
use reqwest::Client;
use serde_json::json;
use shared_auth::Claims;
use std::{net::SocketAddr, sync::Arc};
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
struct AppState {
    http_client: Arc<Client>,
    auth_url: String,
    games_url: String,
    items_url: String,
    collections_url: String,
    tierlists_url: String,
    media_url: String,
    search_url: String,
    users_url: String,
    jwt_secret: String,
    redis_client: Option<Arc<redis::Client>>,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let auth_url = std::env::var("AUTH_SERVICE_URL").expect("AUTH_SERVICE_URL required");
    let jwt_secret = std::env::var("JWT_SECRET").expect("JWT_SECRET required");
    let redis_client = std::env::var("REDIS_URL")
        .ok()
        .and_then(|url| redis::Client::open(url).ok())
        .map(Arc::new);

    let state = AppState {
        http_client: Arc::new(Client::new()),
        users_url: auth_url.clone(),
        auth_url,
        games_url: std::env::var("GAMES_SERVICE_URL").expect("GAMES_SERVICE_URL required"),
        items_url: std::env::var("ITEMS_SERVICE_URL").expect("ITEMS_SERVICE_URL required"),
        collections_url: std::env::var("COLLECTIONS_SERVICE_URL")
            .expect("COLLECTIONS_SERVICE_URL required"),
        tierlists_url: std::env::var("TIERLISTS_SERVICE_URL")
            .expect("TIERLISTS_SERVICE_URL required"),
        media_url: std::env::var("MEDIA_SERVICE_URL").expect("MEDIA_SERVICE_URL required"),
        search_url: std::env::var("SEARCH_SERVICE_URL").expect("SEARCH_SERVICE_URL required"),
        jwt_secret,
        redis_client,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers([AUTHORIZATION, CONTENT_TYPE, ACCEPT]);

    let app = Router::new()
        .route("/health", axum::routing::get(health_check))
        // Base routes (no trailing path segment)
        .route("/api/v1/auth", any(proxy_auth))
        .route("/api/v1/games", any(proxy_games))
        .route("/api/v1/items", any(proxy_items))
        .route("/api/v1/collections", any(proxy_collections))
        .route("/api/v1/tierlists", any(proxy_tierlists))
        .route("/api/v1/media", any(proxy_media))
        .route("/api/v1/search", any(proxy_search))
        .route("/api/v1/users", any(proxy_users))
        // Wildcard routes (with path segments)
        .route("/api/v1/auth/*path", any(proxy_auth))
        .route("/api/v1/games/*path", any(proxy_games))
        .route("/api/v1/items/*path", any(proxy_items))
        .route("/api/v1/collections/*path", any(proxy_collections))
        .route("/api/v1/tierlists/*path", any(proxy_tierlists))
        .route("/api/v1/media/*path", any(proxy_media))
        .route("/api/v1/search/*path", any(proxy_search))
        .route("/api/v1/users/*path", any(proxy_users))
        .with_state(state)
        .layer(cors);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    tracing::info!("api-gateway listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(json!({"status": "ok", "service": "api-gateway"}))
}

async fn proxy_auth(
    State(s): State<AppState>,
    req: axum::extract::Request,
) -> Result<Response, StatusCode> {
    proxy_request(&s, &s.auth_url.clone(), req).await
}
async fn proxy_games(
    State(s): State<AppState>,
    req: axum::extract::Request,
) -> Result<Response, StatusCode> {
    proxy_request(&s, &s.games_url.clone(), req).await
}
async fn proxy_items(
    State(s): State<AppState>,
    req: axum::extract::Request,
) -> Result<Response, StatusCode> {
    proxy_request(&s, &s.items_url.clone(), req).await
}
async fn proxy_collections(
    State(s): State<AppState>,
    req: axum::extract::Request,
) -> Result<Response, StatusCode> {
    proxy_request(&s, &s.collections_url.clone(), req).await
}
async fn proxy_tierlists(
    State(s): State<AppState>,
    req: axum::extract::Request,
) -> Result<Response, StatusCode> {
    proxy_request(&s, &s.tierlists_url.clone(), req).await
}
async fn proxy_media(
    State(s): State<AppState>,
    req: axum::extract::Request,
) -> Result<Response, StatusCode> {
    proxy_request(&s, &s.media_url.clone(), req).await
}
async fn proxy_search(
    State(s): State<AppState>,
    req: axum::extract::Request,
) -> Result<Response, StatusCode> {
    proxy_request(&s, &s.search_url.clone(), req).await
}
async fn proxy_users(
    State(s): State<AppState>,
    req: axum::extract::Request,
) -> Result<Response, StatusCode> {
    proxy_request(&s, &s.users_url.clone(), req).await
}

async fn is_jti_revoked(client: &Arc<redis::Client>, jti: &str) -> bool {
    let Ok(mut conn) = client.get_multiplexed_async_connection().await else {
        return false;
    };
    let result: redis::RedisResult<bool> = conn.exists(format!("revoked:{}", jti)).await;
    result.unwrap_or(false)
}

async fn proxy_request(
    state: &AppState,
    base_url: &str,
    req: axum::extract::Request,
) -> Result<Response, StatusCode> {
    let path = req
        .uri()
        .path_and_query()
        .map(|p| p.as_str())
        .unwrap_or("/");
    let target_url = format!("{}{}", base_url, path);
    let method = reqwest::Method::from_bytes(req.method().as_str().as_bytes())
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let headers = req.headers().clone();

    // If the request carries a JWT, verify it is not in the revocation blocklist.
    // Fail open (allow the request through) only when Redis is unavailable so that
    // a Redis outage does not take down the whole API.
    if let Some(auth_val) = headers.get("authorization") {
        if let Ok(auth_str) = auth_val.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                if let Ok(claims) = Claims::decode(token, &state.jwt_secret) {
                    if let Some(redis_client) = &state.redis_client {
                        if is_jti_revoked(redis_client, &claims.jti).await {
                            return Err(StatusCode::UNAUTHORIZED);
                        }
                    }
                }
            }
        }
    }

    let body = axum::body::to_bytes(req.into_body(), usize::MAX)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let mut builder = state.http_client.request(method, &target_url);
    for (k, v) in &headers {
        // Never forward internal trust headers — an external client supplying
        // x-internal-secret would otherwise bypass service-level auth guards.
        if k.as_str().eq_ignore_ascii_case("x-internal-secret") {
            continue;
        }
        builder = builder.header(k, v);
    }

    let upstream = builder.body(body).send().await.map_err(|e| {
        tracing::error!("Upstream error: {:?}", e);
        StatusCode::BAD_GATEWAY
    })?;

    let status = StatusCode::from_u16(upstream.status().as_u16())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut resp = Response::builder().status(status);
    for (k, v) in upstream.headers() {
        resp = resp.header(k, v);
    }
    let bytes = upstream
        .bytes()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    resp.body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
