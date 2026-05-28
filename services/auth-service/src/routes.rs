use axum::{
    extract::State,
    http::{header::SET_COOKIE, HeaderMap},
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use shared_auth::{AuthUser, Claims};
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use sqlx::{PgPool, Row};

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

#[derive(Debug, Deserialize)]
pub struct UpdateAvatarRequest {
    pub avatar_url: String,
}

#[derive(Debug, Deserialize)]
pub struct SetRoleRequest {
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUsernameRequest {
    pub username: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct DeleteAccountRequest {
    pub password: Option<String>,
    /// For OAuth accounts (no password), the user must supply their own email
    /// address as an explicit confirmation that they intend to delete the account.
    pub confirm_email: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserSummary {
    pub id: uuid::Uuid,
    pub email: String,
    pub username: String,
    pub avatar_url: Option<String>,
    pub email_verified: bool,
    pub provider: String,
    pub role: String,
    pub created_at: chrono::DateTime<Utc>,
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
    headers: HeaderMap,
    Json(body): Json<RegisterRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    // Throttle by IP (broad) and by email (narrow). Email gate prevents the
    // same address from being recycled in retry loops; IP gate prevents one
    // host from registering many distinct accounts.
    let ip = client_ip(&headers);
    rate_limit(
        &format!("register_ip:{}", ip),
        5,
        3600,
        "Too many registrations from this IP. Try again in an hour.",
    )
    .await?;
    rate_limit(
        &format!("register_email:{}", body.email.to_lowercase()),
        2,
        86400,
        "Too many registrations for this email. Try again in 24 hours.",
    )
    .await?;

    // Basic validation
    if !is_valid_email(&body.email) {
        return Err(AppError::BadRequest("Invalid email address".into()));
    }
    if body.username.len() < 3 || body.username.len() > 50 {
        return Err(AppError::BadRequest(
            "Username must be 3–50 characters".into(),
        ));
    }
    if body.password.len() < 12 {
        return Err(AppError::BadRequest(
            "Password must be at least 12 characters".into(),
        ));
    }

    let password_hash = crypto::hash_password(&body.password).map_err(AppError::Internal)?;

    let user = db::create_user(
        &pool,
        &body.email.to_lowercase(),
        &body.username,
        &password_hash,
    )
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
) -> AppResult<impl IntoResponse> {
    let email = body.email.to_lowercase();

    check_login_throttle(&email).await?;

    let user = db::find_user_by_email(&pool, &email)
        .await
        .map_err(AppError::Database)?;

    // Always run argon2 even when the user doesn't exist so that response time
    // doesn't reveal whether an email address is registered (timing oracle).
    let dummy_hash = "$argon2id$v=19$m=19456,t=2,p=1$\
        AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    let hash_to_check = user
        .as_ref()
        .and_then(|u| u.password_hash.as_deref())
        .unwrap_or(dummy_hash);

    let valid =
        crypto::verify_password(&body.password, hash_to_check).map_err(AppError::Internal)?;

    let user = match user.filter(|_| valid) {
        Some(u) => u,
        None => {
            record_login_failure(&email).await;
            return Err(AppError::Unauthorized("Invalid email or password".into()));
        }
    };

    if user.password_hash.is_none() {
        return Err(AppError::Unauthorized(
            "This account uses social login".into(),
        ));
    }

    clear_login_failures(&email).await;

    let tokens = issue_tokens(&pool, &user.id, &user.email, &user.username).await?;
    let mut headers = HeaderMap::new();
    set_auth_cookie_headers(&mut headers, &tokens);
    Ok((
        headers,
        Json(ApiResponse::success(serde_json::json!({
            "message": "Login successful"
        }))),
    ))
}

pub async fn refresh(
    State(pool): State<PgPool>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    // Per-IP throttle on refresh. Defends against an attacker spraying stolen
    // refresh tokens through the same exit IP; nginx also rate-limits this
    // endpoint at the edge for additional defense-in-depth.
    let ip = client_ip(&headers);
    rate_limit(
        &format!("refresh_ip:{}", ip),
        60,
        3600,
        "Too many refresh attempts. Try again later.",
    )
    .await?;

    let refresh_token_val = extract_cookie(&headers, "refresh_token")
        .ok_or_else(|| AppError::Unauthorized("No refresh token".into()))?;

    let token_hash = crypto::hash_token(&refresh_token_val);

    let stored = db::find_and_delete_refresh_token(&pool, &token_hash)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::Unauthorized("Invalid or expired refresh token".into()))?;

    let user = db::find_user_by_id(&pool, stored.user_id)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::Unauthorized("User not found".into()))?;

    let tokens = issue_tokens(&pool, &user.id, &user.email, &user.username).await?;
    let mut resp_headers = HeaderMap::new();
    set_auth_cookie_headers(&mut resp_headers, &tokens);
    Ok((
        resp_headers,
        Json(ApiResponse::success(serde_json::json!({ "message": "ok" }))),
    ))
}

pub async fn logout(State(pool): State<PgPool>, auth: AuthUser) -> AppResult<impl IntoResponse> {
    db::delete_refresh_tokens_for_user(&pool, auth.id())
        .await
        .map_err(AppError::Database)?;
    revoke_jti(&auth.0.jti, auth.0.exp).await;
    let mut headers = HeaderMap::new();
    clear_auth_cookie_headers(&mut headers);
    Ok((headers, Json(ApiResponse::success(()))))
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
    headers: HeaderMap,
    Json(body): Json<ForgotPasswordRequest>,
) -> AppResult<Json<ApiResponse<()>>> {
    // Throttle by IP (broad) and by email (narrow). The email cap stops an
    // attacker from spamming reset emails to one victim; the IP cap stops
    // enumeration sweeps from one host.
    let ip = client_ip(&headers);
    rate_limit(
        &format!("forgot_pw_ip:{}", ip),
        10,
        3600,
        "Too many password reset requests from this IP.",
    )
    .await?;
    rate_limit(
        &format!("forgot_pw_email:{}", body.email.to_lowercase()),
        3,
        3600,
        "Too many password reset requests for this email.",
    )
    .await?;

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
    if body.password.len() < 12 {
        return Err(AppError::BadRequest(
            "Password must be at least 12 characters".into(),
        ));
    }

    let token_hash = crypto::hash_token(&body.token);

    let user_id = db::consume_password_reset_token(&pool, &token_hash)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::BadRequest("Invalid or expired reset token".into()))?;

    let password_hash = crypto::hash_password(&body.password).map_err(AppError::Internal)?;

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
        "role": auth.role(),
        "created_at": user.created_at,
    }))))
}

