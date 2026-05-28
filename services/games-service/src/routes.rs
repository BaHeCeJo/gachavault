use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use shared_auth::AuthUser;
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::{db, models::*};

#[derive(Debug, Deserialize)]
pub struct GamesQuery {
    pub include_inactive: Option<bool>,
    pub locale: Option<String>,
}

pub async fn list_games(
    State(pool): State<PgPool>,
    Query(query): Query<GamesQuery>,
) -> AppResult<Json<ApiResponse<Vec<serde_json::Value>>>> {
    let games = db::list_games(&pool, query.include_inactive.unwrap_or(false))
        .await
        .map_err(AppError::Database)?;

    let locale = query.locale.as_deref().unwrap_or("en");
    let mut result = Vec::with_capacity(games.len());
    for game in games {
        let translated = apply_game_translation(&pool, game, locale).await;
        result.push(translated);
    }
    Ok(Json(ApiResponse::success(result)))
}

#[derive(Debug, Deserialize)]
pub struct LocaleQuery {
    pub locale: Option<String>,
}

pub async fn get_game(
    State(pool): State<PgPool>,
    Path(slug): Path<String>,
    Query(query): Query<LocaleQuery>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let locale = query.locale.as_deref().unwrap_or("en");
    let translated = apply_game_translation(&pool, game, locale).await;
    Ok(Json(ApiResponse::success(translated)))
}

async fn apply_game_translation(pool: &PgPool, game: DbGame, locale: &str) -> serde_json::Value {
    let mut obj = serde_json::json!({
        "id": game.id,
        "slug": game.slug,
        "name": game.name,
        "description": game.description,
        "logo_url": game.logo_url,
        "banner_url": game.banner_url,
        "is_active": game.is_active,
        "created_at": game.created_at,
        "updated_at": game.updated_at,
    });

    if locale != "en" {
        if let Ok(Some(row)) = sqlx::query(
            "SELECT name, description FROM games.translations WHERE game_id = $1 AND locale = $2",
        )
        .bind(game.id)
        .bind(locale)
        .fetch_optional(pool)
        .await
        {
            if let Ok(name) = row.try_get::<String, _>("name") {
                obj["name"] = serde_json::Value::String(name);
            }
            if let Ok(desc) = row.try_get::<Option<String>, _>("description") {
                obj["description"] = serde_json::json!(desc);
            }
        }
    }

    obj
}

pub async fn create_game(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<CreateGameRequest>,
) -> AppResult<Json<ApiResponse<DbGame>>> {
    ensure_admin(&auth)?;

    if body.slug.is_empty() || body.name.is_empty() {
        return Err(AppError::BadRequest("slug and name are required".into()));
    }
    if !body
        .slug
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err(AppError::BadRequest(
            "slug must only contain lowercase letters, numbers, and hyphens".into(),
        ));
    }

    let game = db::create_game(
        &pool,
        &body.slug,
        &body.name,
        body.description.as_deref(),
        body.logo_url.as_deref(),
        body.banner_url.as_deref(),
    )
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db_err) if db_err.constraint() == Some("games_slug_key") => {
            AppError::Conflict(format!("A game with slug '{}' already exists", body.slug))
        }
        other => AppError::Database(other),
    })?;

    Ok(Json(ApiResponse::success(game)))
}

pub async fn update_game(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(slug): Path<String>,
    Json(body): Json<UpdateGameRequest>,
) -> AppResult<Json<ApiResponse<DbGame>>> {
    ensure_admin(&auth)?;

    let existing = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let game = db::update_game(
        &pool,
        existing.id,
        body.name.as_deref(),
        body.description.as_deref(),
        body.logo_url.as_deref(),
        body.banner_url.as_deref(),
        body.is_active,
    )
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    Ok(Json(ApiResponse::success(game)))
}

pub async fn delete_game(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(slug): Path<String>,
) -> AppResult<Json<ApiResponse<()>>> {
    ensure_admin(&auth)?;

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    db::delete_game(&pool, game.id)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(())))
}

pub async fn list_sections(
    State(pool): State<PgPool>,
    Path(slug): Path<String>,
) -> AppResult<Json<ApiResponse<Vec<DbSection>>>> {
    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let sections = db::list_sections(&pool, game.id)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(sections)))
}

