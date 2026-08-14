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
use shared_auth::Claims;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use uuid::Uuid;

const SERVICE: &str = "api-gateway";

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
    events_url: String,
    users_url: String,
    jwt_secret: String,
    redis_client: Option<Arc<redis::Client>>,
    allowed_origins: Arc<Vec<String>>,
}

#[tokio::main]
async fn main() {
    shared_server::init_tracing();

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
        events_url: std::env::var("EVENTS_SERVICE_URL").expect("EVENTS_SERVICE_URL required"),
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

    // Admin endpoints proxy to auth-service but are gated at the edge: the
    // request must carry a valid JWT with role admin/superadmin or the
    // gateway returns 401/403 before any backend service is touched. This is
    // defense-in-depth on top of per-service is_admin() checks — a bug in a
    // downstream handler can't accidentally expose an admin endpoint without
    // also bypassing this layer.
    let admin_router: Router<AppState> = Router::new()
        .route("/api/v1/admin", any(proxy_admin))
        .route("/api/v1/admin/*path", any(proxy_admin))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            admin_role_check,
        ));

    let app = Router::new()
        .route(
            "/health",
            axum::routing::get(|| async { shared_server::health(SERVICE) }),
        )
        // Base routes (no trailing path segment)
        .route("/api/v1/auth", any(proxy_auth))
        .route("/api/v1/games", any(proxy_games))
        .route("/api/v1/items", any(proxy_items))
        .route("/api/v1/collections", any(proxy_collections))
        .route("/api/v1/tierlists", any(proxy_tierlists))
        .route("/api/v1/media", any(proxy_media))
        .route("/api/v1/search", any(proxy_search))
        .route("/api/v1/events", any(proxy_events))
        // Checklists live in events-service (they reuse its game_servers /
        // home-server data), so they proxy to the same upstream.
        .route("/api/v1/checklists", any(proxy_events))
        .route("/api/v1/users", any(proxy_users))
        // Wildcard routes (with path segments)
        .route("/api/v1/auth/*path", any(proxy_auth))
        .route("/api/v1/games/*path", any(proxy_games))
        .route("/api/v1/items/*path", any(proxy_items))
        .route("/api/v1/collections/*path", any(proxy_collections))
        .route("/api/v1/tierlists/*path", any(proxy_tierlists))
        .route("/api/v1/media/*path", any(proxy_media))
        .route("/api/v1/search/*path", any(proxy_search))
        .route("/api/v1/events/*path", any(proxy_events))
        .route("/api/v1/checklists/*path", any(proxy_events))
        // Two /users/* paths belong to collections-service, not auth. They must
        // be declared before the wildcard below, which would otherwise swallow
        // them and hand them to auth-service — which has no such handlers, so
        // both 404'd and the public profile's collection section was always
        // empty. Static segments outrank the wildcard in the router.
        .route("/api/v1/users/:user_id/collections", any(proxy_collections))
        .route(
            "/api/v1/users/:user_id/collection-stats",
            any(proxy_collections),
        )
        .route("/api/v1/users/*path", any(proxy_users))
        .merge(admin_router)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            csrf_origin_check,
        ))
        .layer(middleware::from_fn(request_id_middleware))
        .with_state(state)
        .layer(cors);

    shared_server::serve(SERVICE, 3000, app).await;
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
async fn proxy_events(
    State(s): State<AppState>,
    req: axum::extract::Request,
) -> Result<Response, StatusCode> {
    proxy_request(&s, &s.events_url.clone(), req).await
}
async fn proxy_users(
    State(s): State<AppState>,
    req: axum::extract::Request,
) -> Result<Response, StatusCode> {
    proxy_request(&s, &s.users_url.clone(), req).await
}
async fn proxy_admin(
    State(s): State<AppState>,
    req: axum::extract::Request,
) -> Result<Response, StatusCode> {
    // Admin routes live in auth-service alongside /auth/* and /users/*.
    proxy_request(&s, &s.auth_url.clone(), req).await
}

/// Reject any /api/v1/admin/* request whose JWT doesn't claim role
/// admin or superadmin. Returns 401 without a token (or with one that
/// won't decode under our secret) and 403 when the role check fails.
/// Downstream services still run their own is_admin() check — this is
/// strictly defense-in-depth at the edge.
async fn admin_role_check(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let headers = req.headers();
    let token = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string())
        .or_else(|| extract_cookie_value(headers, "access_token"));

    let Some(token) = token else {
        return Err(StatusCode::UNAUTHORIZED);
    };

    let Ok(claims) = Claims::decode(&token, &state.jwt_secret) else {
        return Err(StatusCode::UNAUTHORIZED);
    };

    if !matches!(
        claims.role.as_str(),
        shared_auth::ROLE_ADMIN | shared_auth::ROLE_SUPERADMIN
    ) {
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(next.run(req).await)
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
