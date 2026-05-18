use axum::{
    extract::{Multipart, Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use shared_auth::AuthUser;
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use sqlx::PgPool;
use std::path::PathBuf;
use uuid::Uuid;

const MAX_FILE_SIZE: usize = 20 * 1024 * 1024; // 20 MB
const ALLOWED_IMAGE_TYPES: &[&str] = &["image/jpeg", "image/png", "image/webp", "image/gif"];

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DbAsset {
    pub id: Uuid,
    pub filename: String,
    pub original_filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub storage_path: String,
    pub public_url: String,
    pub uploaded_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

pub async fn upload(
    State(pool): State<PgPool>,
    auth: AuthUser,
    multipart: Multipart,
) -> AppResult<Json<ApiResponse<DbAsset>>> {
    let asset = handle_upload(pool, Some(auth.id()), multipart, false).await?;
    Ok(Json(ApiResponse::success(asset)))
}

pub async fn upload_avatar(
    State(pool): State<PgPool>,
    auth: AuthUser,
    multipart: Multipart,
) -> AppResult<Json<ApiResponse<DbAsset>>> {
    let asset = handle_upload(pool, Some(auth.id()), multipart, true).await?;
    Ok(Json(ApiResponse::success(asset)))
}

pub async fn get_asset(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<DbAsset>>> {
    let asset = sqlx::query_as!(DbAsset, "SELECT * FROM media.assets WHERE id = $1", id)
        .fetch_optional(&pool)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("Asset not found".into()))?;

    Ok(Json(ApiResponse::success(asset)))
}

pub async fn delete_asset(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<()>>> {
    let asset = sqlx::query_as!(DbAsset, "SELECT * FROM media.assets WHERE id = $1", id)
        .fetch_optional(&pool)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("Asset not found".into()))?;

    // Only the uploader can delete (SuperAdmin override handled at gateway level)
    if asset.uploaded_by != Some(auth.id()) {
        return Err(AppError::Forbidden("You can only delete your own uploads".into()));
    }

    // Delete the file from disk
    if tokio::fs::remove_file(&asset.storage_path).await.is_err() {
        tracing::warn!("Failed to delete file at {}", asset.storage_path);
    }

    sqlx::query!("DELETE FROM media.assets WHERE id = $1", id)
        .execute(&pool)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(ApiResponse::success(())))
}

async fn handle_upload(
    pool: PgPool,
    user_id: Option<Uuid>,
    mut multipart: Multipart,
    images_only: bool,
) -> AppResult<DbAsset> {
    let upload_dir = std::env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".to_string());
    let public_base = std::env::var("PUBLIC_BASE_URL")
        .unwrap_or_else(|_| "http://localhost:3006".to_string());

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {}", e)))?
    {
        let original_filename = field
            .file_name()
            .unwrap_or("upload")
            .to_string();

        let mime_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        if images_only && !ALLOWED_IMAGE_TYPES.contains(&mime_type.as_str()) {
            return Err(AppError::BadRequest(format!(
                "Invalid file type '{}'. Allowed: jpeg, png, webp, gif",
                mime_type
            )));
        }

        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(format!("Failed to read upload: {}", e)))?;

        if data.len() > MAX_FILE_SIZE {
            return Err(AppError::BadRequest(format!(
                "File too large. Maximum size is {} MB",
                MAX_FILE_SIZE / 1024 / 1024
            )));
        }

        let ext = PathBuf::from(&original_filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin")
            .to_lowercase();

        let new_filename = format!("{}.{}", Uuid::new_v4(), ext);
        let storage_path = format!("{}/{}", upload_dir, new_filename);
        let public_url = format!("{}/uploads/{}", public_base, new_filename);

        tokio::fs::write(&storage_path, &data)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to save file: {}", e)))?;

        let asset = sqlx::query_as!(
            DbAsset,
            r#"INSERT INTO media.assets (filename, original_filename, mime_type, size_bytes, storage_path, public_url, uploaded_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING *"#,
            new_filename,
            original_filename,
            mime_type,
            data.len() as i64,
            storage_path,
            public_url,
            user_id,
        )
        .fetch_one(&pool)
        .await
        .map_err(AppError::Database)?;

        return Ok(asset);
    }

    Err(AppError::BadRequest("No file provided in multipart form".into()))
}
