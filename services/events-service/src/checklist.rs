//! Reset-checklist domain: the stateless period-key math plus the DB access for
//! templates, custom tasks, hidden opt-outs, and completions.
//!
//! The reset model has no scheduler. Given a task's cadence, the server's daily
//! `reset_hour`, and the user's home-server timezone, `resolve_period` computes
//! which period "now" falls into (the `period_key` we stamp on a completion) and
//! when that period ends. A task is done iff a completion row exists for its
//! current key; when the period rolls over the key changes and old rows stop
//! matching — an automatic reset with zero background work.

use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Timelike, Utc, Weekday};
use chrono_tz::Tz;
use sqlx::{PgPool, Postgres, QueryBuilder};
use std::collections::HashSet;
use uuid::Uuid;

use crate::models::{
    ChecklistTemplateInput, CreateUserTaskRequest, DbChecklistTemplate, DbUserTask,
    UpdateUserTaskRequest,
};

// ── Period-key math ──────────────────────────────────────────────────────────

/// The cadence of a task, extracted from either a template or a custom task.
pub struct Cadence {
    pub kind: String,
    pub interval_days: Option<i32>,
    pub reset_weekday: Option<i16>,
    pub reset_day_of_month: Option<i16>,
}

/// The current period a cadence resolves to: the key stamped on completions and
/// the UTC instant the period ends (the next reset).
pub struct Period {
    pub key: String,
    pub resets_at: DateTime<Utc>,
}

/// Build a UTC instant from a server-local wall-clock (y-m-d at `hour`:00),
/// tolerating DST folds/gaps: prefer the earliest valid instant, and if the wall
/// time doesn't exist (spring-forward gap) step forward until one does.
fn local_instant(tz: &Tz, y: i32, m: u32, d: u32, hour: u32) -> DateTime<Utc> {
    for h in hour..=23 {
        if let Some(dt) = tz.with_ymd_and_hms(y, m, d, h, 0, 0).earliest() {
            return dt.with_timezone(&Utc);
        }
    }
    // Nothing valid that day at/after `hour` (pathological); fall back to UTC.
    Utc.with_ymd_and_hms(y, m, d, hour.min(23), 0, 0)
        .single()
        .unwrap_or(Utc.timestamp_opt(0, 0).single().unwrap())
}

fn weekday_from_i16(v: i16) -> Weekday {
    match v.rem_euclid(7) {
        0 => Weekday::Mon,
        1 => Weekday::Tue,
        2 => Weekday::Wed,
        3 => Weekday::Thu,
        4 => Weekday::Fri,
        5 => Weekday::Sat,
        _ => Weekday::Sun,
    }
}

/// The service-day date for `local`: the calendar date the current "gacha day"
/// belongs to, given a reset at `reset_hour`. Before the reset hour we're still
/// in the previous day's window.
fn service_day(local: &DateTime<Tz>, reset_hour: u32) -> NaiveDate {
    let d = local.date_naive();
    if local.hour() < reset_hour {
        d.pred_opt().unwrap_or(d)
    } else {
        d
    }
}

