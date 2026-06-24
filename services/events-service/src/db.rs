use std::collections::HashMap;

use sqlx::{PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::models::{CreateEventRequest, DbEvent, DbFollow, EventFilter, FeaturedItemInput};

// Runtime query forms (not the `query_as!` macros) throughout this service, so
// editing SQL never requires regenerating the `.sqlx` offline cache — the
// Docker build runs with SQLX_OFFLINE=true and no database to check against.

/// Resolve a game slug to its id via a cross-schema read. Returns None when no
/// such game exists.
pub async fn resolve_game_id(pool: &PgPool, slug: &str) -> Result<Option<Uuid>, sqlx::Error> {
    let row: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM games.games WHERE slug = $1")
        .bind(slug)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(id,)| id))
}

pub async fn game_exists(pool: &PgPool, game_id: Uuid) -> Result<bool, sqlx::Error> {
    let row: Option<(i32,)> = sqlx::query_as("SELECT 1 FROM games.games WHERE id = $1")
        .bind(game_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.is_some())
}

/// Append the shared time/type/game WHERE conditions. The builder must already
/// be positioned so that appending " AND ..." is valid (i.e. it ends in a
/// `WHERE <something>` clause).
fn apply_filters(qb: &mut QueryBuilder<'_, Postgres>, filter: &EventFilter) {
    if let Some(game_id) = filter.game_id {
        qb.push(" AND e.game_id = ").push_bind(game_id);
    }
    if let Some(ref t) = filter.event_type {
        qb.push(" AND e.event_type = ").push_bind(t.clone());
    }
    match filter.status.as_deref() {
        Some("active") => {
            qb.push(" AND e.start_at <= NOW() AND (e.end_at IS NULL OR e.end_at >= NOW())");
        }
        Some("upcoming") => {
            qb.push(" AND e.start_at > NOW()");
        }
        Some("past") => {
            qb.push(" AND e.end_at IS NOT NULL AND e.end_at < NOW()");
        }
        _ => {}
    }
    if let Some(from) = filter.from {
        // Event overlaps the window if it hasn't already ended before `from`.
        qb.push(" AND (e.end_at IS NULL OR e.end_at >= ")
            .push_bind(from)
            .push(")");
    }
    if let Some(to) = filter.to {
        qb.push(" AND e.start_at <= ").push_bind(to);
    }
}

/// Global / per-game calendar list. `include_unpublished` is admin-only; public
/// callers always pass false.
pub async fn list_events(
    pool: &PgPool,
    filter: &EventFilter,
    include_unpublished: bool,
) -> Result<Vec<DbEvent>, sqlx::Error> {
    let mut qb = QueryBuilder::new("SELECT e.* FROM events.events e WHERE TRUE");
    if !include_unpublished {
        qb.push(" AND e.is_published = TRUE");
    }
    apply_filters(&mut qb, filter);
    qb.push(" ORDER BY e.start_at ASC");
    qb.build_query_as::<DbEvent>().fetch_all(pool).await
}

/// Personalized calendar: published events for the games a user follows,
/// honoring each follow's optional event-type filter.
pub async fn list_my_calendar(
    pool: &PgPool,
    user_id: Uuid,
    filter: &EventFilter,
) -> Result<Vec<DbEvent>, sqlx::Error> {
    let mut qb = QueryBuilder::new(
        "SELECT e.* FROM events.events e \
         JOIN events.user_game_follows f ON f.game_id = e.game_id \
         WHERE e.is_published = TRUE AND f.user_id = ",
    );
    qb.push_bind(user_id);
    qb.push(" AND (f.event_types IS NULL OR e.event_type = ANY(f.event_types))");
    apply_filters(&mut qb, filter);
    qb.push(" ORDER BY e.start_at ASC");
    qb.build_query_as::<DbEvent>().fetch_all(pool).await
}

