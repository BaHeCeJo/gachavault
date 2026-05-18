use axum::{extract::{Path, State}, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use shared_auth::{AuthUser, OptionalAuthUser};
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbTierList {
    pub id: Uuid,
    pub user_id: Uuid,
    pub game_id: Uuid,
    pub title: String,
    pub is_public: bool,
    pub share_slug: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbTierEntry {
    pub id: Uuid,
    pub tier_list_id: Uuid,
    pub item_id: Uuid,
    pub tier: String,
}

#[derive(Debug, Serialize)]
pub struct TierListWithEntries {
    #[serde(flatten)]
    pub tier_list: DbTierList,
    pub entries: Vec<DbTierEntry>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTierListRequest {
    pub game_id: Uuid,
    pub title: String,
    pub is_public: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTierListRequest {
    pub title: Option<String>,
    pub is_public: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct TierEntryInput {
    pub item_id: Uuid,
    pub tier: String,
}

pub async fn list_my_tierlists(
    State(pool): State<PgPool>,
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<Vec<DbTierList>>>> {
    let lists = sqlx::query_as!(
        DbTierList,
        "SELECT * FROM tierlists.tier_lists WHERE user_id = $1 ORDER BY updated_at DESC",
        auth.id()
    )
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(lists)))
}

pub async fn list_public_tierlists(
    State(pool): State<PgPool>,
    Path(game_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<DbTierList>>>> {
    let lists = sqlx::query_as!(
        DbTierList,
        "SELECT * FROM tierlists.tier_lists WHERE game_id = $1 AND is_public = TRUE ORDER BY updated_at DESC LIMIT 50",
        game_id
    )
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(lists)))
}

pub async fn get_tierlist(
    State(pool): State<PgPool>,
    OptionalAuthUser(claims): OptionalAuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<TierListWithEntries>>> {
    let tier_list = sqlx::query_as!(
        DbTierList,
        "SELECT * FROM tierlists.tier_lists WHERE id = $1",
        id
    )
    .fetch_optional(&pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Tier list not found".into()))?;

    // Only owner can see private tier lists
    if !tier_list.is_public {
        let viewer_id = claims.as_ref().map(|c| c.user_id());
        if viewer_id != Some(tier_list.user_id) {
            return Err(AppError::Forbidden("This tier list is private".into()));
        }
    }

    let entries = fetch_entries(&pool, id).await?;
    Ok(Json(ApiResponse::success(TierListWithEntries { tier_list, entries })))
}

pub async fn get_by_share_slug(
    State(pool): State<PgPool>,
    Path(slug): Path<String>,
) -> AppResult<Json<ApiResponse<TierListWithEntries>>> {
    let tier_list = sqlx::query_as!(
        DbTierList,
        "SELECT * FROM tierlists.tier_lists WHERE share_slug = $1 AND is_public = TRUE",
        slug
    )
    .fetch_optional(&pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Tier list not found".into()))?;

    let entries = fetch_entries(&pool, tier_list.id).await?;
    Ok(Json(ApiResponse::success(TierListWithEntries { tier_list, entries })))
}

pub async fn create_tierlist(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<CreateTierListRequest>,
) -> AppResult<Json<ApiResponse<DbTierList>>> {
    if body.title.is_empty() {
        return Err(AppError::BadRequest("title is required".into()));
    }

    let tier_list = sqlx::query_as!(
        DbTierList,
        r#"INSERT INTO tierlists.tier_lists (user_id, game_id, title, is_public)
           VALUES ($1, $2, $3, $4)
           RETURNING *"#,
        auth.id(),
        body.game_id,
        body.title,
        body.is_public.unwrap_or(true),
    )
    .fetch_one(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(tier_list)))
}

pub async fn update_tierlist(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateTierListRequest>,
) -> AppResult<Json<ApiResponse<DbTierList>>> {
    let tier_list = sqlx::query_as!(
        DbTierList,
        r#"UPDATE tierlists.tier_lists SET
            title = COALESCE($3, title),
            is_public = COALESCE($4, is_public),
            updated_at = NOW()
           WHERE id = $1 AND user_id = $2
           RETURNING *"#,
        id,
        auth.id(),
        body.title,
        body.is_public,
    )
    .fetch_optional(&pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Tier list not found or not owned by you".into()))?;

    Ok(Json(ApiResponse::success(tier_list)))
}

pub async fn delete_tierlist(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<()>>> {
    let result = sqlx::query!(
        "DELETE FROM tierlists.tier_lists WHERE id = $1 AND user_id = $2",
        id,
        auth.id()
    )
    .execute(&pool)
    .await
    .map_err(AppError::Database)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Tier list not found or not owned by you".into()));
    }

    Ok(Json(ApiResponse::success(())))
}

pub async fn upsert_entries(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(entries): Json<Vec<TierEntryInput>>,
) -> AppResult<Json<ApiResponse<Vec<DbTierEntry>>>> {
    // Verify ownership
    let exists = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM tierlists.tier_lists WHERE id = $1 AND user_id = $2)",
        id,
        auth.id()
    )
    .fetch_one(&pool)
    .await
    .map_err(AppError::Database)?
    .unwrap_or(false);

    if !exists {
        return Err(AppError::NotFound("Tier list not found or not owned by you".into()));
    }

    let valid_tiers = ["S", "A", "B", "C", "D"];
    for entry in &entries {
        if !valid_tiers.contains(&entry.tier.as_str()) {
            return Err(AppError::BadRequest(format!(
                "Invalid tier '{}'. Must be one of: S, A, B, C, D",
                entry.tier
            )));
        }
    }

    // Delete existing entries and re-insert (simpler than per-item upsert)
    sqlx::query!("DELETE FROM tierlists.tier_list_entries WHERE tier_list_id = $1", id)
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;

    for entry in &entries {
        sqlx::query!(
            "INSERT INTO tierlists.tier_list_entries (tier_list_id, item_id, tier) VALUES ($1, $2, $3)",
            id,
            entry.item_id,
            entry.tier,
        )
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;
    }

    // Update tier list updated_at
    sqlx::query!("UPDATE tierlists.tier_lists SET updated_at = NOW() WHERE id = $1", id)
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;

    let result = fetch_entries(&pool, id).await?;
    Ok(Json(ApiResponse::success(result)))
}

async fn fetch_entries(pool: &PgPool, tier_list_id: Uuid) -> AppResult<Vec<DbTierEntry>> {
    sqlx::query_as!(
        DbTierEntry,
        "SELECT * FROM tierlists.tier_list_entries WHERE tier_list_id = $1 ORDER BY tier ASC",
        tier_list_id
    )
    .fetch_all(pool)
    .await
    .map_err(AppError::Database)
}
