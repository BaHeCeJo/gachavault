use sqlx::postgres::PgPoolOptions;
pub use sqlx::PgPool;

/// Build the per-service Postgres pool. Pool size and timeout are overridable
/// via `DATABASE_POOL_SIZE` and `DATABASE_ACQUIRE_TIMEOUT_SECS` env vars so
/// services with different traffic profiles can tune without a code change.
///
/// Defaults: 20 connections / 5s acquire timeout. The previous defaults were
/// 10 / 30s — too small under bursty load (requests queue and time out) and
/// too patient on a degraded DB (every handler stalls 30s before failing).
/// 5s is short enough to surface DB outages as fast errors, long enough to
/// cover normal transient spikes.
pub async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let max_connections: u32 = std::env::var("DATABASE_POOL_SIZE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(20);
    let acquire_timeout_secs: u64 = std::env::var("DATABASE_ACQUIRE_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5);
    tracing::info!(
        max_connections,
        acquire_timeout_secs,
        "Connecting to database..."
    );
    let pool = PgPoolOptions::new()
        .max_connections(max_connections)
        .min_connections(2)
        .acquire_timeout(std::time::Duration::from_secs(acquire_timeout_secs))
        .connect(database_url)
        .await?;
    tracing::info!("Database connection pool established");
    Ok(pool)
}
