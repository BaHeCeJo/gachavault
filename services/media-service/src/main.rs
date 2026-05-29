use axum::{
    routing::{get, post},
    Router,
};

mod routes;

const SERVICE: &str = "media-service";

#[tokio::main]
async fn main() {
    shared_server::init_tracing();

    let database_url = shared_auth::read_secret("DATABASE_URL").expect("DATABASE_URL required");
    let pool = shared_db::create_pool(&database_url)
        .await
        .expect("Failed to connect to database");
    let mut migrator = sqlx::migrate!("./migrations");
    migrator.ignore_missing = true;
    migrator.run(&pool).await.expect("Failed to run migrations");

    let upload_dir = std::env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".to_string());
    tokio::fs::create_dir_all(&upload_dir)
        .await
        .expect("Failed to create upload directory");

    let app = Router::new()
        .route("/health", get(|| async { shared_server::health(SERVICE) }))
        .route("/api/v1/media", get(routes::list_assets))
        .route("/api/v1/media/upload", post(routes::upload))
        .route("/api/v1/media/avatar", post(routes::upload_avatar))
        .route(
            "/api/v1/media/:id",
            get(routes::get_asset).delete(routes::delete_asset),
        )
        .nest_service("/uploads", tower_http::services::ServeDir::new(&upload_dir))
        .with_state(pool);

    shared_server::serve(SERVICE, 3006, app).await;
}
