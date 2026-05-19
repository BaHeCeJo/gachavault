use axum::{extract::{Path, Query, State}, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use shared_auth::{AuthUser, OptionalAuthUser};
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct DbTierList {
    pub id: Uuid,
    pub user_id: Uuid,
    pub game_id: Uuid,
    pub title: String,
    pub is_public: bool,
    pub share_slug: String,
    pub upvote_count: i32,
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
    pub tiers: serde_json::Value,
    pub section_id: Option<Uuid>,
    pub user_upvoted: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateTierListRequest {
    pub game_id: Uuid,
    pub title: String,
    pub is_public: Option<bool>,
    pub section_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTierListRequest {
    pub title: Option<String>,
    pub is_public: Option<bool>,
    pub tiers: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct TierEntryInput {
    pub item_id: Uuid,
    pub tier: String,
}

fn row_to_tierlist(row: &sqlx::postgres::PgRow) -> DbTierList {
    DbTierList {
        id: row.get("id"),
        user_id: row.get("user_id"),
        game_id: row.get("game_id"),
        title: row.get("title"),
        is_public: row.get("is_public"),
        share_slug: row.get("share_slug"),
        upvote_count: row.try_get("upvote_count").unwrap_or(0),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

pub async fn list_my_tierlists(
    State(pool): State<PgPool>,
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<Vec<DbTierList>>>> {
    let rows = sqlx::query(
        "SELECT id, user_id, game_id, title, is_public, share_slug, upvote_count, created_at, updated_at \
         FROM tierlists.tier_lists WHERE user_id = $1 ORDER BY updated_at DESC",
    )
    .bind(auth.id())
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(rows.iter().map(row_to_tierlist).collect())))
}

#[derive(Debug, Deserialize)]
pub struct PublicTierListsQuery {
    pub game_id: Option<Uuid>,
}

pub async fn list_public_tierlists_query(
    State(pool): State<PgPool>,
    Query(q): Query<PublicTierListsQuery>,
) -> AppResult<Json<ApiResponse<Vec<DbTierList>>>> {
    let game_id = q.game_id.ok_or_else(|| AppError::BadRequest("game_id is required".into()))?;
    let rows = sqlx::query(
        "SELECT id, user_id, game_id, title, is_public, share_slug, upvote_count, created_at, updated_at \
         FROM tierlists.tier_lists WHERE game_id = $1 AND is_public = TRUE \
         ORDER BY upvote_count DESC, updated_at DESC LIMIT 50",
    )
    .bind(game_id)
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(rows.iter().map(row_to_tierlist).collect())))
}

pub async fn list_public_tierlists(
    State(pool): State<PgPool>,
    Path(game_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<DbTierList>>>> {
    let rows = sqlx::query(
        "SELECT id, user_id, game_id, title, is_public, share_slug, upvote_count, created_at, updated_at \
         FROM tierlists.tier_lists WHERE game_id = $1 AND is_public = TRUE \
         ORDER BY upvote_count DESC, updated_at DESC LIMIT 50",
    )
    .bind(game_id)
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(rows.iter().map(row_to_tierlist).collect())))
}

pub async fn get_tierlist(
    State(pool): State<PgPool>,
    OptionalAuthUser(claims): OptionalAuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<TierListWithEntries>>> {
    let row = sqlx::query(
        "SELECT id, user_id, game_id, title, is_public, share_slug, upvote_count, created_at, updated_at \
         FROM tierlists.tier_lists WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Tier list not found".into()))?;

    let tier_list = row_to_tierlist(&row);

    // Only owner can see private tier lists
    if !tier_list.is_public {
        let viewer_id = claims.as_ref().map(|c| c.user_id());
        if viewer_id != Some(tier_list.user_id) {
            return Err(AppError::Forbidden("This tier list is private".into()));
        }
    }

    let user_upvoted = if let Some(ref c) = claims {
        let n: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM tierlists.upvotes WHERE tierlist_id = $1 AND user_id = $2",
        )
        .bind(id)
        .bind(c.user_id())
        .fetch_one(&pool)
        .await
        .map_err(AppError::Database)?;
        n > 0
    } else {
        false
    };

    let (tiers, section_id) = fetch_tiers_and_section(&pool, id).await?;
    let entries = fetch_entries(&pool, id).await?;
    Ok(Json(ApiResponse::success(TierListWithEntries { tier_list, entries, tiers, section_id, user_upvoted })))
}

pub async fn get_by_share_slug(
    State(pool): State<PgPool>,
    Path(slug): Path<String>,
) -> AppResult<Json<ApiResponse<TierListWithEntries>>> {
    let row = sqlx::query(
        "SELECT id, user_id, game_id, title, is_public, share_slug, upvote_count, created_at, updated_at \
         FROM tierlists.tier_lists WHERE share_slug = $1 AND is_public = TRUE",
    )
    .bind(&slug)
    .fetch_optional(&pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Tier list not found".into()))?;

    let tier_list = row_to_tierlist(&row);
    let id = tier_list.id;
    let (tiers, section_id) = fetch_tiers_and_section(&pool, id).await?;
    let entries = fetch_entries(&pool, id).await?;
    Ok(Json(ApiResponse::success(TierListWithEntries { tier_list, entries, tiers, section_id, user_upvoted: false })))
}

pub async fn create_tierlist(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<CreateTierListRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    if body.title.is_empty() {
        return Err(AppError::BadRequest("title is required".into()));
    }

    let row = sqlx::query(
        r#"INSERT INTO tierlists.tier_lists (user_id, game_id, title, is_public, section_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, user_id, game_id, title, is_public, share_slug, section_id, created_at, updated_at"#,
    )
    .bind(auth.id())
    .bind(body.game_id)
    .bind(&body.title)
    .bind(body.is_public.unwrap_or(true))
    .bind(body.section_id)
    .fetch_one(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "id": row.get::<Uuid, _>("id"),
        "user_id": row.get::<Uuid, _>("user_id"),
        "game_id": row.get::<Uuid, _>("game_id"),
        "title": row.get::<String, _>("title"),
        "is_public": row.get::<bool, _>("is_public"),
        "share_slug": row.get::<String, _>("share_slug"),
        "section_id": row.try_get::<Uuid, _>("section_id").ok(),
    }))))
}

