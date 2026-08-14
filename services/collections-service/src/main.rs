use axum::{
    routing::{get, post},
    Router,
};

mod routes;

const SERVICE: &str = "collections-service";

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

    let app = Router::new()
        .route("/health", get(|| async { shared_server::health(SERVICE) }))
        .route("/api/v1/collections", get(routes::get_my_collection))
        .route(
            "/api/v1/collections/:game_id",
            get(routes::get_collection_by_game),
        )
        .route(
            "/api/v1/collections/items/:item_id",
            post(routes::upsert_entry).delete(routes::delete_entry),
        )
        // Public: aggregate counts only, and only for users who opted in.
        // Lives under /collections rather than the more natural
        // /users/:id/collection-stats because the gateway sends all of
        // /api/v1/users/* to auth-service and cannot carve out a sub-path
        // without a router conflict — this prefix is the one it already
        // proxies here.
        .route(
            "/api/v1/collections/public/:user_id",
            get(routes::get_public_collection_stats),
        )
        .route(
            "/api/v1/collections/visibility",
            get(routes::get_visibility).put(routes::set_visibility),
        )
        .with_state(pool);

    shared_server::serve(SERVICE, 3004, app).await;
}
