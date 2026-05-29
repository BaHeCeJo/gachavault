use axum::{
    extract::{Request, State},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use serde_json::json;
use std::net::SocketAddr;
use subtle::ConstantTimeEq;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod routes;

#[derive(Clone)]
pub struct AppState {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_username: String,
    pub smtp_password: String,
    pub from_email: String,
    pub frontend_url: String,
    pub internal_secret: String,
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

    let state = AppState {
        smtp_host: std::env::var("SMTP_HOST").expect("SMTP_HOST required"),
        smtp_port: std::env::var("SMTP_PORT")
            .unwrap_or_else(|_| "587".to_string())
            .parse()
            .expect("Invalid SMTP_PORT"),
        smtp_username: std::env::var("SMTP_USERNAME").unwrap_or_default(),
        smtp_password: shared_auth::read_secret("SMTP_PASSWORD").unwrap_or_default(),
        from_email: std::env::var("FROM_EMAIL")
            .unwrap_or_else(|_| "noreply@gachavault.com".to_string()),
        frontend_url: std::env::var("FRONTEND_URL")
            .unwrap_or_else(|_| "http://localhost:3009".to_string()),
        internal_secret: shared_auth::read_secret("INTERNAL_SECRET")
            .expect("INTERNAL_SECRET required"),
    };

    let internal_routes = Router::new()
        .route(
            "/internal/send-verification",
            post(routes::send_verification),
        )
        .route(
            "/internal/send-password-reset",
            post(routes::send_password_reset),
        )
        .route("/internal/send-welcome", post(routes::send_welcome))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            verify_internal_secret,
        ));

    let app = Router::new()
        .route("/health", get(health_check))
        .merge(internal_routes)
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3008".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    tracing::info!("notifications-service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn verify_internal_secret(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let secret = request
        .headers()
        .get("x-internal-secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    // Constant-time compare so an attacker can't recover the secret byte-by-byte
    // via response-time differences.
    let matched: bool = secret
        .as_bytes()
        .ct_eq(state.internal_secret.as_bytes())
        .into();
    if !matched {
        return axum::http::StatusCode::UNAUTHORIZED.into_response();
    }
    next.run(request).await
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(json!({"status": "ok", "service": "notifications-service"}))
}
