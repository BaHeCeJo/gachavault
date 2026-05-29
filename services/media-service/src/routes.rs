use axum::{
    extract::{Multipart, Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use shared_auth::AuthUser;
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;
use sqlx::{PgPool, Row};
use uuid::Uuid;

const MAX_FILE_SIZE: usize = 20 * 1024 * 1024; // 20 MB

/// Detect image type from magic bytes — ignores the client-declared Content-Type.
/// Returns (mime_type, extension) or None if the bytes don't match a supported image.
fn detect_image_type(data: &[u8]) -> Option<(&'static str, &'static str)> {
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some(("image/jpeg", "jpg"));
    }
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some(("image/png", "png"));
    }
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        return Some(("image/gif", "gif"));
    }
    if data.len() >= 12 && data.starts_with(b"RIFF") && &data[8..12] == b"WEBP" {
        return Some(("image/webp", "webp"));
    }
    None
}

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
    let asset = handle_upload(pool, Some(auth.id()), multipart).await?;
    Ok(Json(ApiResponse::success(asset)))
}

pub async fn upload_avatar(
    State(pool): State<PgPool>,
    auth: AuthUser,
    multipart: Multipart,
) -> AppResult<Json<ApiResponse<DbAsset>>> {
    let asset = handle_upload(pool, Some(auth.id()), multipart).await?;
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

pub async fn list_assets(
    State(pool): State<PgPool>,
    auth: AuthUser,
) -> AppResult<Json<ApiResponse<Vec<DbAsset>>>> {
    if !auth.is_admin() {
        return Err(AppError::Forbidden("Admin access required".into()));
    }
    let rows = sqlx::query(
        "SELECT id, filename, original_filename, mime_type, size_bytes, storage_path, public_url, uploaded_by, created_at \
         FROM media.assets ORDER BY created_at DESC LIMIT 200",
    )
    .fetch_all(&pool)
    .await
    .map_err(AppError::Database)?;

    let assets: Vec<DbAsset> = rows
        .iter()
        .map(|r| DbAsset {
            id: r.get("id"),
            filename: r.get("filename"),
            original_filename: r.get("original_filename"),
            mime_type: r.get("mime_type"),
            size_bytes: r.get("size_bytes"),
            storage_path: r.get("storage_path"),
            public_url: r.get("public_url"),
            uploaded_by: r.get("uploaded_by"),
            created_at: r.get("created_at"),
        })
        .collect();

    Ok(Json(ApiResponse::success(assets)))
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

    // Admins can delete any asset; other users only their own
    if !auth.is_admin() && asset.uploaded_by != Some(auth.id()) {
        return Err(AppError::Forbidden(
            "You can only delete your own uploads".into(),
        ));
    }

    // Delete the file from disk first. If the file is already gone (NotFound)
    // we still proceed to delete the DB row — that's actually the right
    // cleanup. Any other I/O failure (permission denied, disk full, etc.) is
    // surfaced so the caller can retry; otherwise the DB row vanishes while
    // the file lingers and we accumulate orphaned uploads.
    if let Err(e) = tokio::fs::remove_file(&asset.storage_path).await {
        if e.kind() != std::io::ErrorKind::NotFound {
            tracing::error!(
                path = %asset.storage_path,
                error = %e,
                "media: file delete failed; keeping DB row to allow retry"
            );
            return Err(AppError::Internal(anyhow::anyhow!(
                "failed to delete asset file"
            )));
        }
        tracing::warn!(
            path = %asset.storage_path,
            "media: asset file already missing on disk"
        );
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
) -> AppResult<DbAsset> {
    let upload_dir = std::env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".to_string());
    let public_base =
        std::env::var("PUBLIC_BASE_URL").unwrap_or_else(|_| "http://localhost:3006".to_string());

    if let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {}", e)))?
    {
        let original_filename = field.file_name().unwrap_or("upload").to_string();

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

        // Detect type from magic bytes — the client-declared Content-Type is not trusted.
        let (mime_type, ext) = detect_image_type(&data).ok_or_else(|| {
            AppError::BadRequest(
                "File content is not a recognised image (jpeg, png, webp, gif)".into(),
            )
        })?;

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

    Err(AppError::BadRequest(
        "No file provided in multipart form".into(),
    ))
}