pub async fn update_avatar(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<UpdateAvatarRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    if body.avatar_url.len() > 2048 {
        return Err(AppError::BadRequest("avatar_url too long".into()));
    }
    if !body.avatar_url.starts_with("https://") {
        return Err(AppError::BadRequest(
            "avatar_url must be an https:// URL".into(),
        ));
    }

    sqlx::query("UPDATE auth.users SET avatar_url = $1, updated_at = NOW() WHERE id = $2")
        .bind(&body.avatar_url)
        .bind(auth.id())
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(
        serde_json::json!({ "avatar_url": body.avatar_url }),
    )))
}

pub async fn list_users(
    State(pool): State<PgPool>,
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<Vec<UserSummary>>>> {
    if !auth.is_admin() {
        return Err(AppError::Forbidden("Admin access required".into()));
    }

    let rows = sqlx::query(
        "SELECT u.id, u.email, u.username, u.avatar_url, u.email_verified, u.provider, u.created_at, \
         COALESCE(r.role, 'user') AS role \
         FROM auth.users u \
         LEFT JOIN auth.user_roles r ON r.user_id = u.id AND r.game_id IS NULL AND r.section_id IS NULL \
         ORDER BY u.created_at DESC LIMIT 500",
    )
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    let users: Vec<UserSummary> = rows
        .iter()
        .map(|row| UserSummary {
            id: row.get("id"),
            email: row.get("email"),
            username: row.get("username"),
            avatar_url: row.get("avatar_url"),
            email_verified: row.get("email_verified"),
            provider: row.get("provider"),
            role: row.get("role"),
            created_at: row.get("created_at"),
        })
        .collect();

    Ok(Json(ApiResponse::success(users)))
}

pub async fn set_user_role(
    State(pool): State<PgPool>,
    auth: AuthUser,
    axum::extract::Path(user_id): axum::extract::Path<uuid::Uuid>,
    Json(body): Json<SetRoleRequest>,
) -> AppResult<Json<ApiResponse<()>>> {
    if !auth.is_admin() {
        return Err(AppError::Forbidden("Admin access required".into()));
    }
    // Prevent self-promotion
    if auth.id() == user_id {
        return Err(AppError::Forbidden("Cannot change your own role".into()));
    }
    let valid_roles = ["user", "editor", "admin", "superadmin"];
    if !valid_roles.contains(&body.role.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Invalid role '{}'. Valid: {}",
            body.role,
            valid_roles.join(", ")
        )));
    }
    // Only superadmins may grant the superadmin role
    if body.role == "superadmin" && auth.role() != "superadmin" {
        return Err(AppError::Forbidden(
            "Only superadmins may grant the superadmin role".into(),
        ));
    }

    // Remove any existing global role
    sqlx::query(
        "DELETE FROM auth.user_roles WHERE user_id = $1 AND game_id IS NULL AND section_id IS NULL",
    )
    .bind(user_id)
    .execute(&pool)
    .await
    .map_err(AppError::Database)?;

    // Insert new role (unless 'user' which is the default — no DB row needed)
    if body.role != "user" {
        sqlx::query("INSERT INTO auth.user_roles (user_id, role, granted_by) VALUES ($1, $2, $3)")
            .bind(user_id)
            .bind(&body.role)
            .bind(auth.id())
            .execute(&pool)
            .await
            .map_err(AppError::Database)?;
    }

    Ok(Json(ApiResponse::success(())))
}

