use axum::{
    body::Body,
    extract::{Query, State},
    http::{header::LOCATION, StatusCode},
    response::{IntoResponse, Redirect, Response},
};
use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, Rng, RngCore};
use redis::AsyncCommands;
use reqwest::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use shared_errors::{AppError, AppResult};
use sqlx::PgPool;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

use crate::{
    db,
    routes::{issue_tokens, set_auth_cookie_headers},
};

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

#[derive(Debug, Deserialize)]
pub struct CallbackParams {
    pub code: Option<String>,
    pub error: Option<String>,
    pub state: Option<String>,
}

const OAUTH_STATE_TTL_SECS: i64 = 600; // 10 minutes
const PKCE_VERIFIER_BYTES: usize = 32; // 256 bits → 43-char base64url

/// Compute the HMAC-SHA256 signature over `nonce:ts_hex` keyed by `secret`.
/// Pulled out so generate and verify use the exact same bytes — any drift
/// between the two would silently break OAuth.
fn oauth_state_signature(secret: &str, nonce: &str, ts_hex: &str) -> Vec<u8> {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(nonce.as_bytes());
    mac.update(b":");
    mac.update(ts_hex.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

fn generate_oauth_state(secret: &str) -> String {
    let nonce: [u8; 16] = rand::thread_rng().gen();
    let nonce_hex = hex::encode(nonce);
    let ts = chrono::Utc::now().timestamp();
    let ts_hex = format!("{:x}", ts);
    let sig = hex::encode(oauth_state_signature(secret, &nonce_hex, &ts_hex));
    format!("{}.{}.{}", nonce_hex, ts_hex, sig)
}

fn verify_oauth_state(secret: &str, state_param: &str) -> bool {
    let mut parts = state_param.splitn(3, '.');
    let (nonce, ts_hex, sig_hex) = match (parts.next(), parts.next(), parts.next()) {
        (Some(n), Some(t), Some(s)) => (n, t, s),
        _ => return false,
    };
    // Reject states older than TTL
    let ts = match i64::from_str_radix(ts_hex, 16) {
        Ok(t) => t,
        Err(_) => return false,
    };
    let age = chrono::Utc::now().timestamp() - ts;
    if !(0..=OAUTH_STATE_TTL_SECS).contains(&age) {
        return false;
    }
    let Ok(supplied_sig) = hex::decode(sig_hex) else {
        return false;
    };
    let expected_sig = oauth_state_signature(secret, nonce, ts_hex);
    // Constant-time compare so a near-miss signature can't be brute-forced
    // byte-by-byte through response-time differences.
    expected_sig.ct_eq(&supplied_sig).into()
}

/// URL-safe base64 without padding (RFC 4648 §5), which is what PKCE requires.
fn base64url_encode(data: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    let (chunks, remainder) = data.as_chunks::<3>();
    for chunk in chunks {
        let b = ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8) | (chunk[2] as u32);
        out.push(CHARSET[((b >> 18) & 0x3F) as usize] as char);
        out.push(CHARSET[((b >> 12) & 0x3F) as usize] as char);
        out.push(CHARSET[((b >> 6) & 0x3F) as usize] as char);
        out.push(CHARSET[(b & 0x3F) as usize] as char);
    }
    match remainder.len() {
        1 => {
            let b = (remainder[0] as u32) << 16;
            out.push(CHARSET[((b >> 18) & 0x3F) as usize] as char);
            out.push(CHARSET[((b >> 12) & 0x3F) as usize] as char);
        }
        2 => {
            let b = ((remainder[0] as u32) << 16) | ((remainder[1] as u32) << 8);
            out.push(CHARSET[((b >> 18) & 0x3F) as usize] as char);
            out.push(CHARSET[((b >> 12) & 0x3F) as usize] as char);
            out.push(CHARSET[((b >> 6) & 0x3F) as usize] as char);
        }
        _ => {}
    }
    out
}

fn generate_pkce_pair() -> (String, String) {
    let mut verifier_bytes = [0u8; PKCE_VERIFIER_BYTES];
    OsRng.fill_bytes(&mut verifier_bytes);
    let verifier = base64url_encode(&verifier_bytes);
    let challenge = base64url_encode(&Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

async fn get_redis_conn() -> Option<redis::aio::MultiplexedConnection> {
    let url = shared_auth::read_secret("REDIS_URL").ok()?;
    let client = redis::Client::open(url).ok()?;
    client.get_multiplexed_async_connection().await.ok()
}

fn pkce_key(state: &str) -> String {
    format!("oauth_pkce:{}", state)
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GoogleTokenResponse {
    access_token: String,
    token_type: String,
}

#[derive(Debug, Deserialize)]
struct GoogleUserInfo {
    id: String,
    email: String,
    name: Option<String>,
    picture: Option<String>,
}

pub async fn google_redirect() -> AppResult<Redirect> {
    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| AppError::Internal(anyhow::anyhow!("GOOGLE_CLIENT_ID not configured")))?;
    let jwt_secret = shared_auth::read_secret("JWT_SECRET")
        .map_err(|_| AppError::Internal(anyhow::anyhow!("JWT_SECRET not configured")))?;
    let redirect_uri = google_redirect_uri();
    let state = generate_oauth_state(&jwt_secret);

    // PKCE: generate a per-request code_verifier, stash it in Redis under the
    // state key, send only the SHA256 challenge to Google. An attacker who
    // intercepts the auth code can't redeem it without the verifier.
    let (verifier, challenge) = generate_pkce_pair();
    if let Some(mut conn) = get_redis_conn().await {
        let _: redis::RedisResult<()> = conn
            .set_ex(pkce_key(&state), &verifier, OAUTH_STATE_TTL_SECS as u64)
            .await;
    } else {
        // PKCE storage requires Redis. Without it, the callback cannot prove
        // the request originated from this server — refuse to start the flow
        // rather than silently downgrade to non-PKCE.
        return Err(AppError::Internal(anyhow::anyhow!(
            "Redis unavailable: OAuth requires Redis for PKCE state"
        )));
    }

    let url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&access_type=offline&state={}&code_challenge={}&code_challenge_method=S256",
        GOOGLE_AUTH_URL,
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&state),
        urlencoding::encode(&challenge),
    );

    Ok(Redirect::temporary(&url))
}

pub async fn google_callback(
    State(pool): State<PgPool>,
    Query(params): Query<CallbackParams>,
) -> AppResult<Response> {
    let frontend_url =
        std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:3009".into());
    let jwt_secret = shared_auth::read_secret("JWT_SECRET")
        .map_err(|_| AppError::Internal(anyhow::anyhow!("JWT_SECRET not configured")))?;

    if let Some(err) = params.error {
        return Ok(Redirect::temporary(&format!(
            "{}/auth/login?error={}",
            frontend_url,
            urlencoding::encode(&err),
        ))
        .into_response());
    }

    let state_param = params
        .state
        .ok_or_else(|| AppError::BadRequest("Missing OAuth state parameter".into()))?;
    if !verify_oauth_state(&jwt_secret, &state_param) {
        return Err(AppError::BadRequest("Invalid OAuth state parameter".into()));
    }

    let code = params
        .code
        .ok_or_else(|| AppError::BadRequest("Missing authorization code".into()))?;

    // Retrieve and immediately delete the PKCE verifier so each auth code can
    // only be redeemed once even on a replay race.
    let mut redis_conn = get_redis_conn().await.ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!(
            "Redis unavailable: cannot validate OAuth PKCE"
        ))
    })?;
    let key = pkce_key(&state_param);
    let verifier: Option<String> = redis_conn.get(&key).await.ok();
    let _: redis::RedisResult<()> = redis_conn.del(&key).await;
    let verifier = verifier
        .ok_or_else(|| AppError::BadRequest("OAuth state expired or already used".into()))?;

    // Exchange code for access token
    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| AppError::Internal(anyhow::anyhow!("GOOGLE_CLIENT_ID not configured")))?;
    let client_secret = shared_auth::read_secret("GOOGLE_CLIENT_SECRET")
        .map_err(|_| AppError::Internal(anyhow::anyhow!("GOOGLE_CLIENT_SECRET not configured")))?;
    let redirect_uri = google_redirect_uri();

    let http = Client::new();

    let token_res: GoogleTokenResponse = http
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Google token request failed: {}", e)))?
        .json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Google token parse failed: {}", e)))?;

    // Get user info from Google
    let user_info: GoogleUserInfo = http
        .get(GOOGLE_USERINFO_URL)
        .bearer_auth(&token_res.access_token)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Google userinfo request failed: {}", e)))?
        .json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Google userinfo parse failed: {}", e)))?;

    // Find or create user. EmailConflict means there's already a
    // password-based account with this email; we refuse to auto-link it (an
    // email match alone is not proof of ownership). Send the user back to the
    // login page with a clear error code so the UI can explain.
    let outcome = db::find_or_create_google_user(
        &pool,
        &user_info.id,
        &user_info.email,
        user_info.name.as_deref(),
        user_info.picture.as_deref(),
    )
    .await
    .map_err(AppError::Database)?;
    let user = match outcome {
        db::GoogleLoginOutcome::User(u) => u,
        db::GoogleLoginOutcome::EmailConflict => {
            return Ok(Redirect::temporary(&format!(
                "{}/auth/login?error=email_password_conflict",
                frontend_url,
            ))
            .into_response());
        }
    };

    // Issue tokens and deliver them as HttpOnly cookies, then redirect to the frontend.
    // Tokens are never exposed in URLs, headers the client can read, or JavaScript.
    let tokens = issue_tokens(&pool, &user.id, &user.email, &user.username).await?;

    let mut cookie_headers = axum::http::HeaderMap::new();
    set_auth_cookie_headers(&mut cookie_headers, &tokens);

    let location = format!("{}/", frontend_url)
        .parse::<axum::http::HeaderValue>()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Bad redirect URL: {}", e)))?;

    let mut builder = Response::builder().status(StatusCode::SEE_OTHER);
    for (k, v) in &cookie_headers {
        builder = builder.header(k, v);
    }
    let response = builder
        .header(LOCATION, location)
        .body(Body::empty())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Response build error: {}", e)))?;

    Ok(response)
}

