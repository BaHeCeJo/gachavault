use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct SearchParams {
    pub q: String,
    pub game: Option<String>,
    pub section: Option<String>,
    pub page: Option<u32>,
    pub per_page: Option<u32>,
    /// "name:asc" | "name:desc" — passed directly to Meilisearch sort
    pub sort: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct IndexItemRequest {
    pub id: Uuid,
    pub game_id: Uuid,
    pub game_slug: String,
    pub section_id: Uuid,
    pub section_slug: String,
    pub slug: String,
    pub name: String,
    pub data: serde_json::Value,
}

pub async fn search(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> AppResult<Json<ApiResponse<serde_json::Value>>> {
    let per_page = params.per_page.unwrap_or(20).min(100);
    let page = params.page.unwrap_or(0);

    let mut body = serde_json::json!({
        "q": params.q,
        "limit": per_page,
        "offset": page * per_page,
    });

    // Build filter expression for Meilisearch.
    // Slugs are whitelisted to alphanumeric + hyphens so filter-injection is impossible.
    fn is_valid_slug(s: &str) -> bool {
        !s.is_empty() && s.len() <= 100 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    }

    let mut filters: Vec<String> = Vec::new();
    if let Some(game) = &params.game {
        if !is_valid_slug(game) {
            return Err(AppError::BadRequest("Invalid game filter".into()));
        }
        filters.push(format!("game_slug = \"{}\"", game));
    }
    if let Some(section) = &params.section {
        if !is_valid_slug(section) {
            return Err(AppError::BadRequest("Invalid section filter".into()));
        }
        filters.push(format!("section_slug = \"{}\"", section));
    }
    if !filters.is_empty() {
        body["filter"] = serde_json::Value::String(filters.join(" AND "));
    }

    // Sort param: accept "name:asc" or "name:desc" only (whitelist against injection)
    if let Some(sort) = &params.sort {
        if matches!(sort.as_str(), "name:asc" | "name:desc") {
            body["sort"] = serde_json::json!([sort]);
        }
    }

    let response = state
        .http_client
        .post(format!("{}/indexes/items/search", state.meilisearch_url))
        .header("Authorization", format!("Bearer {}", state.meilisearch_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Meilisearch request failed: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        // Log the body server-side as a structured field but don't fold it
        // into the AppError message — Meilisearch error responses can echo
        // auth headers, query payloads, or other sensitive config back at us.
        tracing::error!(status = %status, body = %text, "meilisearch: search returned non-success");
        return Err(AppError::Internal(anyhow::anyhow!(
            "search upstream error ({})",
            status
        )));
    }

    let result: serde_json::Value = response.json().await.map_err(|e| {
        AppError::Internal(anyhow::anyhow!(
            "Failed to parse Meilisearch response: {}",
            e
        ))
    })?;

    Ok(Json(ApiResponse::success(result)))
}

pub async fn index_item(
    State(state): State<AppState>,
    Json(body): Json<IndexItemRequest>,
) -> AppResult<Json<ApiResponse<()>>> {
    let doc = serde_json::json!({
        "id": body.id,
        "game_id": body.game_id,
        "game_slug": body.game_slug,
        "section_id": body.section_id,
        "section_slug": body.section_slug,
        "slug": body.slug,
        "name": body.name,
        "data": body.data,
    });

    let response = state
        .http_client
        .post(format!("{}/indexes/items/documents", state.meilisearch_url))
        .header("Authorization", format!("Bearer {}", state.meilisearch_key))
        .json(&[doc])
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Meilisearch request failed: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        tracing::error!(status = %status, body = %text, "meilisearch: index returned non-success");
        return Err(AppError::Internal(anyhow::anyhow!(
            "search index upstream error ({})",
            status
        )));
    }

    tracing::info!("Indexed item {} in Meilisearch", body.id);
    Ok(Json(ApiResponse::success(())))
}

pub async fn remove_from_index(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<()>>> {
    let response = state
        .http_client
        .delete(format!(
            "{}/indexes/items/documents/{}",
            state.meilisearch_url, id
        ))
        .header("Authorization", format!("Bearer {}", state.meilisearch_key))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Meilisearch request failed: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        tracing::error!(status = %status, body = %text, "meilisearch: remove returned non-success");
        return Err(AppError::Internal(anyhow::anyhow!(
            "search index upstream error ({})",
            status
        )));
    }

    tracing::info!("Removed item {} from Meilisearch index", id);
    Ok(Json(ApiResponse::success(())))
}
