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

/// One item↔item relation, enriched with enough of the other item to render a
/// card without a second round-trip. Used for both directions: `list_item_links`
/// returns the items this one points at, `list_item_backlinks` the ones pointing
/// back at it.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbItemLinkFull {
    pub id: Uuid,
    pub item_id: Uuid,
    pub linked_item_id: Uuid,
    pub relation: String,
    pub order: i32,
    /// Slug/data/schema of the *other* item in the relation.
    pub slug: String,
    pub data: serde_json::Value,
    pub type_schema_id: Uuid,
    pub game_slug: String,
    pub section_slug: String,
}

/// One link in a replace-set request. `order` drives display order; the frontend
/// groups by the linked item's schema (characters vs weapons) rather than
/// storing a kind on the link. The relation is set once for the whole request
/// (see `SetItemLinksRequest`), not per link.
#[derive(Debug, Deserialize)]
pub struct ItemLinkInput {
    pub linked_item_id: Uuid,
    pub order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct SetItemLinksRequest {
    pub links: Vec<ItemLinkInput>,
    /// Only links of this relation are replaced; others on the item are left
    /// alone, so editing a banner's rate-up roster can't clobber unrelated
    /// relations added later.
    pub relation: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LinkQuery {
    pub relation: Option<String>,
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

/// Query for the bulk item import.
#[derive(Debug, Deserialize)]
pub struct BulkImportQuery {
    pub mode: Option<String>,
}

impl BulkImportQuery {
    /// Whether a row whose slug already exists should overwrite rather than be
    /// skipped. Only the exact word opts in: a typo, or a stale client sending
    /// nothing, lands on skip rather than quietly rewriting a catalog.
    pub fn overwrites(&self) -> bool {
        self.mode.as_deref() == Some("update")
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    // Overwriting a stored catalog is opt-in, and only the exact word opts in.
    // A typo, or a stale client sending nothing, must land on skip — the safe
    // side — rather than quietly rewriting items.
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
