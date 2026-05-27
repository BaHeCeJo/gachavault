use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use shared_auth::AuthUser;
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use sqlx::Row;
use uuid::Uuid;

use crate::{db, models::DbItemFull, models::*, AppState};

#[derive(Debug, Deserialize)]
pub struct LocaleQuery {
    pub locale: Option<String>,
}

// Returns true if the user has a game-level role that permits editing items for `game_id`.
// Called only when the global role is below "editor" — admins bypass this.
async fn can_edit_game(
    pool: &sqlx::PgPool,
    user_id: uuid::Uuid,
    game_id: uuid::Uuid,
    section_id: Option<uuid::Uuid>,
) -> bool {
    let game_ok = sqlx::query(
        "SELECT 1 FROM auth.user_roles \
         WHERE user_id=$1 AND game_id=$2 AND section_id IS NULL \
         AND role IN ('game_admin','game_editor') LIMIT 1",
    )
    .bind(user_id)
    .bind(game_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .is_some();

    if game_ok {
        return true;
    }

    if let Some(sid) = section_id {
        return sqlx::query(
            "SELECT 1 FROM auth.user_roles \
             WHERE user_id=$1 AND game_id=$2 AND section_id=$3 \
             AND role IN ('game_admin','game_editor','section_editor') LIMIT 1",
        )
        .bind(user_id)
        .bind(game_id)
        .bind(sid)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .is_some();
    }

    false
}

pub async fn list_items(
    State(state): State<AppState>,
    Query(query): Query<ListItemsQuery>,
) -> AppResult<Json<ApiResponse<Vec<DbItemFull>>>> {
    let items = db::list_items_full(
        &state.pool,
        query.game_id,
        query.section_id,
        query.limit.unwrap_or(50).min(200),
        query.offset.unwrap_or(0),
    )
    .await
    .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(items)))
}

pub async fn list_items_by_game(
    State(state): State<AppState>,
    Path(_game_slug): Path<String>,
    Query(query): Query<ListItemsQuery>,
) -> AppResult<Json<ApiResponse<Vec<DbItemFull>>>> {
    let items = db::list_items_full(
        &state.pool,
        query.game_id,
        query.section_id,
        query.limit.unwrap_or(50).min(200),
        query.offset.unwrap_or(0),
    )
    .await
    .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(items)))
}

pub async fn get_item(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Query(query): Query<LocaleQuery>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let item = db::find_item_by_id(&state.pool, id)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("Item not found".into()))?;

    let locale = query.locale.as_deref().unwrap_or("en");
    let (game_slug, section_slug) = lookup_slugs(&state.pool, item.game_id, item.section_id)
        .await
        .unwrap_or_default();
    let translated =
        apply_item_translation(&state.pool, item, locale, &game_slug, &section_slug).await;
    Ok(Json(ApiResponse::success(translated)))
}

pub async fn get_item_by_slugs(
    State(state): State<AppState>,
    Path((game_slug, section_slug, item_slug)): Path<(String, String, String)>,
    Query(query): Query<LocaleQuery>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let item = db::find_item_by_slugs(&state.pool, &game_slug, &section_slug, &item_slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("Item not found".into()))?;

    let locale = query.locale.as_deref().unwrap_or("en");
    let translated =
        apply_item_translation(&state.pool, item, locale, &game_slug, &section_slug).await;
    Ok(Json(ApiResponse::success(translated)))
}

async fn apply_item_translation(
    pool: &sqlx::PgPool,
    item: DbItem,
    locale: &str,
    game_slug: &str,
    section_slug: &str,
) -> serde_json::Value {
    let mut data = item.data.clone();

    if locale != "en" {
        if let Ok(Some(row)) = sqlx::query(
            "SELECT fields FROM items.item_translations WHERE item_id = $1 AND locale = $2",
        )
        .bind(item.id)
        .bind(locale)
        .fetch_optional(pool)
        .await
        {
            if let Ok(fields) = row.try_get::<serde_json::Value, _>("fields") {
                if let (Some(data_obj), Some(fields_obj)) =
                    (data.as_object_mut(), fields.as_object())
                {
                    for (k, v) in fields_obj {
                        data_obj.insert(k.clone(), v.clone());
                    }
                }
            }
        }
    }

    serde_json::json!({
        "id":             item.id,
        "game_id":        item.game_id,
        "game_slug":      game_slug,
        "section_id":     item.section_id,
        "section_slug":   section_slug,
        "type_schema_id": item.type_schema_id,
        "slug":           item.slug,
        "data":           data,
        "version":        item.version,
        "created_by":     item.created_by,
        "created_at":     item.created_at,
        "updated_at":     item.updated_at,
    })
}

