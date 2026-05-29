use axum::{
    async_trait,
    extract::{FromRequestParts, Request, State},
    http::{request::Parts, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json, RequestPartsExt,
};
use axum_extra::{
    headers::{authorization::Bearer, Authorization},
    TypedHeader,
};
use chrono::Utc;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use uuid::Uuid;

/// Read a secret from `<NAME>_FILE` (Docker secret mount) before falling back
/// to `<NAME>` (plain env var). This is the standard Docker-secrets pattern:
/// `/run/secrets/<name>` files don't appear in `docker inspect` env dumps,
/// process listings, or log scrapes, where plain env vars do.
///
/// Trailing whitespace (newlines from `echo "..." > secret.txt`) is trimmed
/// so secret files can be edited with any editor without breaking the value.
pub fn read_secret(name: &str) -> Result<String, std::env::VarError> {
    if let Ok(file_path) = std::env::var(format!("{}_FILE", name)) {
        match std::fs::read_to_string(&file_path) {
            Ok(content) => return Ok(content.trim().to_string()),
            Err(e) => {
                tracing::error!("failed to read secret file {}: {}", file_path, e);
                return Err(std::env::VarError::NotPresent);
            }
        }
    }
    std::env::var(name)
}

fn default_role() -> String {
    "user".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub username: String,
    #[serde(default = "default_role")]
    pub role: String,
    pub exp: usize,
    pub iat: usize,
    pub jti: String,
}

impl Claims {
    pub fn new(
        user_id: Uuid,
        email: String,
        username: String,
        role: String,
        expiry_seconds: i64,
    ) -> Self {
        let now = Utc::now().timestamp() as usize;
        Self {
            sub: user_id.to_string(),
            email,
            username,
            role,
            iat: now,
            exp: (Utc::now().timestamp() + expiry_seconds) as usize,
            jti: Uuid::new_v4().to_string(),
        }
    }

    pub fn user_id(&self) -> Uuid {
        // Safe: Claims::decode rejects tokens whose `sub` is not a valid UUID,
        // and Claims::new only constructs from a Uuid. If this ever returns
        // None, a Claims was built outside the supported paths — fall back to
        // nil UUID to keep the request safe rather than panic the worker.
        Uuid::parse_str(&self.sub).unwrap_or_else(|_| Uuid::nil())
    }

    pub fn role(&self) -> &str {
        &self.role
    }

    pub fn encode(&self, secret: &str) -> Result<String, jsonwebtoken::errors::Error> {
        encode(
            &Header::default(),
            self,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
    }

    pub fn decode(token: &str, secret: &str) -> Result<Self, jsonwebtoken::errors::Error> {
        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &Validation::new(Algorithm::HS256),
        )?;
        // Reject malformed `sub` at the boundary so downstream user_id() is
        // guaranteed safe. A token signed correctly but with a non-UUID `sub`
        // is treated as InvalidToken (401), never a panic.
        if Uuid::parse_str(&data.claims.sub).is_err() {
            return Err(jsonwebtoken::errors::ErrorKind::InvalidSubject.into());
        }
        Ok(data.claims)
    }
}

#[derive(Debug, Clone)]
pub struct AuthUser(pub Claims);

impl AuthUser {
    pub fn id(&self) -> Uuid {
        self.0.user_id()
    }
    pub fn email(&self) -> &str {
        &self.0.email
    }
    pub fn username(&self) -> &str {
        &self.0.username
    }
    pub fn role(&self) -> &str {
        self.0.role()
    }

    pub fn is_admin(&self) -> bool {
        matches!(self.role(), "admin" | "superadmin")
    }

    pub fn can_edit(&self) -> bool {
        matches!(self.role(), "admin" | "superadmin" | "editor")
    }
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, Json<serde_json::Value>);

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let TypedHeader(Authorization(bearer)) = parts
            .extract::<TypedHeader<Authorization<Bearer>>>()
            .await
            .map_err(|_| unauthorized("Missing or malformed authorization header"))?;

        let secret =
            read_secret("JWT_SECRET").map_err(|_| unauthorized("JWT secret not configured"))?;

        let claims = Claims::decode(bearer.token(), &secret).map_err(|e| {
            tracing::debug!("JWT validation failed: {:?}", e);
            unauthorized("Invalid or expired token")
        })?;

        Ok(AuthUser(claims))
    }
}

fn unauthorized(msg: &str) -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({
            "success": false,
            "error": { "code": "UNAUTHORIZED", "message": msg }
        })),
    )
}

/// Implemented by every service's `AppState` that uses
/// [`verify_internal_secret`] middleware. Lets the shared middleware read the
/// expected secret out of any state shape without each service rolling its
/// own near-identical copy.
pub trait HasInternalSecret {
    fn internal_secret(&self) -> &str;
}

/// Axum middleware that rejects any request whose `x-internal-secret` header
/// doesn't match the value returned by `state.internal_secret()`. Compared in
/// constant time so a near-miss header can't be brute-forced byte-by-byte via
/// response-time differences.
///
/// Wire it like:
/// ```ignore
/// .layer(middleware::from_fn_with_state(state.clone(), shared_auth::verify_internal_secret::<AppState>))
/// ```
pub async fn verify_internal_secret<S>(
    State(state): State<S>,
    request: Request,
    next: Next,
) -> Response
where
    S: HasInternalSecret + Clone + Send + Sync + 'static,
{
    let supplied = request
        .headers()
        .get("x-internal-secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let matched: bool = supplied
        .as_bytes()
        .ct_eq(state.internal_secret().as_bytes())
        .into();
    if !matched {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    next.run(request).await
}

#[derive(Debug, Clone)]
pub struct OptionalAuthUser(pub Option<Claims>);

#[async_trait]
impl<S> FromRequestParts<S> for OptionalAuthUser
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        match AuthUser::from_request_parts(parts, state).await {
            Ok(u) => Ok(OptionalAuthUser(Some(u.0))),
            Err(_) => Ok(OptionalAuthUser(None)),
        }
    }
}
