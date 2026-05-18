use axum::{routing::{delete, get, post}, Router};
use serde_json::json;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod routes;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
    let pool = shared_db::create_pool(&database_url).await.expect("Failed to connect to database");
    sqlx::migrate!("./migrations").run(&pool).await.expect("Failed to run migrations");

    let upload_dir = std::env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".to_string());
    tokio::fs::create_dir_all(&upload_dir).await.expect("Failed to create upload directory");

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/media/upload", post(routes::upload))
        .route("/api/v1/media/avatar", post(routes::upload_avatar))
        .route("/api/v1/media/:id", get(routes::get_asset).delete(routes::delete_asset))
        .nest_service("/uploads", tower_http::services::ServeDir::new(&upload_dir))
        .with_state(pool);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3006".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    tracing::info!("media-service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(json!({"status": "ok", "service": "media-service"}))
}
