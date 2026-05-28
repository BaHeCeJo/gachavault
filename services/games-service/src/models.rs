use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbGame {
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

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbSection {
    pub id: Uuid,
    pub game_id: Uuid,
    pub slug: String,
    pub name: String,
    pub order: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbSchema {
    pub id: Uuid,
    pub game_id: Uuid,
    pub section_id: Option<Uuid>,
    pub name: String,
    pub fields: serde_json::Value,
    pub filter_attrs: Option<serde_json::Value>,
    pub card_layout: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGameRequest {
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub logo_url: Option<String>,
    pub banner_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGameRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub logo_url: Option<String>,
    pub banner_url: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSectionRequest {
    pub slug: String,
    pub name: String,
    pub order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSchemaRequest {
    pub section_id: Option<Uuid>,
    pub name: String,
    pub fields: serde_json::Value,
    pub filter_attrs: Option<serde_json::Value>,
    pub card_layout: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSectionRequest {
    pub name: Option<String>,
    pub order: Option<i32>,
    pub tabs: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSchemaRequest {
    pub name: Option<String>,
    pub fields: Option<serde_json::Value>,
    // Double Option: outer None = key absent (don't touch), Some(None) = explicit
    // null (reset to "auto"), Some(Some(arr)) = new allowlist.
    #[serde(default, deserialize_with = "deserialize_some")]
    pub filter_attrs: Option<Option<serde_json::Value>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub card_layout: Option<Option<serde_json::Value>>,
}

fn deserialize_some<'de, T, D>(deserializer: D) -> Result<Option<T>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    T::deserialize(deserializer).map(Some)
}