pub async fn update_tierlist(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateTierListRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let row = sqlx::query(
        r#"UPDATE tierlists.tier_lists SET
            title = COALESCE($3, title),
            is_public = COALESCE($4, is_public),
            tiers = COALESCE($5, tiers),
            updated_at = NOW()
           WHERE id = $1 AND user_id = $2
           RETURNING id, user_id, game_id, title, is_public, share_slug, tiers, created_at, updated_at"#,
    )
    .bind(id)
    .bind(auth.id())
    .bind(body.title)
    .bind(body.is_public)
    .bind(body.tiers)
    .fetch_optional(&pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Tier list not found or not owned by you".into()))?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "id": row.get::<Uuid, _>("id"),
        "user_id": row.get::<Uuid, _>("user_id"),
        "game_id": row.get::<Uuid, _>("game_id"),
        "title": row.get::<String, _>("title"),
        "is_public": row.get::<bool, _>("is_public"),
        "share_slug": row.get::<String, _>("share_slug"),
        "tiers": row.get::<serde_json::Value, _>("tiers"),
    }))))
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

pub async fn upvote_tierlist(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    // Verify tier list exists and is public
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM tierlists.tier_lists WHERE id = $1 AND is_public = TRUE)",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(AppError::Database)?;

    if !exists {
        return Err(AppError::NotFound("Tier list not found".into()));
    }

    // INSERT OR IGNORE — idempotent
    let already = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM tierlists.upvotes WHERE tierlist_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(auth.id())
    .fetch_one(&pool)
    .await
    .map_err(AppError::Database)?;

    if already == 0 {
        sqlx::query(
            "INSERT INTO tierlists.upvotes (tierlist_id, user_id) VALUES ($1, $2)",
        )
        .bind(id)
        .bind(auth.id())
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;

        sqlx::query(
            "UPDATE tierlists.tier_lists SET upvote_count = upvote_count + 1 WHERE id = $1",
        )
        .bind(id)
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;
    }

    let count: i64 = sqlx::query_scalar(
        "SELECT upvote_count FROM tierlists.tier_lists WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "upvote_count": count,
        "user_upvoted": true,
    }))))
}

