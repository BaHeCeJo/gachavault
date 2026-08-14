use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbEvent {
    pub id: Uuid,
    pub game_id: Uuid,
    pub event_type: String,
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub start_at: DateTime<Utc>,
    pub end_at: Option<DateTime<Utc>>,
    pub timezone: String,
    pub data: serde_json::Value,
    pub is_published: bool,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// The reusable banner this event is a run of (an item in the game's
    /// "Banners" section). NULL for non-banner events and for banner events
    /// not attached to a preset.
    pub banner_item_id: Option<Uuid>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbFollow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub game_id: Uuid,
    pub event_types: Option<Vec<String>>,
    pub server: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbGameServer {
    pub id: Uuid,
    pub game_id: Uuid,
    pub key: String,
    pub name: String,
    pub timezone: String,
    pub sort_order: i32,
    /// Server-local hour (0–23) the game's daily reset fires. Drives the
    /// checklist reset math; defaults to 4 (04:00, the common gacha reset).
    pub reset_hour: i16,
}

/// One regional server in a game's server list (admin authoring input).
#[derive(Debug, Deserialize)]
pub struct GameServerInput {
    pub key: String,
    pub name: String,
    pub timezone: Option<String>,
    pub sort_order: Option<i32>,
    pub reset_hour: Option<i16>,
}

#[derive(Debug, Deserialize)]
pub struct SetServersRequest {
    pub servers: Vec<GameServerInput>,
}

/// Per-server start/end for an event.
#[derive(Debug, Deserialize)]
pub struct ServerTimeInput {
    pub server_key: String,
    pub start_at: DateTime<Utc>,
    pub end_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct SetServerTimesRequest {
    pub times: Vec<ServerTimeInput>,
}

/// One featured item attached to an event (e.g. a rate-up unit on a banner).
/// Used both as request input (admin authoring) and — enriched with item slug
/// and data — as part of the rendered event response.
#[derive(Debug, Deserialize)]
pub struct FeaturedItemInput {
    pub item_id: Uuid,
    pub role: Option<String>,
    pub order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEventRequest {
    pub game_id: Uuid,
    pub event_type: Option<String>,
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub start_at: DateTime<Utc>,
    pub end_at: Option<DateTime<Utc>>,
    pub timezone: Option<String>,
    pub data: Option<serde_json::Value>,
    pub is_published: Option<bool>,
    /// Optional featured items to attach in the same request.
    pub featured_items: Option<Vec<FeaturedItemInput>>,
    /// Optional per-server start/end overrides attached in the same request.
    pub server_times: Option<Vec<ServerTimeInput>>,
    /// Attach this run to a reusable banner. Must belong to the same game.
    pub banner_item_id: Option<Uuid>,
    /// When true and `featured_items` is absent, seed this run's featured items
    /// from the banner's preset roster. The run's extra rate-ups (the 4★s that
    /// vary between reruns) are then added by editing the event.
    pub seed_from_banner: Option<bool>,
}

/// One row of an events bulk import. Everything is addressed by slug rather
/// than id, so a file can be authored (or generated from an external source)
/// without knowing any UUIDs — the same trade the items bulk import makes.
#[derive(Debug, Deserialize)]
pub struct BulkEventRow {
    /// Game slug, e.g. "honkai-star-rail".
    pub game: String,
    pub event_type: Option<String>,
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub start_at: DateTime<Utc>,
    pub end_at: Option<DateTime<Utc>>,
    pub timezone: Option<String>,
    pub data: Option<serde_json::Value>,
    pub is_published: Option<bool>,
    /// Slug of the banner preset this run belongs to, if any.
    pub banner: Option<String>,
    /// Featured item slugs, split the way banner rosters are authored. They
    /// land in event_items as the roles the rest of the app uses: featured_5
    /// as "featured" (the headline rate-up), featured_4 as "rate_up".
    pub featured_5: Option<Vec<String>>,
    pub featured_4: Option<Vec<String>>,
    /// Any other featured items, for events that aren't rate-up banners.
    pub featured: Option<Vec<String>>,
}

/// Query for the bulk import. `mode` is "skip" (default) or "update".
#[derive(Debug, Deserialize)]
pub struct BulkImportQuery {
    pub mode: Option<String>,
}

impl BulkImportQuery {
    /// Whether rows whose slug already exists should overwrite rather than be
    /// skipped. Only the exact word opts in: a typo, or a stale client sending
    /// nothing, lands on skip rather than quietly rewriting banner history.
    pub fn overwrites(&self) -> bool {
        self.mode.as_deref() == Some("update")
    }
}

/// Query for the bulk export — the other half of the correction loop. Narrows
/// to one game and/or event type so a file can be edited and sent straight back
/// through the import without carrying rows nobody meant to touch.
#[derive(Debug, Deserialize)]
pub struct BulkExportQuery {
    pub game: Option<String>,
    pub event_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEventRequest {
    pub event_type: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub start_at: Option<DateTime<Utc>>,
    pub end_at: Option<DateTime<Utc>>,
    pub timezone: Option<String>,
    pub data: Option<serde_json::Value>,
    pub is_published: Option<bool>,
    pub banner_item_id: Option<Uuid>,
    /// Detach this event from its banner. Takes precedence over
    /// `banner_item_id`, since an absent field can't mean "set to NULL".
    pub clear_banner: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct SetEventItemsRequest {
    pub items: Vec<FeaturedItemInput>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertFollowRequest {
    /// NULL/absent = follow every event type; otherwise restrict the
    /// personalized calendar to these types.
    pub event_types: Option<Vec<String>>,
    /// The follower's home server key for this game; NULL = use primary time.
    pub server: Option<String>,
}

// ── Checklists ───────────────────────────────────────────────────────────────
//
// A game exposes admin-authored default tasks (templates); a user sees those
// (minus any they've hidden) plus their own custom tasks. Every task carries a
// cadence describing how often it resets. See project_reset_checklist.

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbChecklistTemplate {
    pub id: Uuid,
    pub game_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub cadence_kind: String,
    pub interval_days: Option<i32>,
    pub reset_weekday: Option<i16>,
    pub reset_day_of_month: Option<i16>,
    pub sort_order: i32,
    pub is_published: bool,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbUserTask {
    pub id: Uuid,
    pub user_id: Uuid,
    pub game_id: Uuid,
    pub title: String,
    pub cadence_kind: String,
    pub interval_days: Option<i32>,
    pub reset_weekday: Option<i16>,
    pub reset_day_of_month: Option<i16>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// One admin template in a game's default list (admin authoring input). `id` is
/// present for an existing template being edited, absent for a new one — the
/// replace-set keeps stable ids so a user's completions survive an edit.
#[derive(Debug, Deserialize)]
pub struct ChecklistTemplateInput {
    pub id: Option<Uuid>,
    pub title: String,
    pub description: Option<String>,
    pub cadence_kind: String,
    pub interval_days: Option<i32>,
    pub reset_weekday: Option<i16>,
    pub reset_day_of_month: Option<i16>,
    pub sort_order: Option<i32>,
    pub is_published: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct SetTemplatesRequest {
    pub templates: Vec<ChecklistTemplateInput>,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserTaskRequest {
    pub game_id: Uuid,
    pub title: String,
    pub cadence_kind: String,
    pub interval_days: Option<i32>,
    pub reset_weekday: Option<i16>,
    pub reset_day_of_month: Option<i16>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserTaskRequest {
    pub title: Option<String>,
    pub cadence_kind: Option<String>,
    pub interval_days: Option<i32>,
    pub reset_weekday: Option<i16>,
    pub reset_day_of_month: Option<i16>,
    pub sort_order: Option<i32>,
}

/// Toggle a task done/undone for the current period. The service looks up the
/// task by (source, task_id) to get its game + cadence, then stamps/removes a
/// completion for the current period_key.
#[derive(Debug, Deserialize)]
pub struct ToggleTaskRequest {
    pub source: String,
    pub task_id: Uuid,
    pub done: bool,
}

#[derive(Debug, Deserialize)]
pub struct SetHiddenRequest {
    pub template_ids: Vec<Uuid>,
}

/// Shared time/type/game filters applied to both the global calendar list and
/// the personalized calendar query.
#[derive(Debug, Default)]
pub struct EventFilter {
    pub game_id: Option<Uuid>,
    pub event_type: Option<String>,
    pub status: Option<String>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // The bulk-import contract is a file format people author by hand or
    // generate elsewhere, so pin the exact shape the admin page uploads.
    #[test]
    fn bulk_event_row_parses_a_generated_run() {
        let json = r#"[{
          "game": "honkai-star-rail",
          "event_type": "banner",
          "slug": "butterfly-on-swordtip-2023-04-26",
          "title": "Seele",
          "description": "Butterfly on Swordtip rate-up warp, Version 1.0 Phase 1.",
          "banner": "butterfly-on-swordtip",
          "start_at": "2023-04-25T02:00:00Z",
          "end_at": "2023-05-17T09:59:00Z",
          "timezone": "UTC+8",
          "is_published": true,
          "data": {"version": "1.0", "phase": 1},
          "featured_5": ["seele"],
          "featured_4": ["natasha", "hook", "pela"]
        }]"#;
        let rows: Vec<BulkEventRow> = serde_json::from_str(json).expect("row should deserialize");
        let row = &rows[0];
        assert_eq!(row.game, "honkai-star-rail");
        assert_eq!(row.banner.as_deref(), Some("butterfly-on-swordtip"));
        assert_eq!(row.featured_4.as_ref().unwrap().len(), 3);
        assert_eq!(row.start_at.to_rfc3339(), "2023-04-25T02:00:00+00:00");
    }

    // Collaboration warps run indefinitely: end_at is absent, not null-invalid.
    #[test]
    fn bulk_event_row_allows_an_open_ended_run() {
        let json = r#"[{
          "game": "honkai-star-rail",
          "slug": "excalibur-excelsior-2025-07-11",
          "title": "Saber",
          "start_at": "2025-07-11T03:00:00Z",
          "end_at": null,
          "featured_5": ["saber"]
        }]"#;
        let rows: Vec<BulkEventRow> = serde_json::from_str(json).expect("row should deserialize");
        assert!(rows[0].end_at.is_none());
        assert!(rows[0].event_type.is_none());
        assert!(rows[0].featured_4.is_none());
    }

    // Overwriting live events is opt-in, and only the exact word opts in. A
    // typo, a stale client sending nothing, or any other value must land on
    // skip — the safe side — rather than quietly rewriting banner history.
    #[test]
    fn only_the_exact_update_mode_overwrites() {
        let mode = |m: Option<&str>| {
            BulkImportQuery {
                mode: m.map(String::from),
            }
            .overwrites()
        };
        assert!(mode(Some("update")));
        assert!(!mode(None));
        assert!(!mode(Some("skip")));
        assert!(!mode(Some("Update")));
        assert!(!mode(Some("updates")));
        assert!(!mode(Some("overwrite")));
    }
}
