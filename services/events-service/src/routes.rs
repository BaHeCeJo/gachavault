use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use shared_auth::{AuthUser, OptionalAuthUser};
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use sqlx::PgPool;
use uuid::Uuid;

use crate::checklist;
use crate::db;
use crate::models::*;

#[derive(Debug, Deserialize)]
pub struct EventsQuery {
    /// Filter to a single game by slug (resolved to an id) ...
    pub game: Option<String>,
    /// ... or directly by id.
    pub game_id: Option<Uuid>,
    pub event_type: Option<String>,
    pub status: Option<String>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub locale: Option<String>,
    /// Admin-only: include unpublished/draft events in the listing.
    pub include_unpublished: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CalendarQuery {
    pub event_type: Option<String>,
    pub status: Option<String>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub locale: Option<String>,
}

// ── Public calendar ──────────────────────────────────────────────────────────

pub async fn list_events(
    State(pool): State<PgPool>,
    auth: OptionalAuthUser,
    Query(q): Query<EventsQuery>,
) -> AppResult<Json<ApiResponse<Vec<serde_json::Value>>>> {
    // Resolve a game slug to an id when one was supplied (id takes precedence).
    let game_id = match (q.game_id, q.game.as_deref()) {
        (Some(id), _) => Some(id),
        (None, Some(slug)) => db::resolve_game_id(&pool, slug)
            .await
            .map_err(AppError::Database)?,
        (None, None) => None,
    };
    // If a slug was given but matched no game, the calendar is simply empty.
    if q.game.is_some() && game_id.is_none() {
        return Ok(Json(ApiResponse::success(vec![])));
    }

    let is_admin = matches!(&auth.0, Some(c) if c.role == shared_auth::ROLE_ADMIN || c.role == shared_auth::ROLE_SUPERADMIN);
    let include_unpublished = is_admin && q.include_unpublished.unwrap_or(false);

    let filter = EventFilter {
        game_id,
        event_type: q.event_type.clone(),
        status: q.status.clone(),
        from: q.from,
        to: q.to,
    };

    let events = db::list_events(&pool, &filter, include_unpublished)
        .await
        .map_err(AppError::Database)?;

    let locale = q.locale.as_deref().unwrap_or("en");
    let rendered = render_events(&pool, events, locale).await?;
    Ok(Json(ApiResponse::success(rendered)))
}

pub async fn get_event(
    State(pool): State<PgPool>,
    auth: OptionalAuthUser,
    Path(id): Path<Uuid>,
    Query(q): Query<EventsQuery>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let event = db::find_event(&pool, id)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("Event not found".into()))?;

    // Draft (unpublished) events are visible only to admins; everyone else
    // gets the same 404 as a nonexistent id, so drafts aren't disclosed.
    let is_admin = matches!(&auth.0, Some(c) if c.role == shared_auth::ROLE_ADMIN || c.role == shared_auth::ROLE_SUPERADMIN);
    if !event.is_published && !is_admin {
        return Err(AppError::NotFound("Event not found".into()));
    }

    let locale = q.locale.as_deref().unwrap_or("en");
    let mut rendered = render_events(&pool, vec![event], locale).await?;
    Ok(Json(ApiResponse::success(rendered.remove(0))))
}

// ── Personalized calendar (auth) ─────────────────────────────────────────────

pub async fn my_calendar(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Query(q): Query<CalendarQuery>,
) -> AppResult<Json<ApiResponse<Vec<serde_json::Value>>>> {
    let filter = EventFilter {
        game_id: None,
        event_type: q.event_type.clone(),
        status: q.status.clone(),
        from: q.from,
        to: q.to,
    };
    let events = db::list_my_calendar(&pool, auth.id(), &filter)
        .await
        .map_err(AppError::Database)?;

    let locale = q.locale.as_deref().unwrap_or("en");
    let mut rendered = render_events(&pool, events, locale).await?;

    // Stamp each event with the user's chosen home server for its game, so the
    // frontend shows that server's window/countdown as the primary one.
    let server_by_game: std::collections::HashMap<String, String> =
        db::list_follows(&pool, auth.id())
            .await
            .map_err(AppError::Database)?
            .into_iter()
            .filter_map(|f| f.server.map(|s| (f.game_id.to_string(), s)))
            .collect();
    if !server_by_game.is_empty() {
        for ev in rendered.iter_mut() {
            if let Some(gid) = ev.get("game_id").and_then(|v| v.as_str()) {
                if let Some(server) = server_by_game.get(gid) {
                    ev["your_server"] = serde_json::json!(server);
                }
            }
        }
    }
    Ok(Json(ApiResponse::success(rendered)))
}