/// Resolve a cadence against `now`, using the given server timezone + reset hour.
pub fn resolve_period(cadence: &Cadence, tz: Tz, reset_hour: i16, now: DateTime<Utc>) -> Period {
    let reset_hour = (reset_hour.clamp(0, 23)) as u32;
    let local = now.with_timezone(&tz);

    match cadence.kind.as_str() {
        "weekly" => {
            let target = weekday_from_i16(cadence.reset_weekday.unwrap_or(0));
            let mut anchor = service_day(&local, reset_hour);
            // Walk back to the most recent reset weekday (inclusive, ≤ 6 steps).
            while anchor.weekday() != target {
                anchor = match anchor.pred_opt() {
                    Some(d) => d,
                    None => break,
                };
            }
            let next = anchor + Duration::days(7);
            Period {
                key: format!("w:{anchor}"),
                resets_at: local_instant(&tz, next.year(), next.month(), next.day(), reset_hour),
            }
        }
        "monthly" => {
            let reset_day = cadence.reset_day_of_month.unwrap_or(1).clamp(1, 28) as u32;
            let (mut y, mut m) = (local.year(), local.month());
            let this_reset = local_instant(&tz, y, m, reset_day, reset_hour);
            if now < this_reset {
                // Before this month's reset → still in the previous month's window.
                if m == 1 {
                    y -= 1;
                    m = 12;
                } else {
                    m -= 1;
                }
            }
            let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
            Period {
                key: format!("m:{y}-{m:02}-{reset_day:02}"),
                resets_at: local_instant(&tz, ny, nm, reset_day, reset_hour),
            }
        }
        "interval" => {
            let n = cadence.interval_days.unwrap_or(1).max(1) as i64;
            let day = service_day(&local, reset_hour);
            let epoch = NaiveDate::from_ymd_opt(2020, 1, 1).unwrap();
            let idx = (day - epoch).num_days().div_euclid(n);
            let next_start = epoch + Duration::days((idx + 1) * n);
            Period {
                // n in the key so changing the interval starts a fresh period space.
                key: format!("i{n}:{idx}"),
                resets_at: local_instant(
                    &tz,
                    next_start.year(),
                    next_start.month(),
                    next_start.day(),
                    reset_hour,
                ),
            }
        }
        // "daily" (default): resets every day at reset_hour.
        _ => {
            let day = service_day(&local, reset_hour);
            let next = day + Duration::days(1);
            Period {
                key: format!("d:{day}"),
                resets_at: local_instant(&tz, next.year(), next.month(), next.day(), reset_hour),
            }
        }
    }
}

// ── Reset context (which server's tz/hour applies for a user+game) ───────────

pub struct ResetContext {
    pub tz: Tz,
    pub reset_hour: i16,
    pub server_key: Option<String>,
    pub server_name: Option<String>,
    pub timezone: String,
}

/// Pick the timezone + reset hour to key a user's checklist for a game: their
/// followed home server if set, else the game's first server, else UTC/04:00.
pub async fn resolve_reset_context(
    pool: &PgPool,
    user_id: Uuid,
    game_id: Uuid,
) -> Result<ResetContext, sqlx::Error> {
    let home: Option<String> = sqlx::query_scalar::<_, Option<String>>(
        "SELECT server FROM events.user_game_follows WHERE user_id = $1 AND game_id = $2",
    )
    .bind(user_id)
    .bind(game_id)
    .fetch_optional(pool)
    .await?
    .flatten();

    let mut row: Option<(String, String, String, i16)> = None;
    if let Some(ref key) = home {
        row = sqlx::query_as(
            "SELECT key, name, timezone, reset_hour FROM events.game_servers \
             WHERE game_id = $1 AND key = $2",
        )
        .bind(game_id)
        .bind(key)
        .fetch_optional(pool)
        .await?;
    }
    if row.is_none() {
        row = sqlx::query_as(
            "SELECT key, name, timezone, reset_hour FROM events.game_servers \
             WHERE game_id = $1 ORDER BY sort_order ASC, name ASC LIMIT 1",
        )
        .bind(game_id)
        .fetch_optional(pool)
        .await?;
    }

    Ok(match row {
        Some((key, name, timezone, reset_hour)) => ResetContext {
            tz: timezone.parse::<Tz>().unwrap_or(Tz::UTC),
            reset_hour,
            server_key: Some(key),
            server_name: Some(name),
            timezone,
        },
        None => ResetContext {
            tz: Tz::UTC,
            reset_hour: 4,
            server_key: None,
            server_name: None,
            timezone: "UTC".to_string(),
        },
    })
}

// ── Templates (admin defaults) ───────────────────────────────────────────────

pub async fn list_templates(
    pool: &PgPool,
    game_id: Uuid,
    include_unpublished: bool,
) -> Result<Vec<DbChecklistTemplate>, sqlx::Error> {
    let mut qb = QueryBuilder::new("SELECT * FROM events.checklist_templates WHERE game_id = ");
    qb.push_bind(game_id);
    if !include_unpublished {
        qb.push(" AND is_published = TRUE");
    }
    qb.push(" ORDER BY sort_order ASC, created_at ASC");
    qb.build_query_as::<DbChecklistTemplate>()
        .fetch_all(pool)
        .await
}

