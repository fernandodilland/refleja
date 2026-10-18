//! `question_stat`, `event_counter`, `daily_metric`: incrementos atómicos (upsert). Replica `analytics.py:152-231`.
use crate::form_meta::FormMeta;
use crate::timefmt::today_utc;
use sqlx::MySqlConnection;

pub async fn bump_question(
    conn: &mut MySqlConnection,
    form: &FormMeta,
    qid: &str,
    reached: i64,
    answered: i64,
) -> Result<(), sqlx::Error> {
    if !form.is_valid_question_id(qid) || (reached == 0 && answered == 0) {
        return Ok(());
    }
    sqlx::query(
        "INSERT INTO question_stat (question_id, reached_count, answered_count) VALUES (?, ?, ?) \
         ON DUPLICATE KEY UPDATE reached_count = reached_count + VALUES(reached_count), \
         answered_count = answered_count + VALUES(answered_count), updated_at = NOW()",
    )
    .bind(qid)
    .bind(reached)
    .bind(answered)
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn bump_counter(
    conn: &mut MySqlConnection,
    name: &str,
    n: i64,
) -> Result<(), sqlx::Error> {
    if name.is_empty() || n == 0 {
        return Ok(());
    }
    let name: String = name.chars().take(64).collect();
    sqlx::query(
        "INSERT INTO event_counter (name, `count`) VALUES (?, ?) \
         ON DUPLICATE KEY UPDATE `count` = `count` + VALUES(`count`), updated_at = NOW()",
    )
    .bind(name)
    .bind(n)
    .execute(conn)
    .await?;
    Ok(())
}

#[derive(Default, Clone, Copy)]
pub struct DailyDeltas {
    pub page_views: i64,
    pub form_starts: i64,
    pub form_completes: i64,
    pub minors: i64,
    pub new_visitors: i64,
}

pub async fn bump_daily(conn: &mut MySqlConnection, d: DailyDeltas) -> Result<(), sqlx::Error> {
    if d.page_views == 0
        && d.form_starts == 0
        && d.form_completes == 0
        && d.minors == 0
        && d.new_visitors == 0
    {
        return Ok(());
    }
    sqlx::query(
        "INSERT INTO daily_metric (metric_date, page_views, form_starts, form_completes, minors, new_visitors) \
         VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE \
         page_views = page_views + VALUES(page_views), form_starts = form_starts + VALUES(form_starts), \
         form_completes = form_completes + VALUES(form_completes), minors = minors + VALUES(minors), \
         new_visitors = new_visitors + VALUES(new_visitors), updated_at = NOW()",
    )
    .bind(today_utc())
    .bind(d.page_views)
    .bind(d.form_starts)
    .bind(d.form_completes)
    .bind(d.minors)
    .bind(d.new_visitors)
    .execute(conn)
    .await?;
    Ok(())
}