// ── Follows (auth) ───────────────────────────────────────────────────────────

pub async fn list_follows(
    State(pool): State<PgPool>,
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<Vec<serde_json::Value>>>> {
    let follows = db::list_follows(&pool, auth.id())
        .await
        .map_err(AppError::Database)?;

    let game_ids: Vec<Uuid> = follows.iter().map(|f| f.game_id).collect();
    let games = db::load_game_info(&pool, &game_ids)
        .await
        .map_err(AppError::Database)?;

    let result: Vec<serde_json::Value> = follows
        .into_iter()
        .map(|f| {
            let (slug, name) = games
                .get(&f.game_id)
                .cloned()
                .unwrap_or_else(|| (String::new(), String::new()));
            serde_json::json!({
                "game_id": f.game_id,
                "game_slug": slug,
                "game_name": name,
                "event_types": f.event_types,
                "server": f.server,
                "created_at": f.created_at,
            })
        })
        .collect();
    Ok(Json(ApiResponse::success(result)))
}

pub async fn upsert_follow(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(game_id): Path<Uuid>,
    Json(body): Json<UpsertFollowRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    if !db::game_exists(&pool, game_id)
        .await
        .map_err(AppError::Database)?
    {
        return Err(AppError::NotFound("Game not found".into()));
    }

    let follow = db::upsert_follow(
        &pool,
        auth.id(),
        game_id,
        body.event_types.as_deref(),
        body.server.as_deref(),
    )
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "game_id": follow.game_id,
        "event_types": follow.event_types,
        "server": follow.server,
        "created_at": follow.created_at,
    }))))
}

pub async fn delete_follow(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(game_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<()>>> {
    let removed = db::delete_follow(&pool, auth.id(), game_id)
        .await
        .map_err(AppError::Database)?;
    if !removed {
        return Err(AppError::NotFound("You are not following this game".into()));
    }
    Ok(Json(ApiResponse::success(())))
}

// ── Admin authoring ──────────────────────────────────────────────────────────

pub async fn create_event(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<CreateEventRequest>,
) -> AppResult<Json<ApiResponse<DbEvent>>> {
    ensure_admin(&auth)?;
    validate_event_fields(&body.slug, &body.title, body.start_at, body.end_at)?;

    if !db::game_exists(&pool, body.game_id)
        .await
        .map_err(AppError::Database)?
    {
        return Err(AppError::NotFound("Game not found".into()));
    }

    let event = db::create_event(&pool, auth.id(), &body)
        .await
        .map_err(|e| {
            let msg = format!(
                "An event with slug '{}' already exists for this game",
                body.slug
            );
            shared_errors::map_unique_violation(e, &[("events_game_id_slug_key", &msg)])
        })?;

    Ok(Json(ApiResponse::success(event)))
}

pub async fn update_event(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateEventRequest>,
) -> AppResult<Json<ApiResponse<DbEvent>>> {
    ensure_admin(&auth)?;

    if let (Some(start), Some(end)) = (body.start_at, body.end_at) {
        if end < start {
            return Err(AppError::BadRequest("end_at must be after start_at".into()));
        }
    }

    let event = db::update_event(&pool, id, &body)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("Event not found".into()))?;

    Ok(Json(ApiResponse::success(event)))
}

pub async fn delete_event(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<()>>> {
    ensure_admin(&auth)?;
    let removed = db::delete_event(&pool, id)
        .await
        .map_err(AppError::Database)?;
    if !removed {
        return Err(AppError::NotFound("Event not found".into()));
    }
    Ok(Json(ApiResponse::success(())))
}

pub async fn set_event_items(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<SetEventItemsRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    ensure_admin(&auth)?;

    // 404 rather than a foreign-key error if the event doesn't exist.
    if db::find_event(&pool, id)
        .await
        .map_err(AppError::Database)?
        .is_none()
    {
        return Err(AppError::NotFound("Event not found".into()));
    }

    db::replace_event_items(&pool, id, &body.items)
        .await
        .map_err(|e| {
            // An item_id that doesn't exist trips the cross-schema FK.
            shared_errors::map_unique_violation(
                e,
                &[("event_items_item_id_fkey", "One or more items do not exist")],
            )
        })?;

    let featured = db::load_featured_items(&pool, &[id])
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(serde_json::json!({
        "event_id": id,
        "featured_items": featured.get(&id).cloned().unwrap_or_default(),
    }))))
}