pub async fn create_section(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(slug): Path<String>,
    Json(body): Json<CreateSectionRequest>,
) -> AppResult<Json<ApiResponse<DbSection>>> {
    ensure_admin(&auth)?;

    if body.slug.is_empty() || body.name.is_empty() {
        return Err(AppError::BadRequest("slug and name are required".into()));
    }

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let section = db::create_section(
        &pool,
        game.id,
        &body.slug,
        &body.name,
        body.order.unwrap_or(0),
    )
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db_err)
            if db_err.constraint() == Some("sections_game_id_slug_key") =>
        {
            AppError::Conflict(format!(
                "Section '{}' already exists in this game",
                body.slug
            ))
        }
        other => AppError::Database(other),
    })?;

    Ok(Json(ApiResponse::success(section)))
}

pub async fn get_section(
    State(pool): State<PgPool>,
    Path(section_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let row = sqlx::query(
        r#"SELECT s.id, s.game_id, s.slug, s.name, s."order", s.tabs, g.slug AS game_slug
           FROM games.sections s
           JOIN games.games g ON g.id = s.game_id
           WHERE s.id = $1"#,
    )
    .bind(section_id)
    .fetch_optional(&pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Section not found".into()))?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "id":        row.get::<Uuid, _>("id"),
        "game_id":   row.get::<Uuid, _>("game_id"),
        "game_slug": row.get::<String, _>("game_slug"),
        "slug":      row.get::<String, _>("slug"),
        "name":      row.get::<String, _>("name"),
        "order":     row.get::<i32, _>("order"),
        "tabs":      row.get::<serde_json::Value, _>("tabs"),
    }))))
}

// ── Game Attributes ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AttributeQuery {
    pub attr_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAttributeRequest {
    pub attr_type: String,
    pub key: String,
    pub name: String,
    pub icon_url: Option<String>,
    pub color: Option<String>,
    pub extra: Option<serde_json::Value>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAttributeRequest {
    pub name: Option<String>,
    pub icon_url: Option<String>,
    pub color: Option<String>,
    pub extra: Option<serde_json::Value>,
    pub sort_order: Option<i32>,
}

fn attr_row_to_json(row: &sqlx::postgres::PgRow) -> serde_json::Value {
    serde_json::json!({
        "id":         row.get::<Uuid, _>("id"),
        "game_id":    row.get::<Uuid, _>("game_id"),
        "attr_type":  row.get::<String, _>("attr_type"),
        "key":        row.get::<String, _>("key"),
        "name":       row.get::<String, _>("name"),
        "icon_url":   row.try_get::<String, _>("icon_url").ok(),
        "color":      row.try_get::<String, _>("color").ok(),
        "extra":      row.get::<serde_json::Value, _>("extra"),
        "sort_order": row.get::<i32, _>("sort_order"),
    })
}

pub async fn list_attributes(
    State(pool): State<PgPool>,
    Path(slug): Path<String>,
    Query(query): Query<AttributeQuery>,
) -> AppResult<Json<ApiResponse<Vec<serde_json::Value>>>> {
    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let rows = if let Some(ref attr_type) = query.attr_type {
        sqlx::query(
            r#"SELECT id, game_id, attr_type, key, name, icon_url, color, extra, sort_order
               FROM games.attributes WHERE game_id = $1 AND attr_type = $2
               ORDER BY sort_order ASC, name ASC"#,
        )
        .bind(game.id)
        .bind(attr_type)
        .fetch_all(&pool)
        .await
        .map_err(AppError::Database)?
    } else {
        sqlx::query(
            r#"SELECT id, game_id, attr_type, key, name, icon_url, color, extra, sort_order
               FROM games.attributes WHERE game_id = $1
               ORDER BY attr_type ASC, sort_order ASC, name ASC"#,
        )
        .bind(game.id)
        .fetch_all(&pool)
        .await
        .map_err(AppError::Database)?
    };

    let attrs: Vec<serde_json::Value> = rows.iter().map(attr_row_to_json).collect();
    Ok(Json(ApiResponse::success(attrs)))
}

pub async fn create_attribute(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(slug): Path<String>,
    Json(body): Json<CreateAttributeRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    ensure_admin(&auth)?;

    if body.attr_type.is_empty() || body.key.is_empty() || body.name.is_empty() {
        return Err(AppError::BadRequest(
            "attr_type, key, and name are required".into(),
        ));
    }

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let row = sqlx::query(
        r#"INSERT INTO games.attributes (game_id, attr_type, key, name, icon_url, color, extra, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, game_id, attr_type, key, name, icon_url, color, extra, sort_order"#,
    )
    .bind(game.id)
    .bind(&body.attr_type)
    .bind(&body.key)
    .bind(&body.name)
    .bind(body.icon_url.as_deref())
    .bind(body.color.as_deref())
    .bind(body.extra.as_ref().unwrap_or(&serde_json::Value::Object(Default::default())))
    .bind(body.sort_order.unwrap_or(0))
    .fetch_one(&pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db_err) if db_err.constraint() == Some("attributes_game_id_attr_type_key_key") => {
            AppError::Conflict(format!("Attribute '{}' already exists for type '{}'", body.key, body.attr_type))
        }
        other => AppError::Database(other),
    })?;

    Ok(Json(ApiResponse::success(attr_row_to_json(&row))))
}

