use axum::{
    routing::{get, post},
    Router,
};
use serde_json::json;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod crypto;
mod db;
mod models;
mod notifications;
mod oauth;
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
    let pool = shared_db::create_pool(&database_url)
        .await
        .expect("Failed to connect to database");
    let mut migrator = sqlx::migrate!("./migrations");
    migrator.ignore_missing = true;
    migrator.run(&pool).await.expect("Failed to run migrations");

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/auth/register", post(routes::register))
        .route("/api/v1/auth/login", post(routes::login))
        .route("/api/v1/auth/refresh", post(routes::refresh))
        .route("/api/v1/auth/logout", post(routes::logout))
        .route("/api/v1/auth/verify-email", post(routes::verify_email))
        .route(
            "/api/v1/auth/forgot-password",
            post(routes::forgot_password),
        )
        .route("/api/v1/auth/reset-password", post(routes::reset_password))
        .route(
            "/api/v1/auth/me",
            get(routes::me)
                .patch(routes::update_avatar)
                .delete(routes::delete_account),
        )
        .route(
            "/api/v1/auth/me/username",
            axum::routing::patch(routes::update_username),
        )
        .route("/api/v1/auth/me/password", post(routes::change_password))
        .route("/api/v1/auth/google", get(oauth::google_redirect))
        .route("/api/v1/auth/google/callback", get(oauth::google_callback))
        .route("/api/v1/users", get(routes::list_users))
        .route(
            "/api/v1/users/:id/role",
            axum::routing::patch(routes::set_user_role),
        )
        .route(
            "/api/v1/users/:id/game-roles",
            get(routes::list_user_game_roles).post(routes::set_user_game_role),
        )
        .route(
            "/api/v1/users/:id/game-roles/:game_id",
            axum::routing::delete(routes::remove_user_game_role),
        )
        .route(
            "/api/v1/users/by-username/:username",
            get(routes::get_user_by_username),
        )
        .route("/api/v1/admin/stats", get(routes::get_admin_stats))
        .route(
            "/api/v1/admin/sessions",
            axum::routing::delete(routes::revoke_all_sessions),
        )
        .with_state(pool);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    tracing::info!("auth-service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(json!({"status": "ok", "service": "auth-service"}))
}
