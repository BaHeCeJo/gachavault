use axum::{
    routing::{get, post},
    Router,
};

use auth_service::{oauth, routes};

const SERVICE: &str = "auth-service";

/// Refuse to start if FRONTEND_URL / BACKEND_URL are obviously wrong: unset,
/// malformed, or `http://` against a non-loopback host. These values land in
/// OAuth redirect URIs and post-callback redirects, so a typo or missing env
/// in prod is the kind of silent misconfig that downgrades auth without any
/// error showing up until you trace a real bug back to it.
fn validate_public_url(name: &str, value: &str) {
    let Some(rest) = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"))
    else {
        panic!(
            "{} must start with http:// or https:// (got {:?})",
            name, value
        );
    };
    let host = rest.split(['/', ':']).next().unwrap_or("");
    if host.is_empty() {
        panic!("{} has no host component (got {:?})", name, value);
    }
    let is_loopback = host == "localhost" || host == "127.0.0.1" || host == "[::1]";
    if value.starts_with("http://") && !is_loopback {
        panic!(
            "{}={:?} uses http:// on a non-loopback host; set https:// in production",
            name, value,
        );
    }
}

#[tokio::main]
async fn main() {
    shared_server::init_tracing();

    // Fail loudly on URL misconfig before we accept any traffic.
    let frontend_url = std::env::var("FRONTEND_URL").expect("FRONTEND_URL required");
    let backend_url = std::env::var("BACKEND_URL").expect("BACKEND_URL required");
    validate_public_url("FRONTEND_URL", &frontend_url);
    validate_public_url("BACKEND_URL", &backend_url);

    let database_url = shared_auth::read_secret("DATABASE_URL").expect("DATABASE_URL required");
    let pool = shared_db::create_pool(&database_url)
        .await
        .expect("Failed to connect to database");
    let mut migrator = sqlx::migrate!("./migrations");
    migrator.ignore_missing = true;
    migrator.run(&pool).await.expect("Failed to run migrations");

    let app = Router::new()
        .route("/health", get(|| async { shared_server::health(SERVICE) }))
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

    shared_server::serve(SERVICE, 3001, app).await;
}
