use axum::{
    routing::{get, post, put},
    Router,
};

mod checklist;
mod db;
mod models;
mod routes;

const SERVICE: &str = "events-service";

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
        // Calendar listing + admin create.
        .route(
            "/api/v1/events",
            get(routes::list_events).post(routes::create_event),
        )
        // Static segments are registered before `/events/:id` — axum routes
        // these to the specific handler rather than the id param.
        .route("/api/v1/events/my-calendar", get(routes::my_calendar))
        .route(
            "/api/v1/events/servers/:game_id",
            get(routes::list_game_servers).put(routes::set_game_servers),
        )
        .route(
            "/api/v1/events/banners/:banner_id/runs",
            get(routes::list_banner_runs),
        )
        .route(
            "/api/v1/events/by-item/:item_id/banner-history",
            get(routes::list_item_banner_history),
        )
        .route("/api/v1/events/follows", get(routes::list_follows))
        .route(
            "/api/v1/events/follows/:game_id",
            put(routes::upsert_follow).delete(routes::delete_follow),
        )
        .route(
            "/api/v1/events/:id",
            get(routes::get_event)
                .put(routes::update_event)
                .delete(routes::delete_event),
        )
        .route("/api/v1/events/:id/items", put(routes::set_event_items))
        .route(
            "/api/v1/events/:id/server-times",
            put(routes::set_event_server_times),
        )
        .route(
            "/api/v1/events/:id/translations",
            get(routes::list_event_translations),
        )
        .route(
            "/api/v1/events/:id/translations/:locale",
            put(routes::upsert_event_translation).delete(routes::delete_event_translation),
        )
        // Reset checklists (auth). Static segments are registered before the
        // `:game_id` param so axum routes `/toggle` and `/custom` to their
        // specific handlers rather than treating them as a game id.
        .route("/api/v1/checklists/toggle", post(routes::toggle_task))
        .route(
            "/api/v1/checklists/custom",
            post(routes::create_custom_task),
        )
        .route(
            "/api/v1/checklists/custom/:task_id",
            put(routes::update_custom_task).delete(routes::delete_custom_task),
        )
        .route("/api/v1/checklists/:game_id", get(routes::get_checklist))
        .route(
            "/api/v1/checklists/:game_id/hidden",
            put(routes::set_hidden),
        )
        .route(
            "/api/v1/checklists/:game_id/templates",
            get(routes::list_templates_admin).put(routes::set_templates),
        )
        .with_state(pool);

    shared_server::serve(SERVICE, 3010, app).await;
}