pub async fn update_username(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<UpdateUsernameRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    if body.username.len() < 3 || body.username.len() > 50 {
        return Err(AppError::BadRequest(
            "Username must be 3–50 characters".into(),
        ));
    }
    if !body
        .username
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_')
    {
        return Err(AppError::BadRequest(
            "Username may only contain letters, numbers, and underscores".into(),
        ));
    }

    sqlx::query("UPDATE auth.users SET username = $1, updated_at = NOW() WHERE id = $2")
        .bind(&body.username)
        .bind(auth.id())
        .execute(&pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(db_err) if db_err.constraint() == Some("users_username_key") => {
                AppError::Conflict("Username already taken".into())
            }
            other => AppError::Database(other),
        })?;

    Ok(Json(ApiResponse::success(
        serde_json::json!({ "username": body.username }),
    )))
}

pub async fn change_password(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<ChangePasswordRequest>,
) -> AppResult<impl IntoResponse> {
    if body.new_password.len() < 12 {
        return Err(AppError::BadRequest(
            "New password must be at least 12 characters".into(),
        ));
    }

    let user = db::find_user_by_id(&pool, auth.id())
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    let password_hash = user.password_hash.as_deref().ok_or_else(|| {
        AppError::BadRequest("This account uses social login — password cannot be changed".into())
    })?;

    let valid = crypto::verify_password(&body.current_password, password_hash)
        .map_err(AppError::Internal)?;
    if !valid {
        return Err(AppError::Unauthorized(
            "Current password is incorrect".into(),
        ));
    }

    let new_hash = crypto::hash_password(&body.new_password).map_err(AppError::Internal)?;

    db::update_password(&pool, auth.id(), &new_hash)
        .await
        .map_err(AppError::Database)?;

    db::delete_refresh_tokens_for_user(&pool, auth.id())
        .await
        .map_err(AppError::Database)?;
    revoke_jti(&auth.0.jti, auth.0.exp).await;

    let mut headers = HeaderMap::new();
    clear_auth_cookie_headers(&mut headers);
    Ok((headers, Json(ApiResponse::success(()))))
}

pub async fn delete_account(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<DeleteAccountRequest>,
) -> AppResult<impl IntoResponse> {
    let user = db::find_user_by_id(&pool, auth.id())
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    if let Some(password_hash) = user.password_hash.as_deref() {
        let provided = body.password.as_deref().unwrap_or("");
        let valid = crypto::verify_password(provided, password_hash).map_err(AppError::Internal)?;
        if !valid {
            return Err(AppError::Unauthorized("Password is incorrect".into()));
        }
    } else {
        // OAuth account — require the user to confirm their email address
        let confirmed = body.confirm_email.as_deref().unwrap_or("");
        if confirmed != user.email {
            return Err(AppError::BadRequest(
                "Please confirm your email address to delete your account".into(),
            ));
        }
    }

    db::delete_refresh_tokens_for_user(&pool, auth.id())
        .await
        .map_err(AppError::Database)?;
    revoke_jti(&auth.0.jti, auth.0.exp).await;

    sqlx::query("DELETE FROM auth.users WHERE id = $1")
        .bind(auth.id())
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;

    let mut headers = HeaderMap::new();
    clear_auth_cookie_headers(&mut headers);
    Ok((headers, Json(ApiResponse::success(()))))
}

