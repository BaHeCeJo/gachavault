use axum::{
    extract::{Query, State},
    response::Redirect,
};
use reqwest::Client;
use serde::Deserialize;
use shared_errors::{AppError, AppResult};
use sqlx::PgPool;

use crate::{db, routes::issue_tokens};

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct CallbackParams {
    pub code: Option<String>,
    pub error: Option<String>,
    pub state: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GoogleTokenResponse {
    access_token: String,
    token_type: String,
}

#[derive(Debug, Deserialize)]
struct GoogleUserInfo {
    id: String,
    email: String,
    name: Option<String>,
    picture: Option<String>,
}

pub async fn google_redirect() -> AppResult<Redirect> {
    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| AppError::Internal(anyhow::anyhow!("GOOGLE_CLIENT_ID not configured")))?;
    let redirect_uri = google_redirect_uri();

    let url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&access_type=offline",
        GOOGLE_AUTH_URL,
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
    );

    Ok(Redirect::temporary(&url))
}

pub async fn google_callback(
    State(pool): State<PgPool>,
    Query(params): Query<CallbackParams>,
) -> AppResult<Redirect> {
    let frontend_url =
        std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:3009".into());

    if let Some(err) = params.error {
        return Ok(Redirect::temporary(&format!(
            "{}/auth/login?error={}",
            frontend_url, err
        )));
    }

    let code = params
        .code
        .ok_or_else(|| AppError::BadRequest("Missing authorization code".into()))?;

    // Exchange code for access token
    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| AppError::Internal(anyhow::anyhow!("GOOGLE_CLIENT_ID not configured")))?;
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
        .map_err(|_| AppError::Internal(anyhow::anyhow!("GOOGLE_CLIENT_SECRET not configured")))?;
    let redirect_uri = google_redirect_uri();

    let http = Client::new();

    let token_res: GoogleTokenResponse = http
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Google token request failed: {}", e)))?
        .json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Google token parse failed: {}", e)))?;

    // Get user info from Google
    let user_info: GoogleUserInfo = http
        .get(GOOGLE_USERINFO_URL)
        .bearer_auth(&token_res.access_token)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Google userinfo request failed: {}", e)))?
        .json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Google userinfo parse failed: {}", e)))?;

    // Find or create user
    let user = db::find_or_create_google_user(
        &pool,
        &user_info.id,
        &user_info.email,
        user_info.name.as_deref(),
        user_info.picture.as_deref(),
    )
    .await
    .map_err(AppError::Database)?;

    // Issue tokens
    let tokens = issue_tokens(&pool, &user.id, &user.email, &user.username).await?;

    // Redirect to frontend with tokens in query params
    let redirect = format!(
        "{}/auth/google/callback?access_token={}&refresh_token={}",
        frontend_url, tokens.access_token, tokens.refresh_token
    );

    Ok(Redirect::temporary(&redirect))
}

fn google_redirect_uri() -> String {
    let base = std::env::var("BACKEND_URL").unwrap_or_else(|_| "http://localhost:3001".into());
    format!("{}/api/v1/auth/google/callback", base)
}