pub async fn create_item(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateItemRequest>,
) -> AppResult<Json<ApiResponse<DbItem>>> {
    if !auth.can_edit()
        && !can_edit_game(&state.pool, auth.id(), body.game_id, Some(body.section_id)).await
    {
        return Err(AppError::Forbidden(
            "Editor, game_editor, or section_editor role required".into(),
        ));
    }

    let slug = if body.slug.is_empty() {
        // Auto-generate from data.name
        let name = body.data.get("name").and_then(|v| v.as_str()).unwrap_or("");
        if name.is_empty() {
            return Err(AppError::BadRequest("slug or data.name is required".into()));
        }
        slugify(name)
    } else {
        body.slug.clone()
    };

    let item = db::create_item(
        &state.pool,
        body.game_id,
        body.section_id,
        body.type_schema_id,
        &slug,
        &body.data,
        auth.id(),
    )
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db_err) if db_err.constraint() == Some("items_game_id_slug_key") => {
            AppError::Conflict(format!(
                "Item with slug '{}' already exists in this game",
                slug
            ))
        }
        other => AppError::Database(other),
    })?;

    // Fire-and-forget search indexing
    let state_clone = state.clone();
    let item_clone = item.clone();
    tokio::spawn(async move {
        index_item(&state_clone, &item_clone).await;
    });

    Ok(Json(ApiResponse::success(item)))
}

pub async fn update_item(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateItemRequest>,
) -> AppResult<Json<ApiResponse<DbItem>>> {
    if !auth.can_edit() {
        // Fetch item to get game_id/section_id for per-game role check
        let existing = db::find_item_by_id(&state.pool, id)
            .await
            .map_err(AppError::Database)?
            .ok_or_else(|| AppError::NotFound("Item not found".into()))?;
        if !can_edit_game(
            &state.pool,
            auth.id(),
            existing.game_id,
            Some(existing.section_id),
        )
        .await
        {
            return Err(AppError::Forbidden(
                "Editor, game_editor, or section_editor role required".into(),
            ));
        }
    }
    let item = db::update_item(&state.pool, id, body.slug.as_deref(), body.data.as_ref())
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("Item not found".into()))?;

    // Fire-and-forget re-index
    let state_clone = state.clone();
    let item_clone = item.clone();
    tokio::spawn(async move {
        index_item(&state_clone, &item_clone).await;
    });

    Ok(Json(ApiResponse::success(item)))
}

