use axum::{extract::State, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use shared_auth::{AuthUser, Claims};
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use sqlx::PgPool;

use crate::{crypto, db, notifications};

// ── Request / Response types ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyEmailRequest {
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
}

// ── Handlers ────────────────────────────────────────────────────────────────

pub async fn register(
    State(pool): State<PgPool>,
    Json(body): Json<RegisterRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    // Basic validation
    if body.email.is_empty() || !body.email.contains('@') {
        return Err(AppError::BadRequest("Invalid email address".into()));
    }
    if body.username.len() < 3 || body.username.len() > 50 {
        return Err(AppError::BadRequest("Username must be 3–50 characters".into()));
    }
    if body.password.len() < 8 {
        return Err(AppError::BadRequest("Password must be at least 8 characters".into()));
    }

    let password_hash = crypto::hash_password(&body.password)
        .map_err(|e| AppError::Internal(e))?;

    let user = db::create_user(&pool, &body.email.to_lowercase(), &body.username, &password_hash)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(db_err) if db_err.constraint() == Some("users_email_key") => {
                AppError::Conflict("Email already in use".into())
            }
            sqlx::Error::Database(db_err) if db_err.constraint() == Some("users_username_key") => {
                AppError::Conflict("Username already taken".into())
            }
            other => AppError::Database(other),
        })?;

    // Generate and store email verification token
    let token = crypto::generate_token();
    let token_hash = crypto::hash_token(&token);
    let expires_at = Utc::now() + chrono::Duration::hours(24);

    db::store_email_verification(&pool, user.id, &token_hash, expires_at)
        .await
        .map_err(AppError::Database)?;

    // Send verification email (non-blocking — don't fail registration if email fails)
    let notifications_url = std::env::var("NOTIFICATIONS_SERVICE_URL")
        .unwrap_or_else(|_| "http://localhost:3008".into());
    tokio::spawn(notifications::send_verification(
        notifications_url,
        user.email.clone(),
        user.username.clone(),
        token,
    ));

    Ok(Json(ApiResponse::success(serde_json::json!({
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "email_verified": false,
        "message": "Registration successful. Please check your email to verify your account."
    }))))
}

pub async fn login(
    State(pool): State<PgPool>,
    Json(body): Json<LoginRequest>,
) -> AppResult<Json<ApiResponse<AuthTokens>>> {
    let user = db::find_user_by_email(&pool, &body.email.to_lowercase())
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::Unauthorized("Invalid email or password".into()))?;

    let password_hash = user.password_hash
        .as_deref()
        .ok_or_else(|| AppError::Unauthorized("This account uses social login".into()))?;

    let valid = crypto::verify_password(&body.password, password_hash)
        .map_err(|e| AppError::Internal(e))?;

    if !valid {
        return Err(AppError::Unauthorized("Invalid email or password".into()));
    }

    let tokens = issue_tokens(&pool, &user.id, &user.email, &user.username).await?;
    Ok(Json(ApiResponse::success(tokens)))
}

pub async fn refresh(
    State(pool): State<PgPool>,
    Json(body): Json<RefreshRequest>,
) -> AppResult<Json<ApiResponse<AuthTokens>>> {
    let token_hash = crypto::hash_token(&body.refresh_token);

    let stored = db::find_and_delete_refresh_token(&pool, &token_hash)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::Unauthorized("Invalid or expired refresh token".into()))?;

    let user = db::find_user_by_id(&pool, stored.user_id)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::Unauthorized("User not found".into()))?;

    let tokens = issue_tokens(&pool, &user.id, &user.email, &user.username).await?;
    Ok(Json(ApiResponse::success(tokens)))
}

pub async fn logout(
    State(pool): State<PgPool>,
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<()>>> {
    db::delete_refresh_tokens_for_user(&pool, auth.id())
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(())))
}

pub async fn verify_email(
    State(pool): State<PgPool>,
    Json(body): Json<VerifyEmailRequest>,
) -> AppResult<Json<ApiResponse<()>>> {
    let token_hash = crypto::hash_token(&body.token);

    let user_id = db::consume_email_verification_token(&pool, &token_hash)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::BadRequest("Invalid or expired verification token".into()))?;

    db::mark_email_verified(&pool, user_id)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(())))
}

pub async fn forgot_password(
    State(pool): State<PgPool>,
    Json(body): Json<ForgotPasswordRequest>,
) -> AppResult<Json<ApiResponse<()>>> {
    // Always return success to prevent email enumeration
    let user = db::find_user_by_email(&pool, &body.email.to_lowercase())
        .await
        .map_err(AppError::Database)?;

    if let Some(user) = user {
        let token = crypto::generate_token();
        let token_hash = crypto::hash_token(&token);
        let expires_at = Utc::now() + chrono::Duration::hours(1);

        db::store_password_reset(&pool, user.id, &token_hash, expires_at)
            .await
            .map_err(AppError::Database)?;

        let notifications_url = std::env::var("NOTIFICATIONS_SERVICE_URL")
            .unwrap_or_else(|_| "http://localhost:3008".into());
        tokio::spawn(notifications::send_password_reset(
            notifications_url,
            user.email,
            user.username,
            token,
        ));
    }

    Ok(Json(ApiResponse::success(())))
}

pub async fn reset_password(
    State(pool): State<PgPool>,
    Json(body): Json<ResetPasswordRequest>,
) -> AppResult<Json<ApiResponse<()>>> {
    if body.password.len() < 8 {
        return Err(AppError::BadRequest("Password must be at least 8 characters".into()));
    }

    let token_hash = crypto::hash_token(&body.token);

    let user_id = db::consume_password_reset_token(&pool, &token_hash)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::BadRequest("Invalid or expired reset token".into()))?;

    let password_hash = crypto::hash_password(&body.password)
        .map_err(|e| AppError::Internal(e))?;

    db::update_password(&pool, user_id, &password_hash)
        .await
        .map_err(AppError::Database)?;

    // Invalidate all sessions after password reset
    db::delete_refresh_tokens_for_user(&pool, user_id)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(())))
}

pub async fn me(
    State(pool): State<PgPool>,
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let user = db::find_user_by_id(&pool, auth.id())
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "avatar_url": user.avatar_url,
        "email_verified": user.email_verified,
        "provider": user.provider,
        "created_at": user.created_at,
    }))))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async fn issue_tokens(
    pool: &PgPool,
    user_id: &uuid::Uuid,
    email: &str,
    username: &str,
) -> AppResult<AuthTokens> {
    let jwt_secret = std::env::var("JWT_SECRET").expect("JWT_SECRET required");
    let expiry_seconds: i64 = std::env::var("JWT_EXPIRY_SECONDS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(900);
    let refresh_expiry_days: i64 = std::env::var("REFRESH_TOKEN_EXPIRY_DAYS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(7);

    // Issue JWT
    let claims = Claims::new(*user_id, email.to_string(), username.to_string(), expiry_seconds);
    let access_token = claims
        .encode(&jwt_secret)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to sign JWT: {}", e)))?;

    // Issue refresh token
    let refresh_token = crypto::generate_token();
    let refresh_hash = crypto::hash_token(&refresh_token);
    let refresh_expires_at = Utc::now() + chrono::Duration::days(refresh_expiry_days);

    db::store_refresh_token(pool, *user_id, &refresh_hash, refresh_expires_at)
        .await
        .map_err(AppError::Database)?;

    Ok(AuthTokens {
        access_token,
        refresh_token,
        token_type: "Bearer".into(),
        expires_in: expiry_seconds,
    })
}
