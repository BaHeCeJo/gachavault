use axum::{
    extract::{Request, State},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Router,
};
use reqwest::Client;
use serde_json::json;
use std::{net::SocketAddr, sync::Arc};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod routes;

#[derive(Clone)]
pub struct AppState {
    pub meilisearch_url: String,
    pub meilisearch_key: String,
    pub http_client: Arc<Client>,
    pub internal_secret: String,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

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
            verify_internal_secret,
        ));

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/search", get(routes::search))
        .merge(index_routes)
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3007".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    tracing::info!("search-service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn verify_internal_secret(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let secret = request
        .headers()
        .get("x-internal-secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if secret != state.internal_secret {
        return axum::http::StatusCode::UNAUTHORIZED.into_response();
    }
    next.run(request).await
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(json!({"status": "ok", "service": "search-service"}))
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