pub async fn delete_item(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<()>>> {
    if !auth.is_admin() {
        let existing = db::find_item_by_id(&state.pool, id)
            .await
            .map_err(AppError::Database)?
            .ok_or_else(|| AppError::NotFound("Item not found".into()))?;
        // Only game_admin (not game_editor) can delete
        let is_game_admin = sqlx::query(
            "SELECT 1 FROM auth.user_roles WHERE user_id=$1 AND game_id=$2 AND role='game_admin' LIMIT 1",
        )
        .bind(auth.id())
        .bind(existing.game_id)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
        .is_some();
        if !is_game_admin {
            return Err(AppError::Forbidden(
                "Admin or game_admin role required to delete items".into(),
            ));
        }
    }
    let deleted = db::delete_item(&state.pool, id)
        .await
        .map_err(AppError::Database)?;

    if !deleted {
        return Err(AppError::NotFound("Item not found".into()));
    }

    // Fire-and-forget removal from search index
    let state_clone = state.clone();
    tokio::spawn(async move {
        remove_from_index(&state_clone, id).await;
    });

    Ok(Json(ApiResponse::success(())))
}

#[derive(Debug, Deserialize)]
pub struct BulkImportRow {
    /// When present, the row is treated as an update of an existing item.
    /// When absent, the row is created. This is the export-edit-reimport round-trip.
    pub id: Option<Uuid>,
    pub game: String,
    pub section: String,
    pub schema: String,
    pub slug: Option<String>,
    pub data: serde_json::Value,
}

pub async fn bulk_import(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(items): Json<Vec<BulkImportRow>>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    if !auth.is_admin() {
        return Err(AppError::Forbidden(
            "Admin role required for bulk import".into(),
        ));
    }
    if items.is_empty() {
        return Err(AppError::BadRequest("No items provided".into()));
    }
    if items.len() > 500 {
        return Err(AppError::BadRequest("Maximum 500 items per import".into()));
    }

    let mut created = 0u32;
    let mut updated = 0u32;
    let mut skipped = 0u32;
    let mut errors: Vec<serde_json::Value> = Vec::new();

    // Slug → UUID caches. A typical export-reimport hits the same game/section/schema
    // for every row, so caching cuts the lookup count from O(N) to O(1).
    let mut game_cache: std::collections::HashMap<String, Uuid> = Default::default();
    let mut section_cache: std::collections::HashMap<(Uuid, String), Uuid> = Default::default();
    let mut schema_cache: std::collections::HashMap<(Uuid, String), Uuid> = Default::default();

    for (idx, row) in items.iter().enumerate() {
        // Best-effort label for error reporting — prefer slug, fall back to data.name, then index.
        let label = row
            .slug
            .clone()
            .or_else(|| {
                row.data
                    .get("name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| format!("#{}", idx));

        // UPDATE path: id was provided, so this row maps to a specific existing item.
        if let Some(id) = row.id {
            match db::update_item(&state.pool, id, row.slug.as_deref(), Some(&row.data)).await {
                Ok(Some(item)) => {
                    updated += 1;
                    let state_clone = state.clone();
                    let item_clone = item.clone();
                    tokio::spawn(async move {
                        index_item(&state_clone, &item_clone).await;
                    });
                }
                Ok(None) => {
                    errors.push(serde_json::json!({
                        "slug": label,
                        "error": format!("Item with id {} not found", id),
                    }));
                }
                Err(e) => {
                    errors.push(serde_json::json!({"slug": label, "error": e.to_string()}));
                }
            }
            continue;
        }

        // CREATE path: resolve game/section/schema slugs to UUIDs.
        let game_id = match resolve_game_id(&state.pool, &row.game, &mut game_cache).await {
            Ok(id) => id,
            Err(msg) => {
                errors.push(serde_json::json!({"slug": label, "error": msg}));
                continue;
            }
        };
        let section_id = match resolve_section_id(
            &state.pool,
            game_id,
            &row.section,
            &mut section_cache,
        )
        .await
        {
            Ok(id) => id,
            Err(msg) => {
                errors.push(serde_json::json!({"slug": label, "error": msg}));
                continue;
            }
        };
        let schema_id =
            match resolve_schema_id(&state.pool, game_id, &row.schema, &mut schema_cache).await {
                Ok(id) => id,
                Err(msg) => {
                    errors.push(serde_json::json!({"slug": label, "error": msg}));
                    continue;
                }
            };

        let slug = match row.slug.as_deref() {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => {
                let name = row.data.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if name.is_empty() {
                    errors.push(serde_json::json!({
                        "slug": label,
                        "error": "slug or data.name is required",
                    }));
                    continue;
                }
                slugify(name)
            }
        };

        match db::create_item(
            &state.pool,
            game_id,
            section_id,
            schema_id,
            &slug,
            &row.data,
            auth.id(),
        )
        .await
        {
            Ok(new_item) => {
                created += 1;
                let state_clone = state.clone();
                let item_clone = new_item.clone();
                tokio::spawn(async move {
                    index_item(&state_clone, &item_clone).await;
                });
            }
            Err(sqlx::Error::Database(e)) if e.constraint() == Some("items_game_id_slug_key") => {
                // Row had no id and the slug already exists — caller intended a create,
                // so we honor the contract and skip rather than silently overwriting.
                skipped += 1;
            }
            Err(e) => {
                errors.push(serde_json::json!({"slug": slug, "error": e.to_string()}));
            }
        }
    }

    Ok(Json(ApiResponse::success(serde_json::json!({
        "total": items.len(),
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
    }))))
}

async fn resolve_game_id(
    pool: &sqlx::PgPool,
    slug: &str,
    cache: &mut std::collections::HashMap<String, Uuid>,
) -> Result<Uuid, String> {
    if let Some(id) = cache.get(slug) {
        return Ok(*id);
    }
    let id = sqlx::query_scalar::<_, Uuid>("SELECT id FROM games.games WHERE slug = $1")
        .bind(slug)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Unknown game slug: '{}'", slug))?;
    cache.insert(slug.to_string(), id);
    Ok(id)
}

async fn resolve_section_id(
    pool: &sqlx::PgPool,
    game_id: Uuid,
    slug: &str,
    cache: &mut std::collections::HashMap<(Uuid, String), Uuid>,
) -> Result<Uuid, String> {
    let key = (game_id, slug.to_string());
    if let Some(id) = cache.get(&key) {
        return Ok(*id);
    }
    let id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM games.sections WHERE game_id = $1 AND slug = $2",
    )
    .bind(game_id)
    .bind(slug)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Unknown section slug '{}' in this game", slug))?;
    cache.insert(key, id);
    Ok(id)
}

async fn resolve_schema_id(
    pool: &sqlx::PgPool,
    game_id: Uuid,
    name: &str,
    cache: &mut std::collections::HashMap<(Uuid, String), Uuid>,
) -> Result<Uuid, String> {
    let key = (game_id, name.to_string());
    if let Some(id) = cache.get(&key) {
        return Ok(*id);
    }
    let id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM games.item_type_schemas WHERE game_id = $1 AND name = $2",
    )
    .bind(game_id)
    .bind(name)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Unknown schema name '{}' in this game", name))?;
    cache.insert(key, id);
    Ok(id)
}

pub async fn list_skills(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<DbSkill>>>> {
    let skills = db::list_skills(&state.pool, id)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(skills)))
}

pub async fn create_skill(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateSkillRequest>,
) -> AppResult<Json<ApiResponse<DbSkill>>> {
    if !auth.can_edit() {
        let item = db::find_item_by_id(&state.pool, id)
            .await
            .map_err(AppError::Database)?
            .ok_or_else(|| AppError::NotFound("Item not found".into()))?;
        if !can_edit_game(&state.pool, auth.id(), item.game_id, Some(item.section_id)).await {
            return Err(AppError::Forbidden(
                "Editor, game_editor, or section_editor role required".into(),
            ));
        }
    }

    if body.name.is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }

    let empty = serde_json::json!({});
    let skill = db::create_skill(
        &state.pool,
        id,
        &body.name,
        body.description.as_deref(),
        body.skill_type.as_deref(),
        body.data.as_ref().unwrap_or(&empty),
        body.order.unwrap_or(0),
    )
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(skill)))
}

