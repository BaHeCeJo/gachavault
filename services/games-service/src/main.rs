use axum::{routing::get, Router};
use serde_json::json;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod db;
mod models;
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
    let mut migrator = sqlx::migrate!("./migrations");
    migrator.ignore_missing = true;
    migrator.run(&pool).await.expect("Failed to run migrations");

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/games", get(routes::list_games).post(routes::create_game))
        .route("/api/v1/games/:slug", get(routes::get_game).put(routes::update_game).delete(routes::delete_game))
        .route("/api/v1/sections/:id", get(routes::get_section))
        .route("/api/v1/games/:slug/sections", get(routes::list_sections).post(routes::create_section))
        .route("/api/v1/games/:slug/sections/:id", axum::routing::patch(routes::update_section).delete(routes::delete_section))
        .route("/api/v1/games/:slug/schemas", get(routes::list_schemas).post(routes::create_schema))
        .route("/api/v1/games/:slug/schemas/:id", axum::routing::patch(routes::update_schema).delete(routes::delete_schema))
        .route("/api/v1/games/:slug/attributes", get(routes::list_attributes).post(routes::create_attribute))
        .route("/api/v1/games/:slug/attributes/:id", axum::routing::patch(routes::update_attribute).delete(routes::delete_attribute))
        .route("/api/v1/games/:slug/translations", get(routes::list_game_translations))
        .route("/api/v1/games/:slug/translations/:locale", axum::routing::put(routes::upsert_game_translation).delete(routes::delete_game_translation))
        .with_state(pool);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3002".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    tracing::info!("games-service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(json!({"status": "ok", "service": "games-service"}))
}