pub async fn find_event(pool: &PgPool, id: Uuid) -> Result<Option<DbEvent>, sqlx::Error> {
    sqlx::query_as::<_, DbEvent>("SELECT * FROM events.events WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn create_event(
    pool: &PgPool,
    created_by: Uuid,
    body: &CreateEventRequest,
) -> Result<DbEvent, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let event = sqlx::query_as::<_, DbEvent>(
        r#"INSERT INTO events.events
             (game_id, event_type, slug, title, description, image_url,
              start_at, end_at, timezone, data, is_published, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING *"#,
    )
    .bind(body.game_id)
    .bind(body.event_type.as_deref().unwrap_or("banner"))
    .bind(&body.slug)
    .bind(&body.title)
    .bind(body.description.as_deref())
    .bind(body.image_url.as_deref())
    .bind(body.start_at)
    .bind(body.end_at)
    .bind(body.timezone.as_deref().unwrap_or("UTC"))
    .bind(body.data.clone().unwrap_or_else(|| serde_json::json!({})))
    .bind(body.is_published.unwrap_or(true))
    .bind(created_by)
    .fetch_one(&mut *tx)
    .await?;

    if let Some(items) = &body.featured_items {
        insert_event_items(&mut tx, event.id, items).await?;
    }

    tx.commit().await?;
    Ok(event)
}

pub async fn update_event(
    pool: &PgPool,
    id: Uuid,
    body: &crate::models::UpdateEventRequest,
) -> Result<Option<DbEvent>, sqlx::Error> {
    sqlx::query_as::<_, DbEvent>(
        r#"UPDATE events.events SET
             event_type   = COALESCE($2, event_type),
             title        = COALESCE($3, title),
             description   = COALESCE($4, description),
             image_url    = COALESCE($5, image_url),
             start_at     = COALESCE($6, start_at),
             end_at       = COALESCE($7, end_at),
             timezone     = COALESCE($8, timezone),
             data         = COALESCE($9, data),
             is_published = COALESCE($10, is_published),
             updated_at   = NOW()
           WHERE id = $1
           RETURNING *"#,
    )
    .bind(id)
    .bind(body.event_type.as_deref())
    .bind(body.title.as_deref())
    .bind(body.description.as_deref())
    .bind(body.image_url.as_deref())
    .bind(body.start_at)
    .bind(body.end_at)
    .bind(body.timezone.as_deref())
    .bind(body.data.as_ref())
    .bind(body.is_published)
    .fetch_optional(pool)
    .await
}

pub async fn delete_event(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM events.events WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Replace the full featured-item set of an event in one transaction.
pub async fn replace_event_items(
    pool: &PgPool,
    event_id: Uuid,
    items: &[FeaturedItemInput],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM events.event_items WHERE event_id = $1")
        .bind(event_id)
        .execute(&mut *tx)
        .await?;
    insert_event_items(&mut tx, event_id, items).await?;
    tx.commit().await
}

async fn insert_event_items(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    event_id: Uuid,
    items: &[FeaturedItemInput],
) -> Result<(), sqlx::Error> {
    for (idx, item) in items.iter().enumerate() {
        sqlx::query(
            r#"INSERT INTO events.event_items (event_id, item_id, role, "order")
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (event_id, item_id) DO UPDATE
                 SET role = EXCLUDED.role, "order" = EXCLUDED."order""#,
        )
        .bind(event_id)
        .bind(item.item_id)
        .bind(item.role.as_deref().unwrap_or("featured"))
        .bind(item.order.unwrap_or(idx as i32))
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

/// (slug, name) for each requested game id, for embedding in event responses.
pub async fn load_game_info(
    pool: &PgPool,
    game_ids: &[Uuid],
) -> Result<HashMap<Uuid, (String, String)>, sqlx::Error> {
    if game_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows: Vec<(Uuid, String, String)> =
        sqlx::query_as("SELECT id, slug, name FROM games.games WHERE id = ANY($1)")
            .bind(game_ids)
            .fetch_all(pool)
            .await?;
    Ok(rows
        .into_iter()
        .map(|(id, slug, name)| (id, (slug, name)))
        .collect())
}

/// Featured items grouped by event id, joined to items.items for the item slug
/// and data (icons, rarity, etc.) the frontend renders.
pub async fn load_featured_items(
    pool: &PgPool,
    event_ids: &[Uuid],
) -> Result<HashMap<Uuid, Vec<serde_json::Value>>, sqlx::Error> {
    if event_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows: Vec<(Uuid, Uuid, String, i32, String, serde_json::Value)> = sqlx::query_as(
        r#"SELECT ei.event_id, ei.item_id, ei.role, ei."order", i.slug, i.data
           FROM events.event_items ei
           JOIN items.items i ON i.id = ei.item_id
           WHERE ei.event_id = ANY($1)
           ORDER BY ei.event_id, ei."order" ASC"#,
    )
    .bind(event_ids)
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<Uuid, Vec<serde_json::Value>> = HashMap::new();
    for (event_id, item_id, role, order, slug, data) in rows {
        map.entry(event_id).or_default().push(serde_json::json!({
            "item_id": item_id,
            "slug": slug,
            "role": role,
            "order": order,
            "data": data,
        }));
    }
    Ok(map)
}

/// (title, description) override per event for a locale.
pub async fn load_event_translations(
    pool: &PgPool,
    event_ids: &[Uuid],
    locale: &str,
) -> Result<HashMap<Uuid, (String, Option<String>)>, sqlx::Error> {
    if event_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows: Vec<(Uuid, String, Option<String>)> = sqlx::query_as(
        "SELECT event_id, title, description FROM events.event_translations \
         WHERE event_id = ANY($1) AND locale = $2",
    )
    .bind(event_ids)
    .bind(locale)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, title, desc)| (id, (title, desc)))
        .collect())
}

// ── Follows ──────────────────────────────────────────────────────────────────

pub async fn list_follows(pool: &PgPool, user_id: Uuid) -> Result<Vec<DbFollow>, sqlx::Error> {
    sqlx::query_as::<_, DbFollow>(
        "SELECT * FROM events.user_game_follows WHERE user_id = $1 ORDER BY created_at ASC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}

pub async fn upsert_follow(
    pool: &PgPool,
    user_id: Uuid,
    game_id: Uuid,
    event_types: Option<&[String]>,
) -> Result<DbFollow, sqlx::Error> {
    sqlx::query_as::<_, DbFollow>(
        r#"INSERT INTO events.user_game_follows (user_id, game_id, event_types)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, game_id) DO UPDATE SET event_types = EXCLUDED.event_types
           RETURNING *"#,
    )
    .bind(user_id)
    .bind(game_id)
    .bind(event_types)
    .fetch_one(pool)
    .await
}

pub async fn delete_follow(
    pool: &PgPool,
    user_id: Uuid,
    game_id: Uuid,
) -> Result<bool, sqlx::Error> {
    let result =
        sqlx::query("DELETE FROM events.user_game_follows WHERE user_id = $1 AND game_id = $2")
            .bind(user_id)
            .bind(game_id)
            .execute(pool)
            .await?;
    Ok(result.rows_affected() > 0)
}