// ── Game servers ─────────────────────────────────────────────────────────────

pub async fn list_game_servers(
    State(pool): State<PgPool>,
    Path(game_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<DbGameServer>>>> {
    let servers = db::list_game_servers(&pool, game_id)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(servers)))
}

pub async fn set_game_servers(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(game_id): Path<Uuid>,
    Json(body): Json<SetServersRequest>,
) -> AppResult<Json<ApiResponse<Vec<DbGameServer>>>> {
    ensure_admin(&auth)?;

    let mut seen = std::collections::HashSet::new();
    for s in &body.servers {
        if s.key.is_empty() || s.name.is_empty() {
            return Err(AppError::BadRequest(
                "each server needs a key and a name".into(),
            ));
        }
        if !s
            .key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err(AppError::BadRequest(
                "server key may only contain letters, numbers, '-' and '_'".into(),
            ));
        }
        if !seen.insert(s.key.as_str()) {
            return Err(AppError::BadRequest(format!(
                "duplicate server key '{}'",
                s.key
            )));
        }
    }

    db::replace_game_servers(&pool, game_id, &body.servers)
        .await
        .map_err(AppError::Database)?;
    let servers = db::list_game_servers(&pool, game_id)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(servers)))
}

pub async fn set_event_server_times(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<SetServerTimesRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    ensure_admin(&auth)?;

    if db::find_event(&pool, id)
        .await
        .map_err(AppError::Database)?
        .is_none()
    {
        return Err(AppError::NotFound("Event not found".into()));
    }

    db::replace_event_server_times(&pool, id, &body.times)
        .await
        .map_err(AppError::Database)?;

    let times = db::load_event_server_times(&pool, &[id])
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(serde_json::json!({
        "event_id": id,
        "server_times": times.get(&id).cloned().unwrap_or_default(),
    }))))
}

// ── Event translations (admin) ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpsertEventTranslationRequest {
    pub title: String,
    pub description: Option<String>,
}

pub async fn list_event_translations(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<serde_json::Value>>>> {
    ensure_admin(&auth)?;

    let rows: Vec<(String, String, Option<String>, DateTime<Utc>)> = sqlx::query_as(
        "SELECT locale, title, description, updated_at \
         FROM events.event_translations WHERE event_id = $1 ORDER BY locale",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    let translations: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|(locale, title, description, updated_at)| {
            serde_json::json!({
                "locale": locale,
                "title": title,
                "description": description,
                "updated_at": updated_at,
            })
        })
        .collect();
    Ok(Json(ApiResponse::success(translations)))
}

pub async fn upsert_event_translation(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path((id, locale)): Path<(Uuid, String)>,
    Json(body): Json<UpsertEventTranslationRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    ensure_admin(&auth)?;

    if body.title.is_empty() {
        return Err(AppError::BadRequest("title is required".into()));
    }
    if locale == "en" {
        return Err(AppError::BadRequest(
            "Use the event update endpoint to edit English content".into(),
        ));
    }

    sqlx::query(
        "INSERT INTO events.event_translations (event_id, locale, title, description) \
         VALUES ($1, $2, $3, $4) \
         ON CONFLICT (event_id, locale) DO UPDATE \
           SET title = EXCLUDED.title, description = EXCLUDED.description, updated_at = NOW()",
    )
    .bind(id)
    .bind(&locale)
    .bind(&body.title)
    .bind(body.description.as_deref())
    .execute(&pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "event_id": id,
        "locale": locale,
        "title": body.title,
        "description": body.description,
    }))))
}

