use axum::{
    routing::{get, post},
    Router,
};
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

    let database_url = shared_auth::read_secret("DATABASE_URL").expect("DATABASE_URL required");
    let pool = shared_db::create_pool(&database_url)
        .await
        .expect("Failed to connect to database");
    let mut migrator = sqlx::migrate!("./migrations");
    migrator.ignore_missing = true;
    migrator.run(&pool).await.expect("Failed to run migrations");

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/collections", get(routes::get_my_collection))
        .route(
            "/api/v1/collections/:game_id",
            get(routes::get_collection_by_game),
        )
        .route(
            "/api/v1/collections/items/:item_id",
            post(routes::upsert_entry).delete(routes::delete_entry),
        )
        .route(
            "/api/v1/users/:user_id/collections",
            get(routes::get_user_collection),
        )
        .with_state(pool);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3004".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    tracing::info!("collections-service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(json!({"status": "ok", "service": "collections-service"}))
}
