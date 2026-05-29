use axum::{
    middleware,
    routing::{delete, get, post},
    Router,
};
use reqwest::Client;
use serde_json::json;
use shared_auth::HasInternalSecret;
use std::sync::Arc;

mod routes;

const SERVICE: &str = "search-service";

#[derive(Clone)]
pub struct AppState {
    pub meilisearch_url: String,
    pub meilisearch_key: String,
    pub http_client: Arc<Client>,
    pub internal_secret: String,
}

impl HasInternalSecret for AppState {
    fn internal_secret(&self) -> &str {
        &self.internal_secret
    }
}

#[tokio::main]
async fn main() {
    shared_server::init_tracing();

    let state = AppState {
        meilisearch_url: std::env::var("MEILISEARCH_URL").expect("MEILISEARCH_URL required"),
        meilisearch_key: shared_auth::read_secret("MEILISEARCH_MASTER_KEY")
            .expect("MEILISEARCH_MASTER_KEY required"),
        http_client: Arc::new(Client::new()),
        internal_secret: shared_auth::read_secret("INTERNAL_SECRET")
            .expect("INTERNAL_SECRET required"),
    };

    init_meilisearch_index(&state).await;

    let index_routes = Router::new()
        .route("/api/v1/search/index", post(routes::index_item))
        .route(
            "/api/v1/search/index/:id",
            delete(routes::remove_from_index),
        )
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            shared_auth::verify_internal_secret::<AppState>,
        ));

    let app = Router::new()
        .route("/health", get(|| async { shared_server::health(SERVICE) }))
        .route("/api/v1/search", get(routes::search))
        .merge(index_routes)
        .with_state(state);

    shared_server::serve(SERVICE, 3007, app).await;
}

async fn init_meilisearch_index(state: &AppState) {
    // Ensure the index exists with correct filterable attributes
    let create_index = state
        .http_client
        .post(format!("{}/indexes", state.meilisearch_url))
        .header("Authorization", format!("Bearer {}", state.meilisearch_key))
        .json(&json!({ "uid": "items", "primaryKey": "id" }))
        .send()
        .await;

    if let Err(e) = create_index {
        tracing::warn!(
            "Failed to create Meilisearch index (may already exist): {}",
            e
        );
    }

    let settings = json!({
        "filterableAttributes": ["game_slug", "section_slug", "game_id", "section_id"],
        "sortableAttributes": ["name"],
        "searchableAttributes": ["name", "slug", "data.description", "data.role", "data.element"]
    });

    match state
        .http_client
        .patch(format!("{}/indexes/items/settings", state.meilisearch_url))
        .header("Authorization", format!("Bearer {}", state.meilisearch_key))
        .json(&settings)
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => {
            tracing::info!("Meilisearch index 'items' configured successfully");
        }
        Ok(r) => tracing::warn!("Meilisearch settings update returned {}", r.status()),
        Err(e) => tracing::warn!("Failed to configure Meilisearch settings: {}", e),
    }
}