pub async fn update_attribute(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path((slug, attr_id)): Path<(String, Uuid)>,
    Json(body): Json<UpdateAttributeRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    ensure_admin(&auth)?;

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let row = sqlx::query(
        r#"UPDATE games.attributes SET
             name       = COALESCE($3, name),
             icon_url   = COALESCE($4, icon_url),
             color      = COALESCE($5, color),
             extra      = COALESCE($6, extra),
             sort_order = COALESCE($7, sort_order)
           WHERE id = $1 AND game_id = $2
           RETURNING id, game_id, attr_type, key, name, icon_url, color, extra, sort_order"#,
    )
    .bind(attr_id)
    .bind(game.id)
    .bind(body.name.as_deref())
    .bind(body.icon_url.as_deref())
    .bind(body.color.as_deref())
    .bind(body.extra.as_ref())
    .bind(body.sort_order)
    .fetch_optional(&pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Attribute not found".into()))?;

    Ok(Json(ApiResponse::success(attr_row_to_json(&row))))
}

pub async fn delete_attribute(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path((slug, attr_id)): Path<(String, Uuid)>,
) -> AppResult<Json<ApiResponse<()>>> {
    ensure_admin(&auth)?;

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let result = sqlx::query("DELETE FROM games.attributes WHERE id = $1 AND game_id = $2")
        .bind(attr_id)
        .bind(game.id)
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Attribute not found".into()));
    }

    Ok(Json(ApiResponse::success(())))
}

pub async fn update_section(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path((slug, section_id)): Path<(String, Uuid)>,
    Json(body): Json<UpdateSectionRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    ensure_admin(&auth)?;

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let row = sqlx::query(
        r#"UPDATE games.sections SET
            name  = COALESCE($3, name),
            "order" = COALESCE($4, "order"),
            tabs  = COALESCE($5, tabs)
           WHERE id = $1 AND game_id = $2
           RETURNING id, game_id, slug, name, "order", tabs"#,
    )
    .bind(section_id)
    .bind(game.id)
    .bind(body.name.as_deref())
    .bind(body.order)
    .bind(body.tabs.as_ref())
    .fetch_optional(&pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Section not found".into()))?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "id":    row.get::<Uuid, _>("id"),
        "game_id": row.get::<Uuid, _>("game_id"),
        "slug":  row.get::<String, _>("slug"),
        "name":  row.get::<String, _>("name"),
        "order": row.get::<i32, _>("order"),
        "tabs":  row.get::<serde_json::Value, _>("tabs"),
    }))))
}

pub async fn delete_section(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path((slug, section_id)): Path<(String, Uuid)>,
) -> AppResult<Json<ApiResponse<()>>> {
    ensure_admin(&auth)?;

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let result = sqlx::query("DELETE FROM games.sections WHERE id = $1 AND game_id = $2")
        .bind(section_id)
        .bind(game.id)
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Section not found".into()));
    }

    Ok(Json(ApiResponse::success(())))
}

pub async fn list_schemas(
    State(pool): State<PgPool>,
    Path(slug): Path<String>,
) -> AppResult<Json<ApiResponse<Vec<DbSchema>>>> {
    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let schemas = db::list_schemas(&pool, game.id)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(schemas)))
}

pub async fn create_schema(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(slug): Path<String>,
    Json(body): Json<CreateSchemaRequest>,
) -> AppResult<Json<ApiResponse<DbSchema>>> {
    ensure_admin(&auth)?;

    if body.name.is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let schema = db::create_schema(
        &pool,
        game.id,
        body.section_id,
        &body.name,
        &body.fields,
        body.filter_attrs.as_ref(),
    )
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db_err)
            if db_err.constraint() == Some("item_type_schemas_section_unique") =>
        {
            AppError::Conflict("This section already has a schema. Only one schema per section is allowed.".into())
        }
        other => AppError::Database(other),
    })?;

    Ok(Json(ApiResponse::success(schema)))
}