// ── Per-game roles ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct GameRoleEntry {
    pub game_id: uuid::Uuid,
    pub section_id: Option<uuid::Uuid>,
    pub role: String,
    pub granted_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SetGameRoleRequest {
    pub game_id: uuid::Uuid,
    pub section_id: Option<uuid::Uuid>,
    pub role: String,
}

pub async fn list_user_game_roles(
    State(pool): State<PgPool>,
    auth: AuthUser,
    axum::extract::Path(user_id): axum::extract::Path<uuid::Uuid>,
) -> AppResult<Json<ApiResponse<Vec<GameRoleEntry>>>> {
    if !auth.is_admin() && auth.id() != user_id {
        return Err(AppError::Forbidden("Admin access required".into()));
    }
    let rows = sqlx::query(
        "SELECT game_id, section_id, role, created_at \
         FROM auth.user_roles WHERE user_id = $1 AND game_id IS NOT NULL \
         ORDER BY created_at DESC",
    )
    .bind(user_id)
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    let entries: Vec<GameRoleEntry> = rows
        .iter()
        .map(|r| GameRoleEntry {
            game_id: r.get("game_id"),
            section_id: r.get("section_id"),
            role: r.get("role"),
            granted_at: r.get("created_at"),
        })
        .collect();

    Ok(Json(ApiResponse::success(entries)))
}

pub async fn set_user_game_role(
    State(pool): State<PgPool>,
    auth: AuthUser,
    axum::extract::Path(user_id): axum::extract::Path<uuid::Uuid>,
    Json(body): Json<SetGameRoleRequest>,
) -> AppResult<Json<ApiResponse<()>>> {
    if !auth.is_admin() {
        return Err(AppError::Forbidden("Admin access required".into()));
    }
    let valid = ["game_admin", "game_editor", "section_editor", "contributor"];
    if !valid.contains(&body.role.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Invalid game role '{}'. Valid: {}",
            body.role,
            valid.join(", ")
        )));
    }

    // Remove existing role for same game+section scope
    match body.section_id {
        Some(sid) => {
            sqlx::query(
                "DELETE FROM auth.user_roles WHERE user_id=$1 AND game_id=$2 AND section_id=$3",
            )
            .bind(user_id)
            .bind(body.game_id)
            .bind(sid)
            .execute(&pool)
            .await
            .map_err(AppError::Database)?;

            sqlx::query(
                "INSERT INTO auth.user_roles (user_id, game_id, section_id, role, granted_by) \
                 VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(user_id)
            .bind(body.game_id)
            .bind(sid)
            .bind(&body.role)
            .bind(auth.id())
            .execute(&pool)
            .await
            .map_err(AppError::Database)?;
        }
        None => {
            sqlx::query(
                "DELETE FROM auth.user_roles WHERE user_id=$1 AND game_id=$2 AND section_id IS NULL",
            )
            .bind(user_id).bind(body.game_id)
            .execute(&pool).await.map_err(AppError::Database)?;

            sqlx::query(
                "INSERT INTO auth.user_roles (user_id, game_id, section_id, role, granted_by) \
                 VALUES ($1, $2, NULL, $3, $4)",
            )
            .bind(user_id)
            .bind(body.game_id)
            .bind(&body.role)
            .bind(auth.id())
            .execute(&pool)
            .await
            .map_err(AppError::Database)?;
        }
    }

    Ok(Json(ApiResponse::success(())))
}

pub async fn remove_user_game_role(
    State(pool): State<PgPool>,
    auth: AuthUser,
    axum::extract::Path((user_id, game_id)): axum::extract::Path<(uuid::Uuid, uuid::Uuid)>,
) -> AppResult<Json<ApiResponse<()>>> {
    if !auth.is_admin() {
        return Err(AppError::Forbidden("Admin access required".into()));
    }
    sqlx::query("DELETE FROM auth.user_roles WHERE user_id=$1 AND game_id=$2")
        .bind(user_id)
        .bind(game_id)
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(())))
}

