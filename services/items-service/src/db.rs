use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{DbBuild, DbChangelog, DbItem, DbItemFull, DbItemLinkFull, DbSkill};

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

// ── Item links ───────────────────────────────────────────────────────────────
//
// Runtime-checked queries (not `query_as!`) on purpose: the macro form bakes
// results into `.sqlx/`, which has to be regenerated against a live DB or the
// sealed Docker build breaks.

/// Rows joined against the item on the far side of the edge. `$3` selects which
/// column that is, so both directions share one query shape.
const ITEM_LINK_SELECT: &str = r#"
    SELECT l.id, l.item_id, l.linked_item_id, l.relation, l."order",
           o.slug, o.data, o.type_schema_id,
           g.slug AS game_slug, s.slug AS section_slug
    FROM items.item_links l
    JOIN items.items o ON o.id = "#;

const ITEM_LINK_TAIL: &str = r#"
    JOIN games.games g ON g.id = o.game_id
    JOIN games.sections s ON s.id = o.section_id
    WHERE l."#;

/// Items this one points at — e.g. the rate-up roster of a banner.
pub async fn list_item_links(
    pool: &PgPool,
    item_id: Uuid,
    relation: Option<&str>,
) -> Result<Vec<DbItemLinkFull>, sqlx::Error> {
    let sql = format!(
        "{}l.linked_item_id {}item_id = $1 AND ($2::varchar IS NULL OR l.relation = $2) \
         ORDER BY l.\"order\" ASC, o.slug ASC",
        ITEM_LINK_SELECT, ITEM_LINK_TAIL
    );
    sqlx::query_as::<_, DbItemLinkFull>(&sql)
        .bind(item_id)
        .bind(relation)
        .fetch_all(pool)
        .await
}

/// Items pointing at this one — e.g. every banner that featured this character.
pub async fn list_item_backlinks(
    pool: &PgPool,
    item_id: Uuid,
    relation: Option<&str>,
) -> Result<Vec<DbItemLinkFull>, sqlx::Error> {
    let sql = format!(
        "{}l.item_id {}linked_item_id = $1 AND ($2::varchar IS NULL OR l.relation = $2) \
         ORDER BY l.\"order\" ASC, o.slug ASC",
        ITEM_LINK_SELECT, ITEM_LINK_TAIL
    );
    sqlx::query_as::<_, DbItemLinkFull>(&sql)
        .bind(item_id)
        .bind(relation)
        .fetch_all(pool)
        .await
}

/// Replace every link of `relation` on `item_id` in one transaction. Links of
/// other relations are untouched. The same-game rule is enforced by a trigger,
/// so a cross-game id surfaces as a check violation the caller maps to 400.
pub async fn replace_item_links(
    pool: &PgPool,
    item_id: Uuid,
    relation: &str,
    links: &[(Uuid, i32)],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM items.item_links WHERE item_id = $1 AND relation = $2")
        .bind(item_id)
        .bind(relation)
        .execute(&mut *tx)
        .await?;

    for (linked_item_id, order) in links {
        sqlx::query(
            r#"INSERT INTO items.item_links (item_id, linked_item_id, relation, "order")
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (item_id, linked_item_id, relation) DO UPDATE
                 SET "order" = EXCLUDED."order""#,
        )
        .bind(item_id)
        .bind(linked_item_id)
        .bind(relation)
        .bind(order)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await
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
