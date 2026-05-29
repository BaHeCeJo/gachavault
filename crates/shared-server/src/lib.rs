//! Boilerplate every Rust service's `main()` used to copy-paste:
//! - dotenv + JSON tracing-subscriber init
//! - PORT env parsing
//! - 0.0.0.0 bind + serve loop
//! - /health JSON response shape
//!
//! Each service now writes:
//! ```ignore
//! #[tokio::main]
//! async fn main() {
//!     shared_server::init_tracing();
//!     // build state + router
//!     shared_server::serve("auth-service", 3001, app).await;
//! }
//! ```

use axum::Json;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Load `.env` and bring up a JSON tracing subscriber filtered by `RUST_LOG`
/// (default: `info`). Call once at the very top of `main` — calling twice in
/// the same process panics because tracing's global subscriber is one-shot.
pub fn init_tracing() {
    dotenvy::dotenv().ok();
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer().json())
        .init();
}

/// Build the `/health` JSON body. Wire as `axum::routing::get(|| async {
/// shared_server::health(\"auth-service\") })`. Keeping this a plain function
/// (not a wrapped handler) means the caller decides how to mount it without
/// the crate fighting axum's handler-trait generics.
pub fn health(service: &'static str) -> Json<serde_json::Value> {
    Json(serde_json::json!({"status": "ok", "service": service}))
}

/// Bind to `0.0.0.0:$PORT` (falling back to `default_port` if `PORT` is unset
/// or unparseable) and run the router until the process is killed. The
/// `service` label only shapes the startup log line.
pub async fn serve(service: &str, default_port: u16, app: axum::Router) {
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(default_port);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("{} listening on {}", service, addr);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind TCP listener");
    axum::serve(listener, app)
        .await
        .expect("axum::serve failed");
}
