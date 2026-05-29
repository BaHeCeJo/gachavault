use axum::{
    routing::{delete, get, post},
    Router,
};

mod routes;
// Note: tierlists routes use Option<AuthUser> for optional auth on get_tierlist

const SERVICE: &str = "tierlists-service";

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
        .route(
            "/api/v1/tierlists",
            get(routes::list_my_tierlists).post(routes::create_tierlist),
        )
        .route(
            "/api/v1/tierlists/public",
            get(routes::list_public_tierlists_query),
        )
        .route(
            "/api/v1/tierlists/:id",
            get(routes::get_tierlist)
                .put(routes::update_tierlist)
                .delete(routes::delete_tierlist),
        )
        .route(
            "/api/v1/tierlists/:id/entries",
            post(routes::upsert_entries),
        )
        .route(
            "/api/v1/tierlists/:id/upvote",
            post(routes::upvote_tierlist).delete(routes::remove_upvote),
        )
        .route(
            "/api/v1/tierlists/:id/comments",
            get(routes::list_comments).post(routes::create_comment),
        )
        .route(
            "/api/v1/tierlists/:id/comments/:comment_id",
            delete(routes::delete_comment),
        )
        .route(
            "/api/v1/tierlists/share/:slug",
            get(routes::get_by_share_slug),
        )
        .route(
            "/api/v1/games/:game_id/tierlists",
            get(routes::list_public_tierlists),
        )
        .with_state(pool);

    shared_server::serve(SERVICE, 3005, app).await;
}