pub async fn delete_event_translation(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path((id, locale)): Path<(Uuid, String)>,
) -> AppResult<Json<ApiResponse<()>>> {
    ensure_admin(&auth)?;

    let result =
        sqlx::query("DELETE FROM events.event_translations WHERE event_id = $1 AND locale = $2")
            .bind(id)
            .bind(&locale)
            .execute(&pool)
            .await
            .map_err(AppError::Database)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!(
            "No '{}' translation found for this event",
            locale
        )));
    }
    Ok(Json(ApiResponse::success(())))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Enrich a set of events with their game info, featured items and (for
/// non-English locales) translated title/description, then render the public
/// JSON shape. Batch-loads each side table in a single query to avoid N+1.
async fn render_events(
    pool: &PgPool,
    events: Vec<DbEvent>,
    locale: &str,
) -> AppResult<Vec<serde_json::Value>> {
    if events.is_empty() {
        return Ok(vec![]);
    }

    let event_ids: Vec<Uuid> = events.iter().map(|e| e.id).collect();
    let game_ids: Vec<Uuid> = events.iter().map(|e| e.game_id).collect();

    let games = db::load_game_info(pool, &game_ids)
        .await
        .map_err(AppError::Database)?;
    let mut featured = db::load_featured_items(pool, &event_ids)
        .await
        .map_err(AppError::Database)?;
    let mut server_times = db::load_event_server_times(pool, &event_ids)
        .await
        .map_err(AppError::Database)?;
    let translations = if locale != "en" {
        db::load_event_translations(pool, &event_ids, locale)
            .await
            .map_err(AppError::Database)?
    } else {
        std::collections::HashMap::new()
    };

    let result = events
        .into_iter()
        .map(|event| {
            let (game_slug, game_name) = games
                .get(&event.game_id)
                .cloned()
                .unwrap_or_else(|| (String::new(), String::new()));
            let items = featured.remove(&event.id).unwrap_or_default();
            let servers = server_times.remove(&event.id).unwrap_or_default();
            let (title, description) = match translations.get(&event.id) {
                Some((t_title, t_desc)) => (t_title.clone(), t_desc.clone().or(event.description)),
                None => (event.title, event.description),
            };
            serde_json::json!({
                "id": event.id,
                "game_id": event.game_id,
                "game_slug": game_slug,
                "game_name": game_name,
                "event_type": event.event_type,
                "slug": event.slug,
                "title": title,
                "description": description,
                "image_url": event.image_url,
                "start_at": event.start_at,
                "end_at": event.end_at,
                "timezone": event.timezone,
                "data": event.data,
                "is_published": event.is_published,
                "featured_items": items,
                "server_times": servers,
                "your_server": serde_json::Value::Null,
                "created_at": event.created_at,
                "updated_at": event.updated_at,
            })
        })
        .collect();
    Ok(result)
}

fn validate_event_fields(
    slug: &str,
    title: &str,
    start_at: DateTime<Utc>,
    end_at: Option<DateTime<Utc>>,
) -> AppResult<()> {
    if slug.is_empty() || title.is_empty() {
        return Err(AppError::BadRequest("slug and title are required".into()));
    }
    if !slug.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(AppError::BadRequest(
            "slug must only contain letters, numbers, and hyphens".into(),
        ));
    }
    if let Some(end) = end_at {
        if end < start_at {
            return Err(AppError::BadRequest("end_at must be after start_at".into()));
        }
    }
    Ok(())
}

fn ensure_admin(auth: &AuthUser) -> AppResult<()> {
    if auth.is_admin() {
        Ok(())
    } else {
        Err(AppError::Forbidden("Admin role required".into()))
    }
}

// ── Checklists ───────────────────────────────────────────────────────────────

fn validate_cadence(
    kind: &str,
    interval_days: Option<i32>,
    reset_weekday: Option<i16>,
    reset_day_of_month: Option<i16>,
) -> AppResult<()> {
    match kind {
        "daily" => {}
        "weekly" => {
            if !matches!(reset_weekday, Some(0..=6)) {
                return Err(AppError::BadRequest(
                    "weekly cadence requires reset_weekday 0–6 (0=Mon)".into(),
                ));
            }
        }
        "monthly" => {
            if !matches!(reset_day_of_month, Some(1..=28)) {
                return Err(AppError::BadRequest(
                    "monthly cadence requires reset_day_of_month 1–28".into(),
                ));
            }
        }
        "interval" => {
            if !matches!(interval_days, Some(n) if n >= 1) {
                return Err(AppError::BadRequest(
                    "interval cadence requires interval_days >= 1".into(),
                ));
            }
        }
        _ => {
            return Err(AppError::BadRequest(
                "cadence_kind must be daily, weekly, monthly, or interval".into(),
            ))
        }
    }
    Ok(())
}

