use axum::{extract::State, Json};
use lettre::{
    message::header::ContentType, transport::smtp::authentication::Credentials, Message,
    SmtpTransport, Transport,
};
use serde::Deserialize;
use shared_errors::{AppError, AppResult};
use shared_types::ApiResponse;

use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct SendVerificationRequest {
    pub to_email: String,
    pub username: String,
    pub verification_token: String,
}

#[derive(Debug, Deserialize)]
pub struct SendPasswordResetRequest {
    pub to_email: String,
    pub username: String,
    pub reset_token: String,
}

#[derive(Debug, Deserialize)]
pub struct SendWelcomeRequest {
    pub to_email: String,
    pub username: String,
}

pub async fn send_verification(
    State(state): State<AppState>,
    Json(body): Json<SendVerificationRequest>,
) -> AppResult<Json<ApiResponse<()>>> {
    let verify_url = format!(
        "{}/auth/verify-email?token={}",
        state.frontend_url, body.verification_token
    );

    let html = format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #7c3aed;">GachaVault</h1>
  <p>Hi <strong>{username}</strong>,</p>
  <p>Thanks for creating an account! Please verify your email address by clicking the button below.</p>
  <p style="margin: 32px 0;">
    <a href="{url}" style="background: #7c3aed; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
      Verify Email
    </a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
  <p style="color: #6b7280; font-size: 14px;">Or copy this link: {url}</p>
</body>
</html>"#,
        username = body.username,
        url = verify_url,
    );

    send_email(&state, &body.to_email, "Verify your GachaVault account", html)?;
    Ok(Json(ApiResponse::success(())))
}

pub async fn send_password_reset(
    State(state): State<AppState>,
    Json(body): Json<SendPasswordResetRequest>,
) -> AppResult<Json<ApiResponse<()>>> {
    let reset_url = format!(
        "{}/auth/reset-password?token={}",
        state.frontend_url, body.reset_token
    );

    let html = format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #7c3aed;">GachaVault</h1>
  <p>Hi <strong>{username}</strong>,</p>
  <p>We received a request to reset your password. Click the button below to choose a new password.</p>
  <p style="margin: 32px 0;">
    <a href="{url}" style="background: #7c3aed; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
      Reset Password
    </a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
  <p style="color: #6b7280; font-size: 14px;">Or copy this link: {url}</p>
</body>
</html>"#,
        username = body.username,
        url = reset_url,
    );

    send_email(&state, &body.to_email, "Reset your GachaVault password", html)?;
    Ok(Json(ApiResponse::success(())))
}

pub async fn send_welcome(
    State(state): State<AppState>,
    Json(body): Json<SendWelcomeRequest>,
) -> AppResult<Json<ApiResponse<()>>> {
    let html = format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #7c3aed;">Welcome to GachaVault!</h1>
  <p>Hi <strong>{username}</strong>,</p>
  <p>Your email has been verified. Your account is now fully active.</p>
  <p style="margin: 32px 0;">
    <a href="{url}" style="background: #7c3aed; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
      Start Browsing
    </a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">Browse games, build your collection, and create tier lists.</p>
</body>
</html>"#,
        username = body.username,
        url = state.frontend_url,
    );

    send_email(&state, &body.to_email, "Welcome to GachaVault!", html)?;
    Ok(Json(ApiResponse::success(())))
}

fn send_email(state: &AppState, to: &str, subject: &str, html_body: String) -> AppResult<()> {
    let from = state
        .from_email
        .parse()
        .map_err(|_| AppError::Internal(anyhow::anyhow!("Invalid from_email address")))?;
    let to_addr = to
        .parse()
        .map_err(|_| AppError::BadRequest("Invalid recipient email address".into()))?;

    let message = Message::builder()
        .from(from)
        .to(to_addr)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(html_body)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to build email: {}", e)))?;

    let mailer = if state.smtp_username.is_empty() {
        // Plain SMTP — no auth, no TLS (Mailhog / local dev)
        SmtpTransport::builder_dangerous(&state.smtp_host)
            .port(state.smtp_port)
            .build()
    } else {
        // Production SMTP with STARTTLS + credentials
        let creds = Credentials::new(state.smtp_username.clone(), state.smtp_password.clone());
        SmtpTransport::starttls_relay(&state.smtp_host)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("SMTP relay error: {}", e)))?
            .credentials(creds)
            .port(state.smtp_port)
            .build()
    };

    mailer
        .send(&message)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to send email: {}", e)))?;

    tracing::info!("Email sent to {} — subject: {}", to, subject);
    Ok(())
}
