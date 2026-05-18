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
    sqlx::query_as!(
        DbUser,
        "SELECT * FROM auth.users WHERE email = $1",
        email
    )
    .fetch_optional(pool)
    .await
}

pub async fn find_user_by_id(pool: &PgPool, id: Uuid) -> Result<Option<DbUser>, sqlx::Error> {
    sqlx::query_as!(
        DbUser,
        "SELECT * FROM auth.users WHERE id = $1",
        id
    )
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

pub async fn delete_refresh_tokens_for_user(pool: &PgPool, user_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM auth.refresh_tokens WHERE user_id = $1", user_id)
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
    sqlx::query!("DELETE FROM auth.email_verifications WHERE user_id = $1", user_id)
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
