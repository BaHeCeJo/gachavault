use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{DbBuild, DbChangelog, DbItem, DbItemFull, DbSkill};

#[allow(dead_code)]
pub async fn list_items(
    pool: &PgPool,
    game_id: Option<Uuid>,
    section_id: Option<Uuid>,
    limit: i64,
    offset: i64,
) -> Result<Vec<DbItem>, sqlx::Error> {
    sqlx::query_as!(
        DbItem,
        r#"SELECT * FROM items.items
           WHERE ($1::uuid IS NULL OR game_id = $1)
             AND ($2::uuid IS NULL OR section_id = $2)
           ORDER BY slug ASC
           LIMIT $3 OFFSET $4"#,
        game_id,
        section_id,
        limit,
        offset,
    )
    .fetch_all(pool)
    .await
}

pub async fn find_item_by_id(pool: &PgPool, id: Uuid) -> Result<Option<DbItem>, sqlx::Error> {
    sqlx::query_as!(DbItem, "SELECT * FROM items.items WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn find_item_by_slugs(
    pool: &PgPool,
    game_slug: &str,
    section_slug: &str,
    item_slug: &str,
) -> Result<Option<DbItem>, sqlx::Error> {
    sqlx::query_as::<_, DbItem>(
        "SELECT i.id, i.game_id, i.section_id, i.type_schema_id, i.slug, i.data, i.version,
                i.created_by, i.created_at, i.updated_at
         FROM items.items i
         JOIN games.games g ON g.id = i.game_id
         JOIN games.sections s ON s.id = i.section_id
         WHERE g.slug = $1 AND s.slug = $2 AND i.slug = $3",
    )
    .bind(game_slug)
    .bind(section_slug)
    .bind(item_slug)
    .fetch_optional(pool)
    .await
}

pub async fn list_items_full(
    pool: &PgPool,
    game_id: Option<Uuid>,
    section_id: Option<Uuid>,
    limit: i64,
    offset: i64,
) -> Result<Vec<DbItemFull>, sqlx::Error> {
    sqlx::query_as::<_, DbItemFull>(
        "SELECT i.id, i.game_id, i.section_id, i.type_schema_id, i.slug, i.data, i.version,
                i.created_by, i.created_at, i.updated_at,
                g.slug AS game_slug, s.slug AS section_slug
         FROM items.items i
         JOIN games.games g ON g.id = i.game_id
         JOIN games.sections s ON s.id = i.section_id
         WHERE ($1::uuid IS NULL OR i.game_id = $1)
           AND ($2::uuid IS NULL OR i.section_id = $2)
         ORDER BY i.slug ASC
         LIMIT $3 OFFSET $4",
    )
    .bind(game_id)
    .bind(section_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await
}

#[allow(dead_code)]
pub async fn find_item_by_game_slug(
    pool: &PgPool,
    game_id: Uuid,
    slug: &str,
) -> Result<Option<DbItem>, sqlx::Error> {
    sqlx::query_as!(
        DbItem,
        "SELECT * FROM items.items WHERE game_id = $1 AND slug = $2",
        game_id,
        slug
    )
    .fetch_optional(pool)
    .await
}

pub async fn create_item(
    pool: &PgPool,
    game_id: Uuid,
    section_id: Uuid,
    type_schema_id: Uuid,
    slug: &str,
    data: &serde_json::Value,
    created_by: Uuid,
) -> Result<DbItem, sqlx::Error> {
    sqlx::query_as!(
        DbItem,
        r#"INSERT INTO items.items (game_id, section_id, type_schema_id, slug, data, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *"#,
        game_id,
        section_id,
        type_schema_id,
        slug,
        data,
        created_by,
    )
    .fetch_one(pool)
    .await
}

pub async fn update_item(
    pool: &PgPool,
    id: Uuid,
    slug: Option<&str>,
    data: Option<&serde_json::Value>,
) -> Result<Option<DbItem>, sqlx::Error> {
    sqlx::query_as!(
        DbItem,
        r#"UPDATE items.items SET
            slug = COALESCE($2, slug),
            data = COALESCE($3, data),
            version = version + 1,
            updated_at = NOW()
           WHERE id = $1
           RETURNING *"#,
        id,
        slug,
        data,
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_item(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM items.items WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn list_skills(pool: &PgPool, item_id: Uuid) -> Result<Vec<DbSkill>, sqlx::Error> {
    sqlx::query_as!(
        DbSkill,
        r#"SELECT id, item_id, name, description, skill_type, data, "order" as "order: i32"
           FROM items.item_skills WHERE item_id = $1 ORDER BY "order" ASC"#,
        item_id
    )
    .fetch_all(pool)
    .await
}

pub async fn create_skill(
    pool: &PgPool,
    item_id: Uuid,
    name: &str,
    description: Option<&str>,
    skill_type: Option<&str>,
    data: &serde_json::Value,
    order: i32,
) -> Result<DbSkill, sqlx::Error> {
    sqlx::query_as!(
        DbSkill,
        r#"INSERT INTO items.item_skills (item_id, name, description, skill_type, data, "order")
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, item_id, name, description, skill_type, data, "order" as "order: i32""#,
        item_id,
        name,
        description,
        skill_type,
        data,
        order,
    )
    .fetch_one(pool)
    .await
}

pub async fn list_builds(pool: &PgPool, item_id: Uuid) -> Result<Vec<DbBuild>, sqlx::Error> {
    sqlx::query_as!(
        DbBuild,
        "SELECT * FROM items.item_builds WHERE item_id = $1 ORDER BY created_at DESC",
        item_id
    )
    .fetch_all(pool)
    .await
}

pub async fn create_build(
    pool: &PgPool,
    item_id: Uuid,
    title: &str,
    content: &serde_json::Value,
    created_by: Uuid,
) -> Result<DbBuild, sqlx::Error> {
    sqlx::query_as!(
        DbBuild,
        r#"INSERT INTO items.item_builds (item_id, title, content, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING *"#,
        item_id,
        title,
        content,
        created_by,
    )
    .fetch_one(pool)
    .await
}

pub async fn list_changelog(pool: &PgPool, item_id: Uuid) -> Result<Vec<DbChangelog>, sqlx::Error> {
    sqlx::query_as!(
        DbChangelog,
        "SELECT * FROM items.item_changelog WHERE item_id = $1 ORDER BY created_at DESC",
        item_id
    )
    .fetch_all(pool)
    .await
}

pub async fn create_changelog(
    pool: &PgPool,
    item_id: Uuid,
    version: &str,
    patch: Option<&str>,
    changes: &str,
    change_date: Option<NaiveDate>,
) -> Result<DbChangelog, sqlx::Error> {
    sqlx::query_as!(
        DbChangelog,
        r#"INSERT INTO items.item_changelog (item_id, version, patch, changes, change_date)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
        item_id,
        version,
        patch,
        changes,
        change_date,
    )
    .fetch_one(pool)
    .await
}
