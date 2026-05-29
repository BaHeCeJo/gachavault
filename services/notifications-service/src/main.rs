use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use shared_auth::HasInternalSecret;

mod routes;

const SERVICE: &str = "notifications-service";

#[derive(Clone)]
pub struct AppState {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_username: String,
    pub smtp_password: String,
    pub from_email: String,
    pub frontend_url: String,
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
        smtp_host: std::env::var("SMTP_HOST").expect("SMTP_HOST required"),
        smtp_port: std::env::var("SMTP_PORT")
            .unwrap_or_else(|_| "587".to_string())
            .parse()
            .expect("Invalid SMTP_PORT"),
        smtp_username: std::env::var("SMTP_USERNAME").unwrap_or_default(),
        smtp_password: shared_auth::read_secret("SMTP_PASSWORD").unwrap_or_default(),
        from_email: std::env::var("FROM_EMAIL")
            .unwrap_or_else(|_| "noreply@gachavault.com".to_string()),
        frontend_url: std::env::var("FRONTEND_URL")
            .unwrap_or_else(|_| "http://localhost:3009".to_string()),
        internal_secret: shared_auth::read_secret("INTERNAL_SECRET")
            .expect("INTERNAL_SECRET required"),
    };

    let internal_routes = Router::new()
        .route(
            "/internal/send-verification",
            post(routes::send_verification),
        )
        .route(
            "/internal/send-password-reset",
            post(routes::send_password_reset),
        )
        .route("/internal/send-welcome", post(routes::send_welcome))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            shared_auth::verify_internal_secret::<AppState>,
        ));

    let app = Router::new()
        .route("/health", get(|| async { shared_server::health(SERVICE) }))
        .merge(internal_routes)
        .with_state(state);

    shared_server::serve(SERVICE, 3008, app).await;
}
