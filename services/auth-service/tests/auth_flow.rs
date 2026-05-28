// End-to-end auth tests. Each test gets a fresh database via sqlx::test;
// migrations from ./migrations are applied automatically. Tests exercise
// the same Router main.rs builds, so handler wiring is covered too —
// not just business logic.

mod common;

use axum::http::StatusCode;
use common::{
    build_test_app, cookies, extract_cookie, get_with_bearer, post_json, post_with_bearer,
    post_with_cookie, register_user, setup_env,
};
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test(migrations = "./migrations")]
async fn register_happy_path(pool: PgPool) {
    setup_env();
    let app = build_test_app(pool);

    let (status, _, body) = post_json(
        app,
        "/api/v1/auth/register",
        json!({
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "correct-horse-battery-staple",
        }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["email"], "newuser@example.com");
    assert_eq!(body["data"]["email_verified"], false);
}

#[sqlx::test(migrations = "./migrations")]
async fn register_rejects_short_password(pool: PgPool) {
    setup_env();
    let app = build_test_app(pool);

    let (status, _, _) = post_json(
        app,
        "/api/v1/auth/register",
        json!({
            "email": "shortpw@example.com",
            "username": "shortpw",
            "password": "too-short",
        }),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn register_rejects_duplicate_email(pool: PgPool) {
    setup_env();
    let app1 = build_test_app(pool.clone());
    let app2 = build_test_app(pool);

    // First registration succeeds.
    let (status1, _, _) = post_json(
        app1,
        "/api/v1/auth/register",
        json!({
            "email": "dup@example.com",
            "username": "user_one",
            "password": "correct-horse-battery-staple",
        }),
    )
    .await;
    assert_eq!(status1, StatusCode::OK);

    // Second with the same email fails with Conflict.
    let (status2, _, _) = post_json(
        app2,
        "/api/v1/auth/register",
        json!({
            "email": "dup@example.com",
            "username": "user_two",
            "password": "correct-horse-battery-staple",
        }),
    )
    .await;
    assert_eq!(status2, StatusCode::CONFLICT);
}

#[sqlx::test(migrations = "./migrations")]
async fn login_with_wrong_password_fails(pool: PgPool) {
    setup_env();
    let user = register_user(build_test_app(pool.clone()), "wrongpw").await;

    let (status, _, _) = post_json(
        build_test_app(pool),
        "/api/v1/auth/login",
        json!({
            "email": user.email,
            "password": "not-the-real-password",
        }),
    )
    .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn login_unknown_email_fails_same_as_wrong_password(pool: PgPool) {
    setup_env();
    // Same error so an attacker can't enumerate registered emails.
    let (status, _, _) = post_json(
        build_test_app(pool),
        "/api/v1/auth/login",
        json!({
            "email": "nobody@example.com",
            "password": "correct-horse-battery-staple",
        }),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn login_sets_cookies_and_me_returns_user(pool: PgPool) {
    setup_env();
    let user = register_user(build_test_app(pool.clone()), "login_me").await;

    let (status, headers, _) = post_json(
        build_test_app(pool.clone()),
        "/api/v1/auth/login",
        json!({
            "email": user.email,
            "password": user.password,
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let access = extract_cookie(&headers, "access_token").expect("access_token cookie");
    let refresh = extract_cookie(&headers, "refresh_token").expect("refresh_token cookie");
    assert!(!access.is_empty());
    assert!(!refresh.is_empty());

    // /me with the bearer token returns the user record.
    let (me_status, _, me_body) =
        get_with_bearer(build_test_app(pool), "/api/v1/auth/me", &access).await;
    assert_eq!(me_status, StatusCode::OK);
    assert_eq!(me_body["data"]["email"], user.email);
    assert_eq!(me_body["data"]["username"], user.username);
}

#[sqlx::test(migrations = "./migrations")]
async fn verify_email_flips_the_flag(pool: PgPool) {
    setup_env();
    let user = register_user(build_test_app(pool.clone()), "verify").await;

    // Pull the verification token hash out of the DB — there's no way to
    // intercept the email in tests, so we look up the row and forge the
    // raw token by re-deriving it. Actually we can't reverse the hash, so
    // instead we issue a fresh token directly via the same helper the
    // route uses; that mirrors what an admin-triggered re-send would do.
    let user_id: uuid::Uuid = sqlx::query_scalar("SELECT id FROM auth.users WHERE email = $1")
        .bind(&user.email)
        .fetch_one(&pool)
        .await
        .expect("user exists");

    let raw_token = auth_service::crypto::generate_token();
    let token_hash = auth_service::crypto::hash_token(&raw_token);
    auth_service::db::store_email_verification(
        &pool,
        user_id,
        &token_hash,
        chrono::Utc::now() + chrono::Duration::hours(1),
    )
    .await
    .expect("token stored");

    let (status, _, _) = post_json(
        build_test_app(pool.clone()),
        "/api/v1/auth/verify-email",
        json!({ "token": raw_token }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let verified: bool = sqlx::query_scalar("SELECT email_verified FROM auth.users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .expect("query");
    assert!(verified, "email_verified should be true after verify");
}

#[sqlx::test(migrations = "./migrations")]
async fn refresh_rotates_tokens(pool: PgPool) {
    setup_env();
    let user = register_user(build_test_app(pool.clone()), "refresh").await;

    let (_, login_headers, _) = post_json(
        build_test_app(pool.clone()),
        "/api/v1/auth/login",
        json!({ "email": user.email, "password": user.password }),
    )
    .await;
    let first_access = extract_cookie(&login_headers, "access_token").expect("access cookie");
    let first_refresh = extract_cookie(&login_headers, "refresh_token").expect("refresh cookie");

    let cookie = cookies(&[("refresh_token", &first_refresh)]);
    let (status, refresh_headers, _) = post_with_cookie(
        build_test_app(pool),
        "/api/v1/auth/refresh",
        &cookie,
        json!({}),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let new_access = extract_cookie(&refresh_headers, "access_token").expect("rotated access");
    let new_refresh = extract_cookie(&refresh_headers, "refresh_token").expect("rotated refresh");
    // Refresh rotation: a fresh access token is expected (the previous one
    // remains valid until expiry — that's the point of short-lived access
    // + long-lived refresh). The refresh token is single-use though.
    assert!(!new_access.is_empty());
    assert_ne!(new_refresh, first_refresh, "refresh token should rotate");
    // Sanity: first access decodes against the test JWT_SECRET.
    assert!(
        shared_auth::Claims::decode(&first_access, "test-jwt-secret-do-not-use-in-prod").is_ok(),
        "issued access token must verify under test JWT_SECRET",
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn refresh_with_stale_token_fails(pool: PgPool) {
    setup_env();
    let user = register_user(build_test_app(pool.clone()), "stale").await;

    let (_, login_headers, _) = post_json(
        build_test_app(pool.clone()),
        "/api/v1/auth/login",
        json!({ "email": user.email, "password": user.password }),
    )
    .await;
    let refresh = extract_cookie(&login_headers, "refresh_token").expect("refresh");

    // Use it once.
    let cookie = cookies(&[("refresh_token", &refresh)]);
    let (status1, _, _) = post_with_cookie(
        build_test_app(pool.clone()),
        "/api/v1/auth/refresh",
        &cookie,
        json!({}),
    )
    .await;
    assert_eq!(status1, StatusCode::OK);

    // Reuse the same (now-consumed) refresh token — should fail.
    let (status2, _, _) = post_with_cookie(
        build_test_app(pool),
        "/api/v1/auth/refresh",
        &cookie,
        json!({}),
    )
    .await;
    assert_eq!(status2, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn logout_clears_refresh_tokens(pool: PgPool) {
    setup_env();
    let user = register_user(build_test_app(pool.clone()), "logout").await;

    let (_, login_headers, _) = post_json(
        build_test_app(pool.clone()),
        "/api/v1/auth/login",
        json!({ "email": user.email, "password": user.password }),
    )
    .await;
    let access = extract_cookie(&login_headers, "access_token").expect("access");
    let refresh = extract_cookie(&login_headers, "refresh_token").expect("refresh");

    // Log out — invalidates refresh tokens for this user.
    let (status, _, _) = post_with_bearer(
        build_test_app(pool.clone()),
        "/api/v1/auth/logout",
        &access,
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // The old refresh token shouldn't work anymore.
    let cookie = cookies(&[("refresh_token", &refresh)]);
    let (refresh_status, _, _) = post_with_cookie(
        build_test_app(pool),
        "/api/v1/auth/refresh",
        &cookie,
        json!({}),
    )
    .await;
    assert_eq!(refresh_status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn me_without_token_is_unauthorized(pool: PgPool) {
    setup_env();
    let (status, _, _) =
        get_with_bearer(build_test_app(pool), "/api/v1/auth/me", "not-a-real-jwt").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
