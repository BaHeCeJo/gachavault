use reqwest::Client;

pub async fn send_verification(
    notifications_url: String,
    to_email: String,
    username: String,
    token: String,
) {
    let client = Client::new();
    let result = client
        .post(format!("{}/internal/send-verification", notifications_url))
        .json(&serde_json::json!({
            "to_email": to_email,
            "username": username,
            "verification_token": token,
        }))
        .send()
        .await;

    if let Err(e) = result {
        tracing::warn!("Failed to send verification email to {}: {:?}", to_email, e);
    }
}

pub async fn send_password_reset(
    notifications_url: String,
    to_email: String,
    username: String,
    token: String,
) {
    let client = Client::new();
    let result = client
        .post(format!("{}/internal/send-password-reset", notifications_url))
        .json(&serde_json::json!({
            "to_email": to_email,
            "username": username,
            "reset_token": token,
        }))
        .send()
        .await;

    if let Err(e) = result {
        tracing::warn!("Failed to send password reset email to {}: {:?}", to_email, e);
    }
}