pub async fn update_schema(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path((slug, schema_id)): Path<(String, Uuid)>,
    Json(body): Json<UpdateSchemaRequest>,
) -> AppResult<Json<ApiResponse<DbSchema>>> {
    ensure_admin(&auth)?;

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    // filter_attrs uses a tri-state update: $5 NULL means "don't touch", a
    // wrapped JSONB value (including JSONB 'null') means "overwrite". We
    // disambiguate with an extra $6 sentinel because we can't tell SQL NULL
    // from JSONB null otherwise.
    let (filter_attrs_present, filter_attrs_value): (bool, Option<serde_json::Value>) =
        match body.filter_attrs {
            None => (false, None),
            Some(None) => (true, None),
            Some(Some(v)) => (true, Some(v)),
        };

    let row = sqlx::query_as::<_, DbSchema>(
        "UPDATE games.item_type_schemas SET
            name = COALESCE($3, name),
            fields = COALESCE($4, fields),
            filter_attrs = CASE WHEN $6 THEN $5 ELSE filter_attrs END,
            updated_at = NOW()
         WHERE id = $1 AND game_id = $2
         RETURNING *",
    )
    .bind(schema_id)
    .bind(game.id)
    .bind(body.name.as_deref())
    .bind(body.fields.as_ref())
    .bind(filter_attrs_value)
    .bind(filter_attrs_present)
    .fetch_optional(&pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Schema not found".into()))?;

    Ok(Json(ApiResponse::success(row)))
}

pub async fn delete_schema(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path((slug, schema_id)): Path<(String, Uuid)>,
) -> AppResult<Json<ApiResponse<()>>> {
    ensure_admin(&auth)?;

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let result = sqlx::query("DELETE FROM games.item_type_schemas WHERE id = $1 AND game_id = $2")
        .bind(schema_id)
        .bind(game.id)
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Schema not found".into()));
    }

    Ok(Json(ApiResponse::success(())))
}

// ── Game Translations ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpsertGameTranslationRequest {
    pub name: String,
    pub description: Option<String>,
}

pub async fn list_game_translations(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(slug): Path<String>,
) -> AppResult<Json<ApiResponse<Vec<serde_json::Value>>>> {
    ensure_admin(&auth)?;

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let rows = sqlx::query(
        "SELECT locale, name, description, updated_at FROM games.translations WHERE game_id = $1 ORDER BY locale",
    )
    .bind(game.id)
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    let translations: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "locale":      r.get::<String, _>("locale"),
                "name":        r.get::<String, _>("name"),
                "description": r.try_get::<Option<String>, _>("description").ok().flatten(),
                "updated_at":  r.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"),
            })
        })
        .collect();

    Ok(Json(ApiResponse::success(translations)))
}

pub async fn upsert_game_translation(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path((slug, locale)): Path<(String, String)>,
    Json(body): Json<UpsertGameTranslationRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    ensure_admin(&auth)?;

    if body.name.is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }
    if locale == "en" {
        return Err(AppError::BadRequest(
            "Use the game update endpoint to edit English content".into(),
        ));
    }

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    sqlx::query(
        "INSERT INTO games.translations (game_id, locale, name, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (game_id, locale) DO UPDATE
           SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = NOW()",
    )
    .bind(game.id)
    .bind(&locale)
    .bind(&body.name)
    .bind(body.description.as_deref())
    .execute(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "game_id":     game.id,
        "locale":      locale,
        "name":        body.name,
        "description": body.description,
    }))))
}

pub async fn delete_game_translation(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path((slug, locale)): Path<(String, String)>,
) -> AppResult<Json<ApiResponse<()>>> {
    ensure_admin(&auth)?;

    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;

    let result = sqlx::query("DELETE FROM games.translations WHERE game_id = $1 AND locale = $2")
        .bind(game.id)
        .bind(&locale)
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!(
            "No '{}' translation found for this game",
            locale
        )));
    }

    Ok(Json(ApiResponse::success(())))
}

fn ensure_admin(auth: &AuthUser) -> AppResult<()> {
    if auth.is_admin() {
        Ok(())
    } else {
        Err(AppError::Forbidden("Admin role required".into()))
    }
}
