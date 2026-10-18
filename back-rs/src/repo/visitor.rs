//! Tabla `visitor`. Replica `analytics.py:99-149`.
use crate::timefmt::utcnow;
use chrono::NaiveDateTime;
use sqlx::{FromRow, MySqlConnection};

#[derive(Debug, Clone, FromRow)]
pub struct Visitor {
    pub id: i64,
    pub events_count: i32,
    pub run_count: i32,
    pub action_count: i32,
}

pub async fn find_by_hash(conn: &mut MySqlConnection, vid_hash: &str) -> Result<Option<Visitor>, sqlx::Error> {
    sqlx::query_as::<_, Visitor>("SELECT id, events_count, run_count, action_count FROM visitor WHERE vid_hash = ?")
        .bind(vid_hash)
        .fetch_optional(conn)
        .await
}

/// Devuelve `(visitante, creado)`. Tolera la carrera de dos creaciones simultáneas.
pub async fn get_or_create(
    conn: &mut MySqlConnection,
    vid_hash: &str,
    country: Option<&str>,
    device: Option<&str>,
) -> Result<(Visitor, bool), sqlx::Error> {
    if let Some(v) = find_by_hash(conn, vid_hash).await? {
        return Ok((v, false));
    }
    let now: NaiveDateTime = utcnow();
    let res = sqlx::query(
        "INSERT IGNORE INTO visitor (vid_hash, country, device, page_views, last_seen_at) VALUES (?, ?, ?, 0, ?)",
    )
    .bind(vid_hash)
    .bind(country)
    .bind(device)
    .bind(now)
    .execute(&mut *conn)
    .await?;
    let created = res.rows_affected() == 1;
    let v = find_by_hash(conn, vid_hash).await?.ok_or(sqlx::Error::RowNotFound)?;
    Ok((v, created))
}

pub async fn touch(conn: &mut MySqlConnection, vid_hash: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE visitor SET last_seen_at = ?, updated_at = NOW() WHERE vid_hash = ?")
        .bind(utcnow())
        .bind(vid_hash)
        .execute(conn)
        .await?;
    Ok(())
}

/// Persiste (incrementos atómicos) las cuotas del visitante + `last_seen_at`.
pub async fn bump_quota(
    conn: &mut MySqlConnection,
    vid_hash: &str,
    events: i64,
    runs: i64,
    completions: i64,
    page_views: i64,
    actions: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE visitor SET events_count = events_count + ?, run_count = run_count + ?, \
         completed_count = completed_count + ?, action_count = action_count + ?, \
         page_views = page_views + ?, last_seen_at = ?, updated_at = NOW() WHERE vid_hash = ?",
    )
    .bind(events)
    .bind(runs)
    .bind(completions)
    .bind(actions)
    .bind(page_views)
    .bind(utcnow())
    .bind(vid_hash)
    .execute(conn)
    .await?;
    Ok(())
}