pub async fn list_builds(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<DbBuild>>>> {
    let builds = db::list_builds(&state.pool, id)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(builds)))
}

pub async fn create_build(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateBuildRequest>,
) -> AppResult<Json<ApiResponse<DbBuild>>> {
    if !auth.can_edit() {
        let item = db::find_item_by_id(&state.pool, id)
            .await
            .map_err(AppError::Database)?
            .ok_or_else(|| AppError::NotFound("Item not found".into()))?;
        if !can_edit_game(&state.pool, auth.id(), item.game_id, Some(item.section_id)).await {
            return Err(AppError::Forbidden(
                "Editor, game_editor, or section_editor role required".into(),
            ));
        }
    }

    if body.title.is_empty() {
        return Err(AppError::BadRequest("title is required".into()));
    }

    let build = db::create_build(&state.pool, id, &body.title, &body.content, auth.id())
        .await
        .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(build)))
}

pub async fn list_changelog(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<DbChangelog>>>> {
    let entries = db::list_changelog(&state.pool, id)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(entries)))
}

pub async fn create_changelog(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateChangelogRequest>,
) -> AppResult<Json<ApiResponse<DbChangelog>>> {
    if !auth.can_edit() {
        let item = db::find_item_by_id(&state.pool, id)
            .await
            .map_err(AppError::Database)?
            .ok_or_else(|| AppError::NotFound("Item not found".into()))?;
        if !can_edit_game(&state.pool, auth.id(), item.game_id, Some(item.section_id)).await {
            return Err(AppError::Forbidden(
                "Editor, game_editor, or section_editor role required".into(),
            ));
        }
    }

    if body.version.is_empty() || body.changes.is_empty() {
        return Err(AppError::BadRequest(
            "version and changes are required".into(),
        ));
    }

    let entry = db::create_changelog(
        &state.pool,
        id,
        &body.version,
        body.patch.as_deref(),
        &body.changes,
        body.change_date,
    )
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(entry)))
}

// ── Slug helpers ─────────────────────────────────────────────────────────────