/// A user's resolved checklist for a game: admin defaults (minus hidden) plus
/// the user's own tasks, each tagged with `done`/`period_key`/`resets_at` for the
/// current period in the user's home-server timezone.
pub async fn get_checklist(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(game_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let ctx = checklist::resolve_reset_context(&pool, auth.id(), game_id)
        .await
        .map_err(AppError::Database)?;
    let now = Utc::now();

    let templates = checklist::list_templates(&pool, game_id, false)
        .await
        .map_err(AppError::Database)?;
    let hidden: std::collections::HashSet<Uuid> = checklist::list_hidden(&pool, auth.id(), game_id)
        .await
        .map_err(AppError::Database)?
        .into_iter()
        .collect();
    let user_tasks = checklist::list_user_tasks(&pool, auth.id(), game_id)
        .await
        .map_err(AppError::Database)?;

    // (rendered task json, source, id, current period key) — the trailing fields
    // let us batch the completion lookup and stamp `done` afterward.
    let mut rows: Vec<(serde_json::Value, String, Uuid, String)> = Vec::new();

    for t in templates.iter().filter(|t| !hidden.contains(&t.id)) {
        let cadence = checklist::Cadence {
            kind: t.cadence_kind.clone(),
            interval_days: t.interval_days,
            reset_weekday: t.reset_weekday,
            reset_day_of_month: t.reset_day_of_month,
        };
        let period = checklist::resolve_period(&cadence, ctx.tz, ctx.reset_hour, now);
        let key = period.key.clone();
        rows.push((
            serde_json::json!({
                "id": t.id,
                "source": "template",
                "editable": false,
                "title": t.title,
                "description": t.description,
                "cadence_kind": t.cadence_kind,
                "interval_days": t.interval_days,
                "reset_weekday": t.reset_weekday,
                "reset_day_of_month": t.reset_day_of_month,
                "sort_order": t.sort_order,
                "period_key": period.key,
                "resets_at": period.resets_at,
            }),
            "template".to_string(),
            t.id,
            key,
        ));
    }

    for t in user_tasks.iter() {
        let cadence = checklist::Cadence {
            kind: t.cadence_kind.clone(),
            interval_days: t.interval_days,
            reset_weekday: t.reset_weekday,
            reset_day_of_month: t.reset_day_of_month,
        };
        let period = checklist::resolve_period(&cadence, ctx.tz, ctx.reset_hour, now);
        let key = period.key.clone();
        rows.push((
            serde_json::json!({
                "id": t.id,
                "source": "custom",
                "editable": true,
                "title": t.title,
                "description": serde_json::Value::Null,
                "cadence_kind": t.cadence_kind,
                "interval_days": t.interval_days,
                "reset_weekday": t.reset_weekday,
                "reset_day_of_month": t.reset_day_of_month,
                "sort_order": t.sort_order,
                "period_key": period.key,
                "resets_at": period.resets_at,
            }),
            "custom".to_string(),
            t.id,
            key,
        ));
    }

    let triples: Vec<(String, Uuid, String)> = rows
        .iter()
        .map(|(_, s, id, k)| (s.clone(), *id, k.clone()))
        .collect();
    let completed = checklist::find_completed(&pool, auth.id(), &triples)
        .await
        .map_err(AppError::Database)?;

    let tasks: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|(mut value, source, id, key)| {
            let done = completed.contains(&(source, id, key));
            if let Some(obj) = value.as_object_mut() {
                obj.insert("done".into(), serde_json::Value::Bool(done));
            }
            value
        })
        .collect();

    let server = ctx.server_key.as_ref().map(|k| {
        serde_json::json!({
            "key": k,
            "name": ctx.server_name,
            "timezone": ctx.timezone,
            "reset_hour": ctx.reset_hour,
        })
    });

    // Hidden defaults the user opted out of — returned so the UI can offer to
    // restore them without needing the admin-only template list.
    let hidden_templates: Vec<serde_json::Value> = templates
        .iter()
        .filter(|t| hidden.contains(&t.id))
        .map(|t| {
            serde_json::json!({
                "id": t.id,
                "title": t.title,
                "cadence_kind": t.cadence_kind,
            })
        })
        .collect();

    Ok(Json(ApiResponse::success(serde_json::json!({
        "game_id": game_id,
        "server": server,
        "tasks": tasks,
        "hidden_templates": hidden_templates,
    }))))
}

