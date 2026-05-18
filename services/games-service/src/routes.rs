use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use shared_auth::AuthUser;
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use sqlx::PgPool;

use crate::{db, models::*};

#[derive(Debug, Deserialize)]
pub struct GamesQuery {
    pub include_inactive: Option<bool>,
}

pub async fn list_games(
    State(pool): State<PgPool>,
    Query(query): Query<GamesQuery>,
) -> AppResult<Json<ApiResponse<Vec<DbGame>>>> {
    let games = db::list_games(&pool, query.include_inactive.unwrap_or(false))
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(games)))
}

pub async fn get_game(
    State(pool): State<PgPool>,
    Path(slug): Path<String>,
) -> AppResult<Json<ApiResponse<DbGame>>> {
    let game = db::find_game_by_slug(&pool, &slug)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound(format!("Game '{}' not found", slug)))?;
    Ok(Json(ApiResponse::success(game)))
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
    if !body.slug.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
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

    let section = db::create_section(&pool, game.id, &body.slug, &body.name, body.order.unwrap_or(0))
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(db_err)
                if db_err.constraint() == Some("sections_game_id_slug_key") =>
            {
                AppError::Conflict(format!("Section '{}' already exists in this game", body.slug))
            }
            other => AppError::Database(other),
        })?;

    Ok(Json(ApiResponse::success(section)))
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

    let schema = db::create_schema(&pool, game.id, body.section_id, &body.name, &body.fields)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(schema)))
}

fn ensure_admin(auth: &AuthUser) -> AppResult<()> {
    // TODO: check actual role from DB — for now any authenticated user can admin
    // This will be replaced with a proper role check against user_roles table
    let _ = auth;
    Ok(())
}