fn google_redirect_uri() -> String {
    let base = std::env::var("BACKEND_URL").unwrap_or_else(|_| "http://localhost:3001".into());
    format!("{}/api/v1/auth/google/callback", base)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 4648 §10 vectors, which cover all three remainder cases (0, 1 and 2
    /// bytes over a group of three), plus two that exercise the URL-safe
    /// alphabet itself — standard base64 would emit `+` and `/` there.
    #[test]
    fn base64url_encode_matches_rfc4648_without_padding() {
        let cases: &[(&[u8], &str)] = &[
            (b"", ""),
            (b"f", "Zg"),
            (b"fo", "Zm8"),
            (b"foo", "Zm9v"),
            (b"foob", "Zm9vYg"),
            (b"fooba", "Zm9vYmE"),
            (b"foobar", "Zm9vYmFy"),
            (&[0xfb, 0xff], "-_8"),
            (&[0xfb, 0xff, 0xbf], "-_-_"),
        ];
        for (input, want) in cases {
            assert_eq!(&base64url_encode(input), want, "input {input:?}");
        }
    }

    /// PKCE requires the verifier to stay in the unreserved set, so a byte that
    /// would encode to `+` or `/` in standard base64 must never appear.
    #[test]
    fn base64url_encode_never_emits_padding_or_unsafe_chars() {
        for len in 0..64usize {
            let data: Vec<u8> = (0..len).map(|i| (i * 7 + 251) as u8).collect();
            let out = base64url_encode(&data);
            assert!(!out.contains(['=', '+', '/']), "len {len} produced {out:?}");
            assert_eq!(
                out.len(),
                data.len().div_ceil(3) * 4 - (3 - data.len() % 3) % 3
            );
        }
    }
}
