use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub username: String,
    pub avatar_url: Option<String>,
    pub email_verified: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicUser {
    pub id: Uuid,
    pub username: String,
    pub avatar_url: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    SuperAdmin,
    GameAdmin,
    GameEditor,
    SectionEditor,
    Contributor,
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserGameRole {
    pub user_id: Uuid,
    pub game_id: Option<Uuid>,
    pub section_id: Option<Uuid>,
    pub role: Role,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub logo_url: Option<String>,
    pub banner_url: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSection {
    pub id: Uuid,
    pub game_id: Uuid,
    pub slug: String,
    pub name: String,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub id: Uuid,
    pub game_id: Uuid,
    pub section_id: Uuid,
    pub type_schema_id: Uuid,
    pub slug: String,
    pub data: serde_json::Value,
    pub version: i32,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionEntry {
    pub user_id: Uuid,
    pub item_id: Uuid,
    pub game_id: Uuid,
    pub owned: bool,
    pub constellation_level: Option<i32>,
    pub level: Option<i32>,
    pub ascension: Option<i32>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TierList {
    pub id: Uuid,
    pub user_id: Uuid,
    pub game_id: Uuid,
    pub title: String,
    pub is_public: bool,
    pub share_slug: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TierListEntry {
    pub tier_list_id: Uuid,
    pub item_id: Uuid,
    pub tier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
}

/// Common shape for `?page=N&per_page=M` list endpoints. Services that use a
/// `limit/offset` convention (e.g. items-service) keep their own DTOs — this
/// is for the page/per_page family so the bounds logic lives in one place.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct PaginationQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

impl PaginationQuery {
    pub const DEFAULT_PER_PAGE: i64 = 20;
    pub const MAX_PER_PAGE: i64 = 100;

    /// Clamped page size, always in `[1, MAX_PER_PAGE]`.
    pub fn limit(&self) -> i64 {
        self.per_page
            .unwrap_or(Self::DEFAULT_PER_PAGE)
            .clamp(1, Self::MAX_PER_PAGE)
    }

    /// Row offset for SQL `OFFSET`. Negative pages collapse to 0.
    pub fn offset(&self) -> i64 {
        let page = self.page.unwrap_or(0).max(0);
        page * self.limit()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    pub data: Option<T>,
    pub message: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: None,
        }
    }
}

impl ApiResponse<()> {
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            message: Some(message.into()),
        }
    }
}
