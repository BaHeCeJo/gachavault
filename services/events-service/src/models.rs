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