fn slugify(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

// ── Search indexing helpers ──────────────────────────────────────────────────

async fn lookup_slugs(
    pool: &sqlx::PgPool,
    game_id: Uuid,
    section_id: Uuid,
) -> Option<(String, String)> {
    let row = sqlx::query(
        "SELECT g.slug AS game_slug, s.slug AS section_slug \
         FROM games.games g \
         JOIN games.sections s ON s.game_id = g.id \
         WHERE g.id = $1 AND s.id = $2",
    )
    .bind(game_id)
    .bind(section_id)
    .fetch_optional(pool)
    .await
    .ok()??;

    let game_slug: String = row.try_get("game_slug").ok()?;
    let section_slug: String = row.try_get("section_slug").ok()?;
    Some((game_slug, section_slug))
}

async fn index_item(state: &AppState, item: &DbItem) {
    let Some((game_slug, section_slug)) =
        lookup_slugs(&state.pool, item.game_id, item.section_id).await
    else {
        tracing::warn!(
            "Could not resolve slugs for item {} — skipping search index",
            item.id
        );
        return;
    };

    let name = item
        .data
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(&item.slug)
        .to_string();

    let payload = serde_json::json!({
        "id": item.id,
        "game_id": item.game_id,
        "game_slug": game_slug,
        "section_id": item.section_id,
        "section_slug": section_slug,
        "slug": item.slug,
        "name": name,
        "data": item.data,
    });

    let url = format!("{}/api/v1/search/index", state.search_url);
    if let Err(e) = state
        .http_client
        .post(&url)
        .header("x-internal-secret", &state.internal_secret)
        .json(&payload)
        .send()
        .await
    {
        tracing::warn!("Failed to index item {} in search: {}", item.id, e);
    }
}

async fn remove_from_index(state: &AppState, item_id: Uuid) {
    let url = format!("{}/api/v1/search/index/{}", state.search_url, item_id);
    if let Err(e) = state
        .http_client
        .delete(&url)
        .header("x-internal-secret", &state.internal_secret)
        .send()
        .await
    {
        tracing::warn!("Failed to remove item {} from search index: {}", item_id, e);
    }
}

// ── Item Translations ─────────────────────────────────────────────────────────

pub async fn list_item_translations(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<serde_json::Value>>>> {
    let rows = sqlx::query(
        "SELECT locale, fields, updated_at FROM items.item_translations WHERE item_id = $1 ORDER BY locale",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let translations: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "locale":     r.get::<String, _>("locale"),
                "fields":     r.get::<serde_json::Value, _>("fields"),
                "updated_at": r.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"),
            })
        })
        .collect();

    Ok(Json(ApiResponse::success(translations)))
}

#[derive(Debug, Deserialize)]
pub struct UpsertItemTranslationRequest {
    pub fields: serde_json::Value,
}

pub async fn upsert_item_translation(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((id, locale)): Path<(Uuid, String)>,
    Json(body): Json<UpsertItemTranslationRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    if !auth.can_edit() {
        return Err(AppError::Forbidden("Editor or admin role required".into()));
    }
    if locale == "en" {
        return Err(AppError::BadRequest(
            "Use the item update endpoint to edit English content".into(),
        ));
    }
    if !body.fields.is_object() {
        return Err(AppError::BadRequest("fields must be a JSON object".into()));
    }

    sqlx::query(
        "INSERT INTO items.item_translations (item_id, locale, fields)
         VALUES ($1, $2, $3)
         ON CONFLICT (item_id, locale) DO UPDATE
           SET fields = EXCLUDED.fields, updated_at = NOW()",
    )
    .bind(id)
    .bind(&locale)
    .bind(&body.fields)
    .execute(&state.pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "item_id": id,
        "locale":  locale,
        "fields":  body.fields,
    }))))
}

pub async fn delete_item_translation(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((id, locale)): Path<(Uuid, String)>,
) -> AppResult<Json<ApiResponse<()>>> {
    if !auth.can_edit() {
        return Err(AppError::Forbidden("Editor or admin role required".into()));
    }

    let result =
        sqlx::query("DELETE FROM items.item_translations WHERE item_id = $1 AND locale = $2")
            .bind(id)
            .bind(&locale)
            .execute(&state.pool)
            .await
            .map_err(AppError::Database)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!(
            "No '{}' translation found for this item",
            locale
        )));
    }

    Ok(Json(ApiResponse::success(())))
}
