use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{DbGame, DbSchema, DbSection};

pub async fn list_games(pool: &PgPool, include_inactive: bool) -> Result<Vec<DbGame>, sqlx::Error> {
    if include_inactive {
        sqlx::query_as!(DbGame, "SELECT * FROM games.games ORDER BY name ASC")
            .fetch_all(pool)
            .await
    } else {
        sqlx::query_as!(
            DbGame,
            "SELECT * FROM games.games WHERE is_active = TRUE ORDER BY name ASC"
        )
        .fetch_all(pool)
        .await
    }
}

pub async fn find_game_by_slug(pool: &PgPool, slug: &str) -> Result<Option<DbGame>, sqlx::Error> {
    sqlx::query_as!(DbGame, "SELECT * FROM games.games WHERE slug = $1", slug)
        .fetch_optional(pool)
        .await
}

pub async fn create_game(
    pool: &PgPool,
    slug: &str,
    name: &str,
    description: Option<&str>,
    logo_url: Option<&str>,
    banner_url: Option<&str>,
) -> Result<DbGame, sqlx::Error> {
    sqlx::query_as!(
        DbGame,
        r#"INSERT INTO games.games (slug, name, description, logo_url, banner_url)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
        slug,
        name,
        description,
        logo_url,
        banner_url,
    )
    .fetch_one(pool)
    .await
}

pub async fn update_game(
    pool: &PgPool,
    id: Uuid,
    name: Option<&str>,
    description: Option<&str>,
    logo_url: Option<&str>,
    banner_url: Option<&str>,
    is_active: Option<bool>,
) -> Result<Option<DbGame>, sqlx::Error> {
    sqlx::query_as!(
        DbGame,
        r#"UPDATE games.games SET
            name = COALESCE($2, name),
            description = COALESCE($3, description),
            logo_url = COALESCE($4, logo_url),
            banner_url = COALESCE($5, banner_url),
            is_active = COALESCE($6, is_active),
            updated_at = NOW()
           WHERE id = $1
           RETURNING *"#,
        id,
        name,
        description,
        logo_url,
        banner_url,
        is_active,
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_game(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM games.games WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn list_sections(pool: &PgPool, game_id: Uuid) -> Result<Vec<DbSection>, sqlx::Error> {
    sqlx::query_as!(
        DbSection,
        r#"SELECT id, game_id, slug, name, "order" as "order: i32"
           FROM games.sections WHERE game_id = $1 ORDER BY "order" ASC, name ASC"#,
        game_id
    )
    .fetch_all(pool)
    .await
}

pub async fn create_section(
    pool: &PgPool,
    game_id: Uuid,
    slug: &str,
    name: &str,
    order: i32,
) -> Result<DbSection, sqlx::Error> {
    sqlx::query_as!(
        DbSection,
        r#"INSERT INTO games.sections (game_id, slug, name, "order")
           VALUES ($1, $2, $3, $4)
           RETURNING id, game_id, slug, name, "order" as "order: i32""#,
        game_id,
        slug,
        name,
        order,
    )
    .fetch_one(pool)
    .await
}

pub async fn list_schemas(pool: &PgPool, game_id: Uuid) -> Result<Vec<DbSchema>, sqlx::Error> {
    // Runtime form (not query_as!) so adding columns doesn't require
    // regenerating the .sqlx offline cache — the Docker build container
    // has no DB and SQLX_OFFLINE=true is baked into the image build.
    sqlx::query_as::<_, DbSchema>(
        "SELECT * FROM games.item_type_schemas WHERE game_id = $1 ORDER BY name ASC",
    )
    .bind(game_id)
    .fetch_all(pool)
    .await
}

// One bind per schema column; grouping into a struct would just move the
// argument list elsewhere for no real clarity gain.
#[allow(clippy::too_many_arguments)]
pub async fn create_schema(
    pool: &PgPool,
    game_id: Uuid,
    section_id: Option<Uuid>,
    name: &str,
    fields: &serde_json::Value,
    filter_attrs: Option<&serde_json::Value>,
    card_layout: Option<&serde_json::Value>,
    page_layout: Option<&serde_json::Value>,
) -> Result<DbSchema, sqlx::Error> {
    sqlx::query_as::<_, DbSchema>(
        r#"INSERT INTO games.item_type_schemas (game_id, section_id, name, fields, filter_attrs, card_layout, page_layout)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *"#,
    )
    .bind(game_id)
    .bind(section_id)
    .bind(name)
    .bind(fields)
    .bind(filter_attrs)
    .bind(card_layout)
    .bind(page_layout)
    .fetch_one(pool)
    .await
}
