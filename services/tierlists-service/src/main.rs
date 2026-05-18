use axum::{routing::{get, post, put}, Router};
use serde_json::json;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod routes;
// Note: tierlists routes use Option<AuthUser> for optional auth on get_tierlist

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

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/tierlists", get(routes::list_my_tierlists).post(routes::create_tierlist))
        .route("/api/v1/tierlists/:id", get(routes::get_tierlist).put(routes::update_tierlist).delete(routes::delete_tierlist))
        .route("/api/v1/tierlists/:id/entries", post(routes::upsert_entries))
        .route("/api/v1/tierlists/share/:slug", get(routes::get_by_share_slug))
        .route("/api/v1/games/:game_id/tierlists", get(routes::list_public_tierlists))
        .with_state(pool);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3005".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    tracing::info!("tierlists-service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(json!({"status": "ok", "service": "tierlists-service"}))
}
