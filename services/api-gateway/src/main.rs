use axum::{
    body::Body,
    extract::{Request, State},
    http::{
        header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE},
        HeaderValue, Method, StatusCode,
    },
    middleware::{self, Next},
    response::Response,
    routing::any,
    Router,
};
use redis::AsyncCommands;
use reqwest::Client;
use serde_json::json;
use shared_auth::Claims;
use std::{net::SocketAddr, sync::Arc};
use tower_http::cors::CorsLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

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
    allowed_origins: Arc<Vec<String>>,
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
    let jwt_secret = shared_auth::read_secret("JWT_SECRET").expect("JWT_SECRET required");
    let redis_client = shared_auth::read_secret("REDIS_URL")
        .ok()
        .and_then(|url| redis::Client::open(url).ok())
        .map(Arc::new);

    let allowed_origin_strings: Vec<String> = std::env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:3009".into())
        .split(',')
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let allowed_origins: Vec<HeaderValue> = allowed_origin_strings
        .iter()
        .filter_map(|s| s.parse().ok())
        .collect();

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
        allowed_origins: Arc::new(allowed_origin_strings),
    };

    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE, ACCEPT])
        .allow_credentials(true);

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
        .layer(middleware::from_fn_with_state(
            state.clone(),
            csrf_origin_check,
        ))
        .layer(middleware::from_fn(request_id_middleware))
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

/// CSRF defense-in-depth on top of SameSite cookies.
/// State-changing methods must carry an `Origin` (or `Referer` fallback) that
/// matches the configured ALLOWED_ORIGINS. Same-origin browser requests always
/// send one of these; cross-origin forgery attempts from `evil.com` either
/// omit them (rejected) or carry their own origin (rejected).
async fn csrf_origin_check(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let method = req.method();
    let is_state_changing = matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    );
    if !is_state_changing {
        return Ok(next.run(req).await);
    }

    // Exempt the OAuth callback — it's actually a GET, but defensively scoped
    // here in case its method ever changes; without exemption a state-changing
    // callback from accounts.google.com would always 403.
    let path = req.uri().path();
    if path.starts_with("/api/v1/auth/google/callback") {
        return Ok(next.run(req).await);
    }

    let origin = req
        .headers()
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim_end_matches('/').to_string());

    let referer = req
        .headers()
        .get("referer")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let allowed = &state.allowed_origins;

    let origin_ok = origin
        .as_deref()
        .map(|o| allowed.iter().any(|a| a == o))
        .unwrap_or(false);

    let referer_ok = referer
        .as_deref()
        .map(|r| {
            allowed
                .iter()
                .any(|a| r.starts_with(&format!("{}/", a)) || r == a)
        })
        .unwrap_or(false);

    if origin_ok || referer_ok {
        return Ok(next.run(req).await);
    }

    tracing::warn!(
        "csrf: rejecting {} {} (origin={:?}, referer={:?})",
        method,
        path,
        origin,
        referer,
    );
    Err(StatusCode::FORBIDDEN)
}

/// Propagate or generate an X-Request-ID for every incoming request and stamp
/// it on the response so logs and downstream services can correlate.
async fn request_id_middleware(mut req: Request, next: Next) -> Response {
    let header_name = axum::http::HeaderName::from_static("x-request-id");
    let incoming = req
        .headers()
        .get(&header_name)
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.is_empty() && s.len() <= 128)
        .map(|s| s.to_string());

    let request_id = incoming.unwrap_or_else(|| Uuid::new_v4().to_string());

    if let Ok(value) = HeaderValue::from_str(&request_id) {
        req.headers_mut().insert(header_name.clone(), value.clone());
        let span = tracing::info_span!("request", request_id = %request_id);
        let _enter = span.enter();
        let mut response = next.run(req).await;
        response.headers_mut().insert(header_name, value);
        response
    } else {
        next.run(req).await
    }
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

fn extract_cookie_value(headers: &axum::http::HeaderMap, name: &str) -> Option<String> {
    let cookie_str = headers.get("cookie")?.to_str().ok()?;
    cookie_str.split(';').find_map(|part| {
        let (k, v) = part.trim().split_once('=')?;
        (k.trim() == name).then(|| v.trim().to_string())
    })
}

async fn is_token_revoked(client: &Arc<redis::Client>, jti: &str, iat: usize) -> bool {
    let Ok(mut conn) = client.get_multiplexed_async_connection().await else {
        return false;
    };
    let revoked: redis::RedisResult<bool> = conn.exists(format!("revoked:{}", jti)).await;
    if revoked.unwrap_or(false) {
        return true;
    }
    let cutoff: redis::RedisResult<Option<i64>> = conn.get("session_invalidation_cutoff").await;
    if let Ok(Some(cutoff_ts)) = cutoff {
        if (iat as i64) < cutoff_ts {
            return true;
        }
    }
    false
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
    let mut headers = req.headers().clone();

    // Cookie-to-Bearer: if no explicit Authorization header is present, extract the
    // access_token HttpOnly cookie and inject a Bearer token so downstream services
    // can use standard JWT authentication without knowing about cookies.
    if !headers.contains_key(AUTHORIZATION) {
        if let Some(token) = extract_cookie_value(&headers, "access_token") {
            if let Ok(value) = format!("Bearer {}", token).parse::<axum::http::HeaderValue>() {
                headers.insert(AUTHORIZATION, value);
            }
        }
    }

    // If the request carries a JWT, verify it is not in the revocation blocklist.
    // Fail open (allow the request through) only when Redis is unavailable so that
    // a Redis outage does not take down the whole API.
    if let Some(auth_val) = headers.get("authorization") {
        if let Ok(auth_str) = auth_val.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                if let Ok(claims) = Claims::decode(token, &state.jwt_secret) {
                    if let Some(redis_client) = &state.redis_client {
                        if is_token_revoked(redis_client, &claims.jti, claims.iat).await {
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
