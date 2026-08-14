use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use shared_auth::AuthUser;
use shared_errors::{AppError, AppResult};
use shared_types::{ApiResponse, PaginationQuery};
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

/// What a public profile is allowed to know about someone's collection: how
/// many items they own, per game. Never which ones.
#[derive(Debug, Serialize)]
pub struct GameOwnedCount {
    pub game_id: Uuid,
    pub owned_count: i64,
}

#[derive(Debug, Serialize)]
pub struct PublicCollectionStats {
    /// False when the user hasn't opted in — the page shows nothing shared
    /// rather than an error, and `games` is empty.
    pub is_public: bool,
    pub total_owned: i64,
    pub games: Vec<GameOwnedCount>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VisibilityResponse {
    pub collection_public: bool,
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
    Query(pagination): Query<PaginationQuery>,
) -> AppResult<Json<ApiResponse<Vec<DbEntry>>>> {
    // Cap unbounded reads — a power user with thousands of items used to
    // serialise the whole set on every page load. Default page size is 20
    // (PaginationQuery::DEFAULT_PER_PAGE), max 100.
    let entries: Vec<DbEntry> = sqlx::query_as(
        "SELECT * FROM collections.entries \
         WHERE user_id = $1 \
         ORDER BY updated_at DESC \
         LIMIT $2 OFFSET $3",
    )
    .bind(auth.id())
    .bind(pagination.limit())
    .bind(pagination.offset())
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

/// Per-game owned counts for a user's public profile.
///
/// Deliberately not `get_user_collection` with the auth check relaxed. This is
/// the one collections endpoint anyone may call, so it returns only totals —
/// never the entries, their levels, or which items they are. And it answers
/// only for users who opted in: no row in collections.visibility, or the flag
/// off, reads as private and yields empty stats rather than 403, since "this
/// profile shares nothing" is a normal state for a public page, not an error.
pub async fn get_public_collection_stats(
    State(pool): State<PgPool>,
    Path(user_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<PublicCollectionStats>>> {
    let public: Option<(bool,)> =
        sqlx::query_as("SELECT collection_public FROM collections.visibility WHERE user_id = $1")
            .bind(user_id)
            .fetch_optional(&pool)
            .await
            .map_err(AppError::Database)?;

    if !matches!(public, Some((true,))) {
        return Ok(Json(ApiResponse::success(PublicCollectionStats {
            is_public: false,
            total_owned: 0,
            games: vec![],
        })));
    }

    let rows: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT game_id, COUNT(*) FROM collections.entries \
         WHERE user_id = $1 AND owned = TRUE \
         GROUP BY game_id",
    )
    .bind(user_id)
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    let games: Vec<GameOwnedCount> = rows
        .into_iter()
        .map(|(game_id, owned_count)| GameOwnedCount {
            game_id,
            owned_count,
        })
        .collect();

    Ok(Json(ApiResponse::success(PublicCollectionStats {
        is_public: true,
        total_owned: games.iter().map(|g| g.owned_count).sum(),
        games,
    })))
}

/// The caller's own visibility setting. Absent row = private.
pub async fn get_visibility(
    State(pool): State<PgPool>,
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<VisibilityResponse>>> {
    let row: Option<(bool,)> =
        sqlx::query_as("SELECT collection_public FROM collections.visibility WHERE user_id = $1")
            .bind(auth.id())
            .fetch_optional(&pool)
            .await
            .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(VisibilityResponse {
        collection_public: matches!(row, Some((true,))),
    })))
}

pub async fn set_visibility(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<VisibilityResponse>,
) -> AppResult<Json<ApiResponse<VisibilityResponse>>> {
    sqlx::query(
        "INSERT INTO collections.visibility (user_id, collection_public) \
         VALUES ($1, $2) \
         ON CONFLICT (user_id) DO UPDATE \
           SET collection_public = EXCLUDED.collection_public, updated_at = NOW()",
    )
    .bind(auth.id())
    .bind(body.collection_public)
    .execute(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(body)))
}

pub async fn upsert_entry(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(item_id): Path<Uuid>,
    Json(body): Json<UpsertEntryRequest>,
) -> AppResult<Json<ApiResponse<DbEntry>>> {
    if let Some(lvl) = body.constellation_level {
        if !(0..=6).contains(&lvl) {
            return Err(AppError::BadRequest(
                "constellation_level must be 0–6".into(),
            ));
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