pub async fn get_user_by_username(
    State(pool): State<PgPool>,
    axum::extract::Path(username): axum::extract::Path<String>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let row = sqlx::query(
        "SELECT id, username, avatar_url, created_at FROM auth.users WHERE username = $1",
    )
    .bind(&username)
    .fetch_optional(&pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "id": row.get::<uuid::Uuid, _>("id"),
        "username": row.get::<String, _>("username"),
        "avatar_url": row.get::<Option<String>, _>("avatar_url"),
        "created_at": row.get::<chrono::DateTime<Utc>, _>("created_at"),
    }))))
}

pub async fn get_admin_stats(
    State(pool): State<PgPool>,
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    if !auth.is_admin() {
        return Err(AppError::Forbidden("Admin access required".into()));
    }

    let (total, verified, google, new_30d): (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT
            COUNT(*)::bigint,
            COUNT(*) FILTER (WHERE email_verified = true)::bigint,
            COUNT(*) FILTER (WHERE provider = 'google')::bigint,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::bigint
         FROM auth.users",
    )
    .fetch_one(&pool)
    .await
    .map_err(AppError::Database)?;

    let games: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM games.games")
        .fetch_one(&pool)
        .await
        .map_err(AppError::Database)?;
    let sections: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM games.sections")
        .fetch_one(&pool)
        .await
        .map_err(AppError::Database)?;
    let items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items.items")
        .fetch_one(&pool)
        .await
        .map_err(AppError::Database)?;
    let tierlists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tierlists.tier_lists")
        .fetch_one(&pool)
        .await
        .map_err(AppError::Database)?;
    let public_tierlists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM tierlists.tier_lists WHERE is_public = TRUE")
            .fetch_one(&pool)
            .await
            .map_err(AppError::Database)?;
    let collections: i64 =
        sqlx::query_scalar("SELECT COUNT(DISTINCT user_id) FROM collections.entries")
            .fetch_one(&pool)
            .await
            .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "total_users":      total,
        "verified_users":   verified,
        "google_users":     google,
        "new_users_30d":    new_30d,
        "games":            games,
        "sections":         sections,
        "items":            items,
        "tierlists":        tierlists,
        "public_tierlists": public_tierlists,
        "collectors":       collections,
    }))))
}