pub async fn find_template(
    pool: &PgPool,
    id: Uuid,
) -> Result<Option<DbChecklistTemplate>, sqlx::Error> {
    sqlx::query_as::<_, DbChecklistTemplate>(
        "SELECT * FROM events.checklist_templates WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// Replace a game's template list, keeping stable ids: inputs carrying an id are
/// updated in place, inputs without one are inserted, and templates whose id is
/// absent from the payload are deleted (along with their orphaned completions, so
/// they don't linger in the completions table forever).
pub async fn replace_templates(
    pool: &PgPool,
    game_id: Uuid,
    created_by: Uuid,
    inputs: &[ChecklistTemplateInput],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let keep: Vec<Uuid> = inputs.iter().filter_map(|t| t.id).collect();

    let removed: Vec<(Uuid,)> = sqlx::query_as(
        "DELETE FROM events.checklist_templates \
         WHERE game_id = $1 AND NOT (id = ANY($2)) RETURNING id",
    )
    .bind(game_id)
    .bind(&keep)
    .fetch_all(&mut *tx)
    .await?;
    let removed_ids: Vec<Uuid> = removed.into_iter().map(|(id,)| id).collect();
    if !removed_ids.is_empty() {
        sqlx::query(
            "DELETE FROM events.checklist_completions \
             WHERE task_source = 'template' AND task_ref = ANY($1)",
        )
        .bind(&removed_ids)
        .execute(&mut *tx)
        .await?;
    }

    for (idx, t) in inputs.iter().enumerate() {
        let sort = t.sort_order.unwrap_or(idx as i32);
        let published = t.is_published.unwrap_or(true);
        match t.id {
            Some(id) => {
                sqlx::query(
                    "UPDATE events.checklist_templates SET \
                       title = $2, description = $3, cadence_kind = $4, interval_days = $5, \
                       reset_weekday = $6, reset_day_of_month = $7, sort_order = $8, \
                       is_published = $9, updated_at = NOW() \
                     WHERE id = $1 AND game_id = $10",
                )
                .bind(id)
                .bind(&t.title)
                .bind(t.description.as_deref())
                .bind(&t.cadence_kind)
                .bind(t.interval_days)
                .bind(t.reset_weekday)
                .bind(t.reset_day_of_month)
                .bind(sort)
                .bind(published)
                .bind(game_id)
                .execute(&mut *tx)
                .await?;
            }
            None => {
                sqlx::query(
                    "INSERT INTO events.checklist_templates \
                       (game_id, title, description, cadence_kind, interval_days, \
                        reset_weekday, reset_day_of_month, sort_order, is_published, created_by) \
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
                )
                .bind(game_id)
                .bind(&t.title)
                .bind(t.description.as_deref())
                .bind(&t.cadence_kind)
                .bind(t.interval_days)
                .bind(t.reset_weekday)
                .bind(t.reset_day_of_month)
                .bind(sort)
                .bind(published)
                .bind(created_by)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    tx.commit().await
}

// ── Custom tasks (per user) ──────────────────────────────────────────────────

pub async fn list_user_tasks(
    pool: &PgPool,
    user_id: Uuid,
    game_id: Uuid,
) -> Result<Vec<DbUserTask>, sqlx::Error> {
    sqlx::query_as::<_, DbUserTask>(
        "SELECT * FROM events.checklist_user_tasks \
         WHERE user_id = $1 AND game_id = $2 ORDER BY sort_order ASC, created_at ASC",
    )
    .bind(user_id)
    .bind(game_id)
    .fetch_all(pool)
    .await
}

pub async fn find_user_task(pool: &PgPool, id: Uuid) -> Result<Option<DbUserTask>, sqlx::Error> {
    sqlx::query_as::<_, DbUserTask>("SELECT * FROM events.checklist_user_tasks WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn create_user_task(
    pool: &PgPool,
    user_id: Uuid,
    req: &CreateUserTaskRequest,
) -> Result<DbUserTask, sqlx::Error> {
    sqlx::query_as::<_, DbUserTask>(
        "INSERT INTO events.checklist_user_tasks \
           (user_id, game_id, title, cadence_kind, interval_days, reset_weekday, \
            reset_day_of_month, sort_order) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
    )
    .bind(user_id)
    .bind(req.game_id)
    .bind(&req.title)
    .bind(&req.cadence_kind)
    .bind(req.interval_days)
    .bind(req.reset_weekday)
    .bind(req.reset_day_of_month)
    .bind(req.sort_order.unwrap_or(0))
    .fetch_one(pool)
    .await
}

pub async fn update_user_task(
    pool: &PgPool,
    user_id: Uuid,
    id: Uuid,
    req: &UpdateUserTaskRequest,
) -> Result<Option<DbUserTask>, sqlx::Error> {
    sqlx::query_as::<_, DbUserTask>(
        "UPDATE events.checklist_user_tasks SET \
           title = COALESCE($3, title), \
           cadence_kind = COALESCE($4, cadence_kind), \
           interval_days = $5, reset_weekday = $6, reset_day_of_month = $7, \
           sort_order = COALESCE($8, sort_order), updated_at = NOW() \
         WHERE id = $1 AND user_id = $2 RETURNING *",
    )
    .bind(id)
    .bind(user_id)
    .bind(req.title.as_deref())
    .bind(req.cadence_kind.as_deref())
    .bind(req.interval_days)
    .bind(req.reset_weekday)
    .bind(req.reset_day_of_month)
    .bind(req.sort_order)
    .fetch_optional(pool)
    .await
}

pub async fn delete_user_task(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let result =
        sqlx::query("DELETE FROM events.checklist_user_tasks WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
    if result.rows_affected() > 0 {
        sqlx::query(
            "DELETE FROM events.checklist_completions \
             WHERE user_id = $1 AND task_source = 'custom' AND task_ref = $2",
        )
        .bind(user_id)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(result.rows_affected() > 0)
}

// ── Hidden templates (per user, per game) ────────────────────────────────────

pub async fn list_hidden(
    pool: &PgPool,
    user_id: Uuid,
    game_id: Uuid,
) -> Result<Vec<Uuid>, sqlx::Error> {
    let rows: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT h.template_id FROM events.checklist_hidden_templates h \
         JOIN events.checklist_templates t ON t.id = h.template_id \
         WHERE h.user_id = $1 AND t.game_id = $2",
    )
    .bind(user_id)
    .bind(game_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|(id,)| id).collect())
}

/// Replace the user's hidden set for one game's templates.
pub async fn set_hidden(
    pool: &PgPool,
    user_id: Uuid,
    game_id: Uuid,
    template_ids: &[Uuid],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    // Clear existing hidden rows for this user scoped to the game's templates.
    sqlx::query(
        "DELETE FROM events.checklist_hidden_templates h \
         USING events.checklist_templates t \
         WHERE h.template_id = t.id AND h.user_id = $1 AND t.game_id = $2",
    )
    .bind(user_id)
    .bind(game_id)
    .execute(&mut *tx)
    .await?;
    // Insert only ids that actually belong to this game (guards against spoofed ids).
    for id in template_ids {
        sqlx::query(
            "INSERT INTO events.checklist_hidden_templates (user_id, template_id) \
             SELECT $1, $2 WHERE EXISTS ( \
               SELECT 1 FROM events.checklist_templates WHERE id = $2 AND game_id = $3) \
             ON CONFLICT DO NOTHING",
        )
        .bind(user_id)
        .bind(id)
        .bind(game_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await
}

// ── Completions ──────────────────────────────────────────────────────────────

pub async fn set_completion(
    pool: &PgPool,
    user_id: Uuid,
    source: &str,
    task_ref: Uuid,
    period_key: &str,
    done: bool,
) -> Result<(), sqlx::Error> {
    if done {
        sqlx::query(
            "INSERT INTO events.checklist_completions \
               (user_id, task_source, task_ref, period_key) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (user_id, task_source, task_ref, period_key) DO NOTHING",
        )
        .bind(user_id)
        .bind(source)
        .bind(task_ref)
        .bind(period_key)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(
            "DELETE FROM events.checklist_completions \
             WHERE user_id = $1 AND task_source = $2 AND task_ref = $3 AND period_key = $4",
        )
        .bind(user_id)
        .bind(source)
        .bind(task_ref)
        .bind(period_key)
        .execute(pool)
        .await?;
    }
    Ok(())
}

/// Which of the given (source, task_ref, period_key) triples already have a
/// completion for this user — one round-trip via a row-value IN list.
pub async fn find_completed(
    pool: &PgPool,
    user_id: Uuid,
    triples: &[(String, Uuid, String)],
) -> Result<HashSet<(String, Uuid, String)>, sqlx::Error> {
    if triples.is_empty() {
        return Ok(HashSet::new());
    }
    let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(
        "SELECT task_source, task_ref, period_key FROM events.checklist_completions \
         WHERE user_id = ",
    );
    qb.push_bind(user_id);
    qb.push(" AND (");
    let mut first = true;
    for (s, r, k) in triples {
        if !first {
            qb.push(" OR ");
        }
        first = false;
        qb.push("(task_source = ")
            .push_bind(s.clone())
            .push(" AND task_ref = ")
            .push_bind(*r)
            .push(" AND period_key = ")
            .push_bind(k.clone())
            .push(")");
    }
    qb.push(")");
    let rows: Vec<(String, Uuid, String)> = qb.build_query_as().fetch_all(pool).await?;
    Ok(rows.into_iter().collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn cadence(kind: &str) -> Cadence {
        Cadence {
            kind: kind.to_string(),
            interval_days: Some(3),
            reset_weekday: Some(0), // Monday
            reset_day_of_month: Some(1),
        }
    }

    // Tokyo has no DST, so wall-clock math is unambiguous: JST = UTC+9.
    const JST: Tz = chrono_tz::Asia::Tokyo;

    #[test]
    fn daily_rolls_over_at_reset_hour() {
        // 04:00 JST on 2026-07-10 is 2026-07-09 19:00 UTC — the daily boundary.
        let before = Utc.with_ymd_and_hms(2026, 7, 9, 18, 0, 0).unwrap(); // 03:00 JST 07-10
        let after = Utc.with_ymd_and_hms(2026, 7, 9, 20, 0, 0).unwrap(); // 05:00 JST 07-10

        let p_before = resolve_period(&cadence("daily"), JST, 4, before);
        let p_after = resolve_period(&cadence("daily"), JST, 4, after);

        assert_eq!(p_before.key, "d:2026-07-09");
        assert_eq!(p_after.key, "d:2026-07-10");
        // Before the boundary, the current period ends exactly at it.
        assert_eq!(
            p_before.resets_at,
            Utc.with_ymd_and_hms(2026, 7, 9, 19, 0, 0).unwrap()
        );
    }

    #[test]
    fn daily_stable_within_a_period() {
        let a = Utc.with_ymd_and_hms(2026, 7, 9, 20, 0, 0).unwrap(); // 05:00 JST 07-10
        let b = Utc.with_ymd_and_hms(2026, 7, 10, 10, 0, 0).unwrap(); // 19:00 JST 07-10
        assert_eq!(
            resolve_period(&cadence("daily"), JST, 4, a).key,
            resolve_period(&cadence("daily"), JST, 4, b).key,
        );
    }

    #[test]
    fn weekly_anchors_on_reset_weekday() {
        let now = Utc.with_ymd_and_hms(2026, 7, 8, 3, 0, 0).unwrap(); // Wed 12:00 JST
        let p = resolve_period(&cadence("weekly"), JST, 4, now);
        // Key is that week's Monday; verify it parses to a Monday.
        let date = p.key.strip_prefix("w:").unwrap();
        let d = NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap();
        assert_eq!(d.weekday(), Weekday::Mon);
        // Reset is exactly 7 days after the anchor at 04:00 JST.
        assert_eq!(
            p.resets_at,
            JST.with_ymd_and_hms(d.year(), d.month(), d.day(), 4, 0, 0)
                .unwrap()
                .with_timezone(&Utc)
                + Duration::days(7)
        );
    }

    #[test]
    fn reset_is_always_in_the_future() {
        let now = Utc.with_ymd_and_hms(2026, 7, 10, 6, 30, 0).unwrap();
        for kind in ["daily", "weekly", "monthly", "interval"] {
            let p = resolve_period(&cadence(kind), JST, 4, now);
            assert!(p.resets_at > now, "{kind}: resets_at must be in the future");
        }
    }

    #[test]
    fn monthly_key_stable_and_rolls_at_reset_day() {
        // reset_day = 1. A time on the 15th belongs to this month's window.
        let mid = Utc.with_ymd_and_hms(2026, 7, 15, 0, 0, 0).unwrap();
        let p = resolve_period(&cadence("monthly"), JST, 4, mid);
        assert_eq!(p.key, "m:2026-07-01");
        // Just before the 1st at 04:00 JST still belongs to June's window.
        let before = Utc.with_ymd_and_hms(2026, 6, 30, 18, 0, 0).unwrap(); // 03:00 JST 07-01
        assert_eq!(
            resolve_period(&cadence("monthly"), JST, 4, before).key,
            "m:2026-06-01"
        );
    }
}
