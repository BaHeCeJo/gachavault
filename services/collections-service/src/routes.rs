use axum::{extract::{Path, State}, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use shared_auth::AuthUser;
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbEntry {
    pub id: Uuid,
    pub user_id: Uuid,
    pub item_id: Uuid,
    pub game_id: Uuid,
    pub owned: bool,
    pub constellation_level: Option<i32>,
    pub level: Option<i32>,
    pub ascension: Option<i32>,
    pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertEntryRequest {
    pub game_id: Uuid,
    pub owned: Option<bool>,
    pub constellation_level: Option<i32>,
    pub level: Option<i32>,
    pub ascension: Option<i32>,
}

pub async fn get_my_collection(
    State(pool): State<PgPool>,
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<Vec<DbEntry>>>> {
    let entries = sqlx::query_as!(
        DbEntry,
        "SELECT * FROM collections.entries WHERE user_id = $1 ORDER BY updated_at DESC",
        auth.id()
    )
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(entries)))
}

pub async fn get_collection_by_game(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(game_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<DbEntry>>>> {
    let entries = sqlx::query_as!(
        DbEntry,
        "SELECT * FROM collections.entries WHERE user_id = $1 AND game_id = $2 ORDER BY updated_at DESC",
        auth.id(),
        game_id
    )
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(entries)))
}

pub async fn get_user_collection(
    State(pool): State<PgPool>,
    Path(user_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<DbEntry>>>> {
    let entries = sqlx::query_as!(
        DbEntry,
        "SELECT * FROM collections.entries WHERE user_id = $1 ORDER BY updated_at DESC",
        user_id
    )
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(entries)))
}

pub async fn upsert_entry(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(item_id): Path<Uuid>,
    Json(body): Json<UpsertEntryRequest>,
) -> AppResult<Json<ApiResponse<DbEntry>>> {
    if let Some(lvl) = body.constellation_level {
        if !(0..=6).contains(&lvl) {
            return Err(AppError::BadRequest("constellation_level must be 0–6".into()));
        }
    }
    if let Some(lvl) = body.level {
        if !(1..=90).contains(&lvl) {
            return Err(AppError::BadRequest("level must be 1–90".into()));
        }
    }
    if let Some(asc) = body.ascension {
        if !(0..=6).contains(&asc) {
            return Err(AppError::BadRequest("ascension must be 0–6".into()));
        }
    }

    let entry = sqlx::query_as!(
        DbEntry,
        r#"INSERT INTO collections.entries (user_id, item_id, game_id, owned, constellation_level, level, ascension)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id, item_id) DO UPDATE SET
               owned = COALESCE(EXCLUDED.owned, collections.entries.owned),
               constellation_level = COALESCE($5, collections.entries.constellation_level),
               level = COALESCE($6, collections.entries.level),
               ascension = COALESCE($7, collections.entries.ascension),
               updated_at = NOW()
           RETURNING *"#,
        auth.id(),
        item_id,
        body.game_id,
        body.owned.unwrap_or(true),
        body.constellation_level,
        body.level,
        body.ascension,
    )
    .fetch_one(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(entry)))
}

pub async fn delete_entry(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(item_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<()>>> {
    let result = sqlx::query!(
        "DELETE FROM collections.entries WHERE user_id = $1 AND item_id = $2",
        auth.id(),
        item_id
    )
    .execute(&pool)
    .await
    .map_err(AppError::Database)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Collection entry not found".into()));
    }

    Ok(Json(ApiResponse::success(())))
}