pub async fn revoke_all_sessions(
    State(pool): State<PgPool>,
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<()>>> {
    if auth.role() != "superadmin" {
        return Err(AppError::Forbidden("Superadmin access required".into()));
    }

    sqlx::query("DELETE FROM auth.refresh_tokens")
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;

    if let Some(mut conn) = get_redis_conn().await {
        let cutoff = Utc::now().timestamp();
        let _: redis::RedisResult<()> = redis::cmd("SET")
            .arg("session_invalidation_cutoff")
            .arg(cutoff)
            .query_async(&mut conn)
            .await;
    }

    Ok(Json(ApiResponse::success(())))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn is_valid_email(email: &str) -> bool {
    let email = email.trim();
    if email.len() > 254 {
        return false;
    }
    // Must have exactly one '@' with a non-empty local part
    let at = match email.rfind('@') {
        Some(i) if i > 0 => i,
        _ => return false,
    };
    let (local, domain) = (&email[..at], &email[at + 1..]);
    if local.is_empty() || local.len() > 64 {
        return false;
    }
    // Domain must have at least one dot and no leading/trailing dots or hyphens
    domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && !domain.starts_with('-')
        && !domain.ends_with('-')
        && !domain.is_empty()
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

pub fn set_auth_cookie_headers(headers: &mut HeaderMap, tokens: &AuthTokens) {
    let access = format!(
        "access_token={}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900",
        tokens.access_token
    );
    let refresh = format!(
        "refresh_token={}; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh; Max-Age=604800",
        tokens.refresh_token
    );
    if let Ok(v) = access.parse() {
        headers.append(SET_COOKIE, v);
    }
    if let Ok(v) = refresh.parse() {
        headers.append(SET_COOKIE, v);
    }
}

pub fn clear_auth_cookie_headers(headers: &mut HeaderMap) {
    let clear_access = "access_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
    let clear_refresh =
        "refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh; Max-Age=0";
    if let Ok(v) = clear_access.parse() {
        headers.append(SET_COOKIE, v);
    }
    if let Ok(v) = clear_refresh.parse() {
        headers.append(SET_COOKIE, v);
    }
}

fn extract_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let cookie_str = headers.get("cookie")?.to_str().ok()?;
    cookie_str.split(';').find_map(|part| {
        let (k, v) = part.trim().split_once('=')?;
        (k.trim() == name).then(|| v.trim().to_string())
    })
}

async fn get_redis_conn() -> Option<redis::aio::MultiplexedConnection> {
    let url = shared_auth::read_secret("REDIS_URL").ok()?;
    let client = redis::Client::open(url).ok()?;
    client.get_multiplexed_async_connection().await.ok()
}

async fn check_login_throttle(email: &str) -> AppResult<()> {
    let Some(mut conn) = get_redis_conn().await else {
        return Ok(()); // fail open if Redis unavailable
    };
    let key = format!("login_fail:{}", email);
    let count: i64 = conn.get(&key).await.unwrap_or(0);
    if count >= 10 {
        return Err(AppError::TooManyRequests(
            "Too many failed login attempts. Try again in 15 minutes.".into(),
        ));
    }
    Ok(())
}

async fn record_login_failure(email: &str) {
    let Some(mut conn) = get_redis_conn().await else {
        return;
    };
    let key = format!("login_fail:{}", email);
    let count: i64 = conn.incr(&key, 1i64).await.unwrap_or(1);
    if count == 1 {
        let _: redis::RedisResult<()> = conn.expire(&key, 900i64).await;
    }
}

async fn clear_login_failures(email: &str) {
    let Some(mut conn) = get_redis_conn().await else {
        return;
    };
    let key = format!("login_fail:{}", email);
    let _: redis::RedisResult<()> = conn.del(&key).await;
}

/// Returns the first non-empty IP from X-Forwarded-For, falling back to
/// X-Real-IP. Both are set by the nginx reverse proxy. Used as a coarse rate
/// limit key — spoofable if the gateway is bypassed, so always pair with a
/// secondary key (e.g. email).
fn client_ip(headers: &HeaderMap) -> String {
    if let Some(v) = headers.get("x-forwarded-for").and_then(|h| h.to_str().ok()) {
        if let Some(first) = v.split(',').next() {
            let ip = first.trim();
            if !ip.is_empty() {
                return ip.to_string();
            }
        }
    }
    headers
        .get("x-real-ip")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Increment a Redis counter under `key`, set a TTL on the first hit, and
/// reject the request if the counter exceeds `limit`. Fails open on Redis
/// outage to avoid taking the whole site down if Redis is the broken thing.
async fn rate_limit(key: &str, limit: i64, window_secs: i64, message: &str) -> AppResult<()> {
    let Some(mut conn) = get_redis_conn().await else {
        return Ok(());
    };
    let count: i64 = conn.incr(key, 1i64).await.unwrap_or(0);
    if count == 1 {
        let _: redis::RedisResult<()> = conn.expire(key, window_secs).await;
    }
    if count > limit {
        return Err(AppError::TooManyRequests(message.into()));
    }
    Ok(())
}

async fn revoke_jti(jti: &str, exp: usize) {
    let Ok(redis_url) = shared_auth::read_secret("REDIS_URL") else {
        return;
    };
    let Ok(client) = redis::Client::open(redis_url) else {
        return;
    };
    let Ok(mut conn) = client.get_multiplexed_async_connection().await else {
        return;
    };
    let remaining = (exp as i64) - chrono::Utc::now().timestamp();
    if remaining > 0 {
        let _: redis::RedisResult<()> = redis::cmd("SET")
            .arg(format!("revoked:{}", jti))
            .arg(1i32)
            .arg("EX")
            .arg(remaining)
            .query_async(&mut conn)
            .await;
    }
}

pub async fn issue_tokens(
    pool: &PgPool,
    user_id: &uuid::Uuid,
    email: &str,
    username: &str,
) -> AppResult<AuthTokens> {
    let jwt_secret = shared_auth::read_secret("JWT_SECRET").expect("JWT_SECRET required");
    let expiry_seconds: i64 = std::env::var("JWT_EXPIRY_SECONDS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(900);
    let refresh_expiry_days: i64 = std::env::var("REFRESH_TOKEN_EXPIRY_DAYS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(7);

    // Lookup global role (no DB row = default user)
    let role: String = sqlx::query(
        "SELECT role FROM auth.user_roles WHERE user_id = $1 AND game_id IS NULL AND section_id IS NULL LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .and_then(|r| r.try_get::<String, _>("role").ok())
    .unwrap_or_else(|| "user".to_string());

    // Issue JWT
    let claims = Claims::new(
        *user_id,
        email.to_string(),
        username.to_string(),
        role,
        expiry_seconds,
    );
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
