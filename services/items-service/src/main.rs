use axum::{routing::get, Router};
use reqwest::Client;
use serde_json::json;
use std::{net::SocketAddr, sync::Arc};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod db;
mod models;
mod routes;

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,
    pub http_client: Arc<Client>,
    pub search_url: String,
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

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
    let pool = shared_db::create_pool(&database_url)
        .await
        .expect("Failed to connect to database");
    let mut migrator = sqlx::migrate!("./migrations");
    migrator.ignore_missing = true;
    migrator.run(&pool).await.expect("Failed to run migrations");

    let state = AppState {
        pool,
        http_client: Arc::new(Client::new()),
        search_url: std::env::var("SEARCH_SERVICE_URL")
            .unwrap_or_else(|_| "http://localhost:3007".to_string()),
        internal_secret: std::env::var("INTERNAL_SECRET").expect("INTERNAL_SECRET required"),
    };

    let app = Router::new()
        .route("/health", get(health_check))
        .route(
            "/api/v1/items",
            get(routes::list_items).post(routes::create_item),
        )
        .route(
            "/api/v1/items/bulk-import",
            axum::routing::post(routes::bulk_import),
        )
        .route(
            "/api/v1/items/:id",
            get(routes::get_item)
                .put(routes::update_item)
                .delete(routes::delete_item),
        )
        .route(
            "/api/v1/items/:id/skills",
            get(routes::list_skills).post(routes::create_skill),
        )
        .route(
            "/api/v1/items/:id/builds",
            get(routes::list_builds).post(routes::create_build),
        )
        .route(
            "/api/v1/items/:id/changelog",
            get(routes::list_changelog).post(routes::create_changelog),
        )
        .route(
            "/api/v1/items/:id/translations",
            get(routes::list_item_translations),
        )
        .route(
            "/api/v1/items/:id/translations/:locale",
            axum::routing::put(routes::upsert_item_translation)
                .delete(routes::delete_item_translation),
        )
        .route(
            "/api/v1/games/:game_slug/items",
            get(routes::list_items_by_game),
        )
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3003".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    tracing::info!("items-service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(json!({"status": "ok", "service": "items-service"}))
}
