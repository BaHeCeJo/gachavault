use axum::{
    extract::{Path, Query, State},
    Json,
};
use shared_auth::AuthUser;
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{db, models::*};

pub async fn list_items(
    State(pool): State<PgPool>,
    Query(query): Query<ListItemsQuery>,
) -> AppResult<Json<ApiResponse<Vec<DbItem>>>> {
    let items = db::list_items(
        &pool,
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
    State(pool): State<PgPool>,
    Path(_game_slug): Path<String>,
    Query(query): Query<ListItemsQuery>,
) -> AppResult<Json<ApiResponse<Vec<DbItem>>>> {
    let items = db::list_items(
        &pool,
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
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<DbItem>>> {
    let item = db::find_item_by_id(&pool, id)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("Item not found".into()))?;
    Ok(Json(ApiResponse::success(item)))
}

pub async fn create_item(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<CreateItemRequest>,
) -> AppResult<Json<ApiResponse<DbItem>>> {
    if body.slug.is_empty() {
        return Err(AppError::BadRequest("slug is required".into()));
    }

    let item = db::create_item(
        &pool,
        body.game_id,
        body.section_id,
        body.type_schema_id,
        &body.slug,
        &body.data,
        auth.id(),
    )
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db_err) if db_err.constraint() == Some("items_game_id_slug_key") => {
            AppError::Conflict(format!("Item with slug '{}' already exists in this game", body.slug))
        }
        other => AppError::Database(other),
    })?;

    Ok(Json(ApiResponse::success(item)))
}

pub async fn update_item(
    State(pool): State<PgPool>,
    _auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateItemRequest>,
) -> AppResult<Json<ApiResponse<DbItem>>> {
    let item = db::update_item(&pool, id, body.slug.as_deref(), body.data.as_ref())
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("Item not found".into()))?;

    Ok(Json(ApiResponse::success(item)))
}

pub async fn delete_item(
    State(pool): State<PgPool>,
    _auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<()>>> {
    let deleted = db::delete_item(&pool, id)
        .await
        .map_err(AppError::Database)?;

    if !deleted {
        return Err(AppError::NotFound("Item not found".into()));
    }

    Ok(Json(ApiResponse::success(())))
}

pub async fn list_skills(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<DbSkill>>>> {
    let skills = db::list_skills(&pool, id)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(skills)))
}

pub async fn create_skill(
    State(pool): State<PgPool>,
    _auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateSkillRequest>,
) -> AppResult<Json<ApiResponse<DbSkill>>> {
    if body.name.is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }

    let empty = serde_json::json!({});
    let skill = db::create_skill(
        &pool,
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
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<DbBuild>>>> {
    let builds = db::list_builds(&pool, id)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(builds)))
}

pub async fn create_build(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateBuildRequest>,
) -> AppResult<Json<ApiResponse<DbBuild>>> {
    if body.title.is_empty() {
        return Err(AppError::BadRequest("title is required".into()));
    }

    let build = db::create_build(&pool, id, &body.title, &body.content, auth.id())
        .await
        .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(build)))
}

pub async fn list_changelog(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<DbChangelog>>>> {
    let entries = db::list_changelog(&pool, id)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(entries)))
}

pub async fn create_changelog(
    State(pool): State<PgPool>,
    _auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateChangelogRequest>,
) -> AppResult<Json<ApiResponse<DbChangelog>>> {
    if body.version.is_empty() || body.changes.is_empty() {
        return Err(AppError::BadRequest("version and changes are required".into()));
    }

    let entry = db::create_changelog(
        &pool,
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
