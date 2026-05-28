// Shared test helpers. Lives under tests/common/mod.rs (not common.rs) so
// Cargo doesn't compile it as its own integration test binary — each .rs
// directly under tests/ is its own crate, but subdirectories aren't.

use axum::{
    body::Body,
    http::{header, HeaderMap, HeaderValue, Method, Request, Response, StatusCode},
    routing::{get, post},
    Router,
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::PgPool;
use tower::ServiceExt;

use auth_service::{oauth, routes};

/// Rebuild the same Router main.rs serves, scoped down to the routes the
/// integration suite exercises. Kept in sync with main.rs by hand — when
/// a new test needs a route, add it here too.
pub fn build_test_app(pool: PgPool) -> Router {
    Router::new()
        .route("/api/v1/auth/register", post(routes::register))
        .route("/api/v1/auth/login", post(routes::login))
        .route("/api/v1/auth/refresh", post(routes::refresh))
        .route("/api/v1/auth/logout", post(routes::logout))
        .route("/api/v1/auth/verify-email", post(routes::verify_email))
        .route("/api/v1/auth/me", get(routes::me))
        .route("/api/v1/auth/google", get(oauth::google_redirect))
        .with_state(pool)
}

/// Tests run as one process; setting JWT_SECRET once is fine and matches
/// what the real service expects on startup. Use a stable value so issued
/// tokens decode correctly inside the same test.
pub fn setup_env() {
    // SAFETY: tests in the same process always agree on JWT_SECRET. The
    // only race is between concurrent tests setting the same value to the
    // same bytes, which is harmless.
    unsafe {
        std::env::set_var("JWT_SECRET", "test-jwt-secret-do-not-use-in-prod");
        // notifications-service isn't running during tests; the spawn'd
        // HTTP call fails silently and registration still succeeds.
        std::env::set_var("NOTIFICATIONS_SERVICE_URL", "http://127.0.0.1:1");
    }
}

pub async fn send_request(app: Router, req: Request<Body>) -> (StatusCode, HeaderMap, Value) {
    let resp: Response<Body> = app.oneshot(req).await.expect("router responded");
    let status = resp.status();
    let headers = resp.headers().clone();
    let bytes = resp
        .into_body()
        .collect()
        .await
        .expect("body collected")
        .to_bytes();
    let body: Value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or_else(|e| {
            panic!(
                "response body wasn't JSON: {} (body: {:?})",
                e,
                String::from_utf8_lossy(&bytes)
            )
        })
    };
    (status, headers, body)
}

pub async fn post_json(app: Router, path: &str, body: Value) -> (StatusCode, HeaderMap, Value) {
    let req = Request::builder()
        .method(Method::POST)
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .expect("valid request");
    send_request(app, req).await
}

pub async fn get_with_bearer(
    app: Router,
    path: &str,
    bearer: &str,
) -> (StatusCode, HeaderMap, Value) {
    let req = Request::builder()
        .method(Method::GET)
        .uri(path)
        .header(header::AUTHORIZATION, format!("Bearer {}", bearer))
        .body(Body::empty())
        .expect("valid request");
    send_request(app, req).await
}

pub async fn post_with_cookie(
    app: Router,
    path: &str,
    cookie_header: &str,
    body: Value,
) -> (StatusCode, HeaderMap, Value) {
    let req = Request::builder()
        .method(Method::POST)
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .header(
            header::COOKIE,
            HeaderValue::from_str(cookie_header).unwrap(),
        )
        .body(Body::from(body.to_string()))
        .expect("valid request");
    send_request(app, req).await
}

pub async fn post_with_bearer(
    app: Router,
    path: &str,
    bearer: &str,
    body: Value,
) -> (StatusCode, HeaderMap, Value) {
    let req = Request::builder()
        .method(Method::POST)
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {}", bearer))
        .body(Body::from(body.to_string()))
        .expect("valid request");
    send_request(app, req).await
}

/// Pull a single named cookie out of any Set-Cookie headers on a response.
/// Set-Cookie can appear multiple times (we get one per token), so iterate.
pub fn extract_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    for value in headers.get_all(header::SET_COOKIE).iter() {
        let s = value.to_str().ok()?;
        let prefix = format!("{}=", name);
        if let Some(rest) = s.strip_prefix(&prefix) {
            let val = rest.split(';').next()?;
            return Some(val.to_string());
        }
    }
    None
}

/// Build a Cookie request header from a list of (name, value) pairs.
pub fn cookies(pairs: &[(&str, &str)]) -> String {
    pairs
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("; ")
}

/// Register a fresh user and return their email, username, and password.
/// Tests typically follow up with `login_user` to get tokens.
pub async fn register_user(app: Router, suffix: &str) -> RegisteredUser {
    let email = format!("alice+{}@example.com", suffix);
    let username = format!("alice{}", suffix);
    let password = "correct-horse-battery-staple".to_string();

    let (status, _, _) = post_json(
        app,
        "/api/v1/auth/register",
        json!({
            "email": email,
            "username": username,
            "password": password,
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "register should succeed");

    RegisteredUser {
        email,
        username,
        password,
    }
}

pub struct RegisteredUser {
    pub email: String,
    pub username: String,
    pub password: String,
}
