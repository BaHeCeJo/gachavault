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
}

/// One regional server in a game's server list (admin authoring input).
#[derive(Debug, Deserialize)]
pub struct GameServerInput {
    pub key: String,
    pub name: String,
    pub timezone: Option<String>,
    pub sort_order: Option<i32>,
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
