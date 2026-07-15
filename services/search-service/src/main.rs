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

    // `data` is a free-form per-section JSONB blob whose keys are defined by
    // each section's item_type_schema, so an allowlist of key names can never
    // keep up: a weapons section's `passive_effect` or an artifact set's
    // `set_bonus` would be indexed but unmatchable. Naming the *parent* makes
    // every nested key searchable, whatever it's called.
    //
    // Three non-obvious things, all verified against meilisearch v1.11.3 —
    // don't "simplify" this without re-checking:
    //  - Order is the attribute ranking rule: name beats slug beats data, so
    //    the item *named* Claymore outranks one that merely has claymore in
    //    data.weapon_type.
    //  - NOT ["*"]: the wildcard makes game_id/section_id/section_slug
    //    searchable too, so a query of "characters" returns every character
    //    via its section_slug. It also ranks by field order *in the document*,
    //    which puts game_slug/section_slug above name and demotes real name
    //    matches. Mixing (["name","slug","*"]) doesn't help — meilisearch
    //    silently normalizes it to ["*"] and drops the ordering.
    //  - NOT "data.*": accepted without error, stored verbatim, matches
    //    nothing at all. Dot-notation only takes concrete paths.
    //
    // Changing this setting reindexes already-stored documents on its own;
    // it does not require re-pushing them.
    let settings = json!({
        "filterableAttributes": ["game_slug", "section_slug", "game_id", "section_id"],
        "sortableAttributes": ["name"],
        "searchableAttributes": ["name", "slug", "data"]
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
