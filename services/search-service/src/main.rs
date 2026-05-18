use axum::{routing::{delete, get, post}, Router};
use reqwest::Client;
use serde_json::json;
use std::{net::SocketAddr, sync::Arc};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod routes;

#[derive(Clone)]
pub struct AppState {
    pub meilisearch_url: String,
    pub meilisearch_key: String,
    pub http_client: Arc<Client>,
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
        meilisearch_url: std::env::var("MEILISEARCH_URL").expect("MEILISEARCH_URL required"),
        meilisearch_key: std::env::var("MEILISEARCH_MASTER_KEY").expect("MEILISEARCH_MASTER_KEY required"),
        http_client: Arc::new(Client::new()),
    };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/search", get(routes::search))
        .route("/api/v1/search/index", post(routes::index_item))
        .route("/api/v1/search/index/:id", delete(routes::remove_from_index))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3007".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    tracing::info!("search-service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(json!({"status": "ok", "service": "search-service"}))
}
