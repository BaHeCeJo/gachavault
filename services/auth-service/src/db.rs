use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{DbRefreshToken, DbUser};

pub async fn create_user(
    pool: &PgPool,
    email: &str,
    username: &str,
    password_hash: &str,
) -> Result<DbUser, sqlx::Error> {
    sqlx::query_as!(
        DbUser,
        r#"INSERT INTO auth.users (email, username, password_hash)
           VALUES ($1, $2, $3)
           RETURNING *"#,
        email,
        username,
        password_hash,
    )
    .fetch_one(pool)
    .await
}

pub async fn find_user_by_email(pool: &PgPool, email: &str) -> Result<Option<DbUser>, sqlx::Error> {
    sqlx::query_as!(DbUser, "SELECT * FROM auth.users WHERE email = $1", email)
        .fetch_optional(pool)
        .await
}

pub async fn find_user_by_id(pool: &PgPool, id: Uuid) -> Result<Option<DbUser>, sqlx::Error> {
    sqlx::query_as!(DbUser, "SELECT * FROM auth.users WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn store_refresh_token(
    pool: &PgPool,
    user_id: Uuid,
    token_hash: &str,
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        user_id,
        token_hash,
        expires_at,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn find_and_delete_refresh_token(
    pool: &PgPool,
    token_hash: &str,
) -> Result<Option<DbRefreshToken>, sqlx::Error> {
    sqlx::query_as!(
        DbRefreshToken,
        "DELETE FROM auth.refresh_tokens WHERE token_hash = $1 AND expires_at > NOW() RETURNING *",
        token_hash
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_refresh_tokens_for_user(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM auth.refresh_tokens WHERE user_id = $1",
        user_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn store_email_verification(
    pool: &PgPool,
    user_id: Uuid,
    token_hash: &str,
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    // Delete any existing verification tokens for this user first
    sqlx::query!(
        "DELETE FROM auth.email_verifications WHERE user_id = $1",
        user_id
    )
    .execute(pool)
    .await?;
    sqlx::query!(
        "INSERT INTO auth.email_verifications (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        user_id,
        token_hash,
        expires_at,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn consume_email_verification_token(
    pool: &PgPool,
    token_hash: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    let row = sqlx::query!(
        "DELETE FROM auth.email_verifications
         WHERE token_hash = $1 AND expires_at > NOW()
         RETURNING user_id",
        token_hash
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.user_id))
}

pub async fn mark_email_verified(pool: &PgPool, user_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE auth.users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1",
        user_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn store_password_reset(
    pool: &PgPool,
    user_id: Uuid,
    token_hash: &str,
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    // Invalidate any existing reset tokens
    sqlx::query!(
        "UPDATE auth.password_resets SET used = TRUE WHERE user_id = $1 AND used = FALSE",
        user_id
    )
    .execute(pool)
    .await?;
    sqlx::query!(
        "INSERT INTO auth.password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        user_id,
        token_hash,
        expires_at,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn consume_password_reset_token(
    pool: &PgPool,
    token_hash: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    let row = sqlx::query!(
        "UPDATE auth.password_resets
         SET used = TRUE
         WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()
         RETURNING user_id",
        token_hash
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.user_id))
}

pub async fn update_password(
    pool: &PgPool,
    user_id: Uuid,
    password_hash: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE auth.users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
        password_hash,
        user_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Result of a Google OAuth login attempt.
///
/// `EmailConflict` means a password-based account with the same email already
/// exists but has never been linked to this Google identity. We refuse to
/// auto-link because the email match alone does not prove the Google user owns
/// the original account (an attacker who registers a Google account with the
/// victim's address — possible for self-hosted domains, or via Gmail aliasing
/// edge cases — would otherwise gain access without a password). The user must
/// log in with their password and link Google explicitly from settings.
pub enum GoogleLoginOutcome {
    User(DbUser),
    EmailConflict,
}

pub async fn find_or_create_google_user(
    pool: &PgPool,
    google_id: &str,
    email: &str,
    display_name: Option<&str>,
    avatar_url: Option<&str>,
) -> Result<GoogleLoginOutcome, sqlx::Error> {
    // Try to find by google_id first — already linked, normal sign-in.
    if let Some(user) = sqlx::query_as!(
        DbUser,
        "SELECT * FROM auth.users WHERE google_id = $1",
        google_id
    )
    .fetch_optional(pool)
    .await?
    {
        return Ok(GoogleLoginOutcome::User(user));
    }

    // An account with this email may exist from a password signup. Do NOT
    // auto-link it — return EmailConflict so the caller can route the user to
    // password login + manual link.
    let existing: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM auth.users WHERE email = $1")
        .bind(email)
        .fetch_optional(pool)
        .await?;
    if existing.is_some() {
        return Ok(GoogleLoginOutcome::EmailConflict);
    }

    // Create new Google user — derive username from display_name or email prefix
    let base_username = display_name
        .map(|n| n.to_lowercase().replace(' ', "_"))
        .unwrap_or_else(|| email.split('@').next().unwrap_or("user").to_string());

    // Make username unique by appending a random suffix if needed
    let username = make_unique_username(pool, &base_username).await?;

    let user = sqlx::query_as!(
        DbUser,
        r#"INSERT INTO auth.users (email, username, google_id, avatar_url, provider, email_verified)
           VALUES ($1, $2, $3, $4, 'google', TRUE)
           RETURNING *"#,
        email,
        username,
        google_id,
        avatar_url,
    )
    .fetch_one(pool)
    .await?;
    Ok(GoogleLoginOutcome::User(user))
}

async fn make_unique_username(pool: &PgPool, base: &str) -> Result<String, sqlx::Error> {
    // Sanitize: keep only alphanumeric and underscore, max 40 chars
    let base: String = base
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_')
        .take(40)
        .collect();
    let base = if base.len() < 3 {
        "user".to_string()
    } else {
        base
    };

    // Try base first, then add random suffix
    let exists: bool = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM auth.users WHERE username = $1)",
        base
    )
    .fetch_one(pool)
    .await?
    .unwrap_or(false);

    if !exists {
        return Ok(base);
    }

    for _ in 0..10 {
        let suffix: u32 = rand::random::<u32>() % 9000 + 1000;
        let candidate = format!("{}_{}", &base[..base.len().min(35)], suffix);
        let taken: bool = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM auth.users WHERE username = $1)",
            candidate
        )
        .fetch_one(pool)
        .await?
        .unwrap_or(false);

        if !taken {
            return Ok(candidate);
        }
    }

    // Fallback: uuid-based
    Ok(format!("user_{}", uuid::Uuid::new_v4().simple()))
}
