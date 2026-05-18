use axum::{body::Body, extract::State, http::StatusCode, response::Response, routing::any, Router};
use reqwest::Client;
use serde_json::json;
use std::{net::SocketAddr, sync::Arc};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
struct AppState {
    http_client: Arc<Client>,
    auth_url: String,
    games_url: String,
    items_url: String,
    collections_url: String,
    tierlists_url: String,
    media_url: String,
    search_url: String,
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
        http_client: Arc::new(Client::new()),
        auth_url: std::env::var("AUTH_SERVICE_URL").expect("AUTH_SERVICE_URL required"),
        games_url: std::env::var("GAMES_SERVICE_URL").expect("GAMES_SERVICE_URL required"),
        items_url: std::env::var("ITEMS_SERVICE_URL").expect("ITEMS_SERVICE_URL required"),
        collections_url: std::env::var("COLLECTIONS_SERVICE_URL").expect("COLLECTIONS_SERVICE_URL required"),
        tierlists_url: std::env::var("TIERLISTS_SERVICE_URL").expect("TIERLISTS_SERVICE_URL required"),
        media_url: std::env::var("MEDIA_SERVICE_URL").expect("MEDIA_SERVICE_URL required"),
        search_url: std::env::var("SEARCH_SERVICE_URL").expect("SEARCH_SERVICE_URL required"),
    };

    let app = Router::new()
        .route("/health", axum::routing::get(health_check))
        .route("/api/v1/auth/*path", any(proxy_auth))
        .route("/api/v1/games/*path", any(proxy_games))
        .route("/api/v1/items/*path", any(proxy_items))
        .route("/api/v1/collections/*path", any(proxy_collections))
        .route("/api/v1/tierlists/*path", any(proxy_tierlists))
        .route("/api/v1/media/*path", any(proxy_media))
        .route("/api/v1/search/*path", any(proxy_search))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    tracing::info!("api-gateway listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(json!({"status": "ok", "service": "api-gateway"}))
}

async fn proxy_auth(State(s): State<AppState>, req: axum::extract::Request) -> Result<Response, StatusCode> {
    proxy_request(&s.http_client, &s.auth_url, req).await
}
async fn proxy_games(State(s): State<AppState>, req: axum::extract::Request) -> Result<Response, StatusCode> {
    proxy_request(&s.http_client, &s.games_url, req).await
}
async fn proxy_items(State(s): State<AppState>, req: axum::extract::Request) -> Result<Response, StatusCode> {
    proxy_request(&s.http_client, &s.items_url, req).await
}
async fn proxy_collections(State(s): State<AppState>, req: axum::extract::Request) -> Result<Response, StatusCode> {
    proxy_request(&s.http_client, &s.collections_url, req).await
}
async fn proxy_tierlists(State(s): State<AppState>, req: axum::extract::Request) -> Result<Response, StatusCode> {
    proxy_request(&s.http_client, &s.tierlists_url, req).await
}
async fn proxy_media(State(s): State<AppState>, req: axum::extract::Request) -> Result<Response, StatusCode> {
    proxy_request(&s.http_client, &s.media_url, req).await
}
async fn proxy_search(State(s): State<AppState>, req: axum::extract::Request) -> Result<Response, StatusCode> {
    proxy_request(&s.http_client, &s.search_url, req).await
}

async fn proxy_request(client: &Client, base_url: &str, req: axum::extract::Request) -> Result<Response, StatusCode> {
    let path = req.uri().path_and_query().map(|p| p.as_str()).unwrap_or("/");
    let target_url = format!("{}{}", base_url, path);
    let method = reqwest::Method::from_bytes(req.method().as_str().as_bytes()).map_err(|_| StatusCode::BAD_REQUEST)?;
    let headers = req.headers().clone();
    let body = axum::body::to_bytes(req.into_body(), usize::MAX).await.map_err(|_| StatusCode::BAD_REQUEST)?;

    let mut builder = client.request(method, &target_url);
    for (k, v) in &headers { builder = builder.header(k, v); }

    let upstream = builder.body(body).send().await.map_err(|e| {
        tracing::error!("Upstream error: {:?}", e);
        StatusCode::BAD_GATEWAY
    })?;

    let status = StatusCode::from_u16(upstream.status().as_u16()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut resp = Response::builder().status(status);
    for (k, v) in upstream.headers() { resp = resp.header(k, v); }
    let bytes = upstream.bytes().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    resp.body(Body::from(bytes)).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