pub async fn remove_upvote(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let result = sqlx::query(
        "DELETE FROM tierlists.upvotes WHERE tierlist_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(auth.id())
    .execute(&pool)
    .await
    .map_err(AppError::Database)?;

    if result.rows_affected() > 0 {
        sqlx::query(
            "UPDATE tierlists.tier_lists SET upvote_count = GREATEST(upvote_count - 1, 0) WHERE id = $1",
        )
        .bind(id)
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;
    }

    let count: i64 = sqlx::query_scalar(
        "SELECT upvote_count FROM tierlists.tier_lists WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "upvote_count": count,
        "user_upvoted": false,
    }))))
}

pub async fn list_comments(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let rows = sqlx::query(
        "SELECT id, tierlist_id, user_id, username, body, created_at \
         FROM tierlists.comments WHERE tierlist_id = $1 ORDER BY created_at ASC LIMIT 100",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    let comments: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| serde_json::json!({
            "id": r.get::<Uuid, _>("id"),
            "tierlist_id": r.get::<Uuid, _>("tierlist_id"),
            "user_id": r.get::<Uuid, _>("user_id"),
            "username": r.get::<String, _>("username"),
            "body": r.get::<String, _>("body"),
            "created_at": r.get::<DateTime<Utc>, _>("created_at"),
        }))
        .collect();

    Ok(Json(ApiResponse::success(serde_json::json!(comments))))
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub body: String,
}

pub async fn create_comment(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateCommentRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let body_text = body.body.trim().to_string();
    if body_text.is_empty() || body_text.len() > 2000 {
        return Err(AppError::BadRequest("Comment must be 1–2000 characters".into()));
    }

    // Verify tier list exists and is public (or user owns it)
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM tierlists.tier_lists WHERE id = $1 AND (is_public = TRUE OR user_id = $2))",
    )
    .bind(id)
    .bind(auth.id())
    .fetch_one(&pool)
    .await
    .map_err(AppError::Database)?;

    if !exists {
        return Err(AppError::NotFound("Tier list not found".into()));
    }

    let row = sqlx::query(
        "INSERT INTO tierlists.comments (tierlist_id, user_id, username, body) \
         VALUES ($1, $2, $3, $4) \
         RETURNING id, tierlist_id, user_id, username, body, created_at",
    )
    .bind(id)
    .bind(auth.id())
    .bind(auth.username())
    .bind(&body_text)
    .fetch_one(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "id": row.get::<Uuid, _>("id"),
        "tierlist_id": row.get::<Uuid, _>("tierlist_id"),
        "user_id": row.get::<Uuid, _>("user_id"),
        "username": row.get::<String, _>("username"),
        "body": row.get::<String, _>("body"),
        "created_at": row.get::<DateTime<Utc>, _>("created_at"),
    }))))
}

pub async fn delete_comment(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path((tierlist_id, comment_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<ApiResponse<()>>> {
    // Allow comment author or admin to delete
    let result = if auth.is_admin() {
        sqlx::query(
            "DELETE FROM tierlists.comments WHERE id = $1 AND tierlist_id = $2",
        )
        .bind(comment_id)
        .bind(tierlist_id)
        .execute(&pool)
        .await
        .map_err(AppError::Database)?
    } else {
        sqlx::query(
            "DELETE FROM tierlists.comments WHERE id = $1 AND tierlist_id = $2 AND user_id = $3",
        )
        .bind(comment_id)
        .bind(tierlist_id)
        .bind(auth.id())
        .execute(&pool)
        .await
        .map_err(AppError::Database)?
    };

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Comment not found or not yours".into()));
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

async fn fetch_tiers_and_section(pool: &PgPool, tier_list_id: Uuid) -> AppResult<(serde_json::Value, Option<Uuid>)> {
    let row = sqlx::query("SELECT tiers, section_id FROM tierlists.tier_lists WHERE id = $1")
        .bind(tier_list_id)
        .fetch_one(pool)
        .await
        .map_err(AppError::Database)?;
    let tiers = row.get::<serde_json::Value, _>("tiers");
    let section_id = row.try_get::<Uuid, _>("section_id").ok();
    Ok((tiers, section_id))
}