/// Mark a task done/undone for the current period. Resolves the task's game +
/// cadence server-side so the client never supplies the period key.
pub async fn toggle_task(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<ToggleTaskRequest>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let (game_id, cadence) = match body.source.as_str() {
        "template" => {
            let t = checklist::find_template(&pool, body.task_id)
                .await
                .map_err(AppError::Database)?
                .ok_or_else(|| AppError::NotFound("Task not found".into()))?;
            (
                t.game_id,
                checklist::Cadence {
                    kind: t.cadence_kind,
                    interval_days: t.interval_days,
                    reset_weekday: t.reset_weekday,
                    reset_day_of_month: t.reset_day_of_month,
                },
            )
        }
        "custom" => {
            let t = checklist::find_user_task(&pool, body.task_id)
                .await
                .map_err(AppError::Database)?
                .ok_or_else(|| AppError::NotFound("Task not found".into()))?;
            if t.user_id != auth.id() {
                return Err(AppError::Forbidden("Not your task".into()));
            }
            (
                t.game_id,
                checklist::Cadence {
                    kind: t.cadence_kind,
                    interval_days: t.interval_days,
                    reset_weekday: t.reset_weekday,
                    reset_day_of_month: t.reset_day_of_month,
                },
            )
        }
        _ => {
            return Err(AppError::BadRequest(
                "source must be 'template' or 'custom'".into(),
            ))
        }
    };

    let ctx = checklist::resolve_reset_context(&pool, auth.id(), game_id)
        .await
        .map_err(AppError::Database)?;
    let period = checklist::resolve_period(&cadence, ctx.tz, ctx.reset_hour, Utc::now());

    checklist::set_completion(
        &pool,
        auth.id(),
        &body.source,
        body.task_id,
        &period.key,
        body.done,
    )
    .await
    .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "id": body.task_id,
        "source": body.source,
        "done": body.done,
        "period_key": period.key,
        "resets_at": period.resets_at,
    }))))
}

pub async fn create_custom_task(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<CreateUserTaskRequest>,
) -> AppResult<Json<ApiResponse<DbUserTask>>> {
    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("title is required".into()));
    }
    validate_cadence(
        &body.cadence_kind,
        body.interval_days,
        body.reset_weekday,
        body.reset_day_of_month,
    )?;

    let task = checklist::create_user_task(&pool, auth.id(), &body)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(task)))
}

pub async fn update_custom_task(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateUserTaskRequest>,
) -> AppResult<Json<ApiResponse<DbUserTask>>> {
    // When cadence is being changed, validate the resulting combination.
    if let Some(kind) = body.cadence_kind.as_deref() {
        validate_cadence(
            kind,
            body.interval_days,
            body.reset_weekday,
            body.reset_day_of_month,
        )?;
    }
    if let Some(title) = body.title.as_deref() {
        if title.trim().is_empty() {
            return Err(AppError::BadRequest("title cannot be empty".into()));
        }
    }

    let task = checklist::update_user_task(&pool, auth.id(), id, &body)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;
    Ok(Json(ApiResponse::success(task)))
}

pub async fn delete_custom_task(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<()>>> {
    let removed = checklist::delete_user_task(&pool, auth.id(), id)
        .await
        .map_err(AppError::Database)?;
    if !removed {
        return Err(AppError::NotFound("Task not found".into()));
    }
    Ok(Json(ApiResponse::success(())))
}

pub async fn set_hidden(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(game_id): Path<Uuid>,
    Json(body): Json<SetHiddenRequest>,
) -> AppResult<Json<ApiResponse<()>>> {
    checklist::set_hidden(&pool, auth.id(), game_id, &body.template_ids)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(())))
}

// ── Checklist admin authoring ────────────────────────────────────────────────

pub async fn list_templates_admin(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(game_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<Vec<DbChecklistTemplate>>>> {
    ensure_admin(&auth)?;
    let templates = checklist::list_templates(&pool, game_id, true)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(templates)))
}

pub async fn set_templates(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(game_id): Path<Uuid>,
    Json(body): Json<SetTemplatesRequest>,
) -> AppResult<Json<ApiResponse<Vec<DbChecklistTemplate>>>> {
    ensure_admin(&auth)?;
    for t in &body.templates {
        if t.title.trim().is_empty() {
            return Err(AppError::BadRequest("every template needs a title".into()));
        }
        validate_cadence(
            &t.cadence_kind,
            t.interval_days,
            t.reset_weekday,
            t.reset_day_of_month,
        )?;
    }

    checklist::replace_templates(&pool, game_id, auth.id(), &body.templates)
        .await
        .map_err(AppError::Database)?;

    let templates = checklist::list_templates(&pool, game_id, true)
        .await
        .map_err(AppError::Database)?;
    Ok(Json(ApiResponse::success(templates)))
}
