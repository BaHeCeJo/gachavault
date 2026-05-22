use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct DbItem {
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

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct DbItemFull {
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
    pub game_slug: String,
    pub section_slug: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbSkill {
    pub id: Uuid,
    pub item_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub skill_type: Option<String>,
    pub data: serde_json::Value,
    pub order: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbBuild {
    pub id: Uuid,
    pub item_id: Uuid,
    pub title: String,
    pub content: serde_json::Value,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbChangelog {
    pub id: Uuid,
    pub item_id: Uuid,
    pub version: String,
    pub patch: Option<String>,
    pub changes: String,
    pub change_date: Option<NaiveDate>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct ListItemsQuery {
    pub game_id: Option<Uuid>,
    pub section_id: Option<Uuid>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateItemRequest {
    pub game_id: Uuid,
    pub section_id: Uuid,
    pub type_schema_id: Uuid,
    pub slug: String,
    pub data: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateItemRequest {
    pub data: Option<serde_json::Value>,
    pub slug: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSkillRequest {
    pub name: String,
    pub description: Option<String>,
    pub skill_type: Option<String>,
    pub data: Option<serde_json::Value>,
    pub order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBuildRequest {
    pub title: String,
    pub content: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct CreateChangelogRequest {
    pub version: String,
    pub patch: Option<String>,
    pub changes: String,
    pub change_date: Option<NaiveDate>,
}
