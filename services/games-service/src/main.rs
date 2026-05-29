use axum::{routing::get, Router};

mod db;
mod models;
mod routes;

const SERVICE: &str = "games-service";

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
            "/api/v1/games",
            get(routes::list_games).post(routes::create_game),
        )
        .route(
            "/api/v1/games/:slug",
            get(routes::get_game)
                .put(routes::update_game)
                .delete(routes::delete_game),
        )
        .route("/api/v1/sections/:id", get(routes::get_section))
        .route(
            "/api/v1/games/:slug/sections",
            get(routes::list_sections).post(routes::create_section),
        )
        .route(
            "/api/v1/games/:slug/sections/:id",
            axum::routing::patch(routes::update_section).delete(routes::delete_section),
        )
        .route(
            "/api/v1/games/:slug/schemas",
            get(routes::list_schemas).post(routes::create_schema),
        )
        .route(
            "/api/v1/games/:slug/schemas/:id",
            axum::routing::patch(routes::update_schema).delete(routes::delete_schema),
        )
        .route(
            "/api/v1/games/:slug/attributes",
            get(routes::list_attributes).post(routes::create_attribute),
        )
        .route(
            "/api/v1/games/:slug/attributes/:id",
            axum::routing::patch(routes::update_attribute).delete(routes::delete_attribute),
        )
        .route(
            "/api/v1/games/:slug/translations",
            get(routes::list_game_translations),
        )
        .route(
            "/api/v1/games/:slug/translations/:locale",
            axum::routing::put(routes::upsert_game_translation)
                .delete(routes::delete_game_translation),
        )
        .with_state(pool);

    shared_server::serve(SERVICE, 3002, app).await;
}
