//! Endpoints del panel `/api/platform/*` (solo admin). Replica `back/app/routers/platform.py`.
use crate::app::AppState;
use crate::error::{AppError, AppResult, ValErr};
use crate::http::extract::Admin;
use crate::timefmt::{isoformat, round4, utcnow};
use axum::extract::{RawQuery, State};
use axum::Json;
use chrono::{Duration, NaiveDate};
use serde_json::{json, Map, Value};
use sqlx::{MySql, QueryBuilder, Row};
use std::collections::HashMap;

const ACTIVE_WINDOW_SECONDS: i64 = 90;
const SCORES: [&str; 6] = ["psicologica", "fisica", "economica", "patrimonial", "sexual", "intimidacion"];

// ------------------------------------------------------------ parámetros de query
struct Query {
    map: HashMap<String, String>,
    errs: Vec<ValErr>,
}

impl Query {
    fn parse(raw: Option<String>) -> Query {
        let mut map = HashMap::new();
        if let Some(r) = raw {
            for (k, v) in form_urlencoded::parse(r.as_bytes()) {
                map.insert(k.into_owned(), v.into_owned()); // la última gana (Starlette)
            }
        }
        Query { map, errs: vec![] }
    }

    fn err(&mut self, typ: &'static str, name: &str, msg: String, input: &str, ctx: Option<Value>) {
        self.errs.push(ValErr { typ, loc: vec![json!("query"), json!(name)], msg, input: json!(input), ctx });
    }

    /// Cadena libre; vacía = sin filtro (falsy en Python).
    fn text(&self, name: &str) -> Option<String> {
        self.map.get(name).filter(|s| !s.is_empty()).cloned()
    }

    fn date(&mut self, name: &str) -> Option<NaiveDate> {
        let raw = self.map.get(name)?.clone();
        let (d, t) = match raw.split_once(['T', ' ']) {
            Some((d, t)) => (d.to_string(), Some(t.to_string())),
            None => (raw.clone(), None),
        };
        if raw.len() < 10 {
            self.err("date_from_datetime_parsing", name, "Input should be a valid date or datetime, input is too short".into(), &raw, Some(json!({"error": "input is too short"})));
            return None;
        }
        let parsed = NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok();
        let time_ok = t.map_or(true, |t| t.trim_end_matches('Z').trim_end_matches("+00:00").chars().all(|c| c == '0' || c == ':' || c == '.'));
        match parsed {
            Some(p) if time_ok => Some(p),
            _ => {
                self.err("date_from_datetime_parsing", name, "Input should be a valid date or datetime, invalid character in year".into(), &raw, Some(json!({"error": "invalid character in year"})));
                None
            }
        }
    }

    fn int(&mut self, name: &str, default: i64, min: i64, max: i64) -> i64 {
        let Some(raw) = self.map.get(name).cloned() else { return default };
        match raw.trim().parse::<i64>() {
            Err(_) => {
                self.err("int_parsing", name, "Input should be a valid integer, unable to parse string as an integer".into(), &raw, None);
                default
            }
            Ok(n) if n < min => {
                self.err("greater_than_equal", name, format!("Input should be greater than or equal to {min}"), &raw, Some(json!({"ge": min})));
                default
            }
            Ok(n) if n > max => {
                self.err("less_than_equal", name, format!("Input should be less than or equal to {max}"), &raw, Some(json!({"le": max})));
                default
            }
            Ok(n) => n,
        }
    }

    fn finish(self) -> AppResult<()> {
        if self.errs.is_empty() { Ok(()) } else { Err(AppError::Validation(self.errs)) }
    }
}

struct RunFilters {
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
    flow: Option<String>,
    muni: Option<String>,
}

impl RunFilters {
    fn parse(q: &mut Query, with_muni: bool) -> RunFilters {
        RunFilters {
            from: q.date("date_from"),
            to: q.date("date_to"),
            flow: q.text("flow_type"),
            muni: if with_muni { q.text("municipio") } else { None },
        }
    }

    /// Añade ` AND ...` (la consulta ya tiene `WHERE`).
    fn push(&self, qb: &mut QueryBuilder<'_, MySql>) {
        if let Some(d) = self.from {
            qb.push(" AND created_at >= ").push_bind(d.and_hms_opt(0, 0, 0).unwrap());
        }
        if let Some(d) = self.to {
            qb.push(" AND created_at < ").push_bind((d + Duration::days(1)).and_hms_opt(0, 0, 0).unwrap());
        }
        if let Some(f) = &self.flow {
            qb.push(" AND flow_type = ").push_bind(f.clone());
        }
        if let Some(m) = &self.muni {
            qb.push(" AND municipio = ").push_bind(m.clone());
        }
    }
}

async fn count_runs(st: &AppState, extra: &str, f: &RunFilters) -> Result<i64, sqlx::Error> {
    let mut qb = QueryBuilder::<MySql>::new(format!("SELECT COUNT(id) FROM form_run WHERE 1=1 {extra}"));
    f.push(&mut qb);
    qb.build_query_scalar::<i64>().fetch_one(&st.pool).await
}

async fn scalar(st: &AppState, sql: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar::<_, i64>(sql).fetch_one(&st.pool).await
}

fn rate(num: i64, den: i64) -> f64 {
    if den != 0 { round4(num as f64 / den as f64) } else { 0.0 }
}

// ------------------------------------------------------------ endpoints
pub async fn overview(State(st): State<AppState>, _a: Admin, RawQuery(raw): RawQuery) -> AppResult<Json<Value>> {
    let mut q = Query::parse(raw);
    let f = RunFilters::parse(&mut q, true);
    q.finish()?;

    let total_visitors = scalar(&st, "SELECT COUNT(id) FROM visitor").await?;
    let cutoff = utcnow() - Duration::seconds(ACTIVE_WINDOW_SECONDS);
    let active_now: i64 = sqlx::query_scalar("SELECT COUNT(id) FROM visitor WHERE last_seen_at >= ?").bind(cutoff).fetch_one(&st.pool).await?;
    let total_runs = count_runs(&st, "", &f).await?;
    let started = count_runs(&st, "AND started = 1", &f).await?;
    let completed = count_runs(&st, "AND completed = 1", &f).await?;
    let minors = count_runs(&st, "AND age_bucket = 'minor'", &f).await?;
    let started_visitors = scalar(&st, "SELECT COUNT(DISTINCT visitor_id) FROM form_run WHERE started = 1 AND visitor_id IS NOT NULL").await?;
    let entered_not_started = (total_visitors - started_visitors).max(0);
    let repeat_visitors = scalar(
        &st,
        "SELECT COUNT(*) FROM (SELECT visitor_id FROM form_run WHERE started = 1 AND visitor_id IS NOT NULL GROUP BY visitor_id HAVING COUNT(id) > 1) t",
    )
    .await?;
    let rows = sqlx::query("SELECT name, `count` FROM event_counter WHERE name IN ('urgent_click','hide_click','restart')").fetch_all(&st.pool).await?;
    let mut counters: HashMap<String, i64> = HashMap::new();
    for r in rows {
        counters.insert(r.try_get("name")?, r.try_get("count")?);
    }
    let c = |k: &str| *counters.get(k).unwrap_or(&0);
    Ok(Json(json!({
        "total_visitors": total_visitors,
        "active_now": active_now,
        "total_runs": total_runs,
        "started": started,
        "completed": completed,
        "minors": minors,
        "entered_not_started": entered_not_started,
        "repeat_visitors": repeat_visitors,
        "urgent_clicks": c("urgent_click"),
        "hide_clicks": c("hide_click"),
        "restarts": c("restart"),
        "completion_rate": rate(completed, started),
        "start_rate": rate(started_visitors, total_visitors),
    })))
}

/// Agrupa por una columna nullable; la clave `NULL` se serializa como `"null"` (como Python).
async fn group_counts(st: &AppState, col: &str, cutoff: chrono::NaiveDateTime) -> Result<Value, sqlx::Error> {
    let sql = format!("SELECT {col} AS k, COUNT(id) AS n FROM visitor WHERE last_seen_at >= ? GROUP BY {col}");
    let rows = sqlx::query(&sql).bind(cutoff).fetch_all(&st.pool).await?;
    let mut m = Map::new();
    for r in rows {
        let k: Option<String> = r.try_get("k")?;
        let n: i64 = r.try_get("n")?;
        m.insert(k.unwrap_or_else(|| "null".into()), json!(n));
    }
    Ok(Value::Object(m))
}

pub async fn realtime(State(st): State<AppState>, _a: Admin, RawQuery(raw): RawQuery) -> AppResult<Json<Value>> {
    let mut q = Query::parse(raw);
    let window = q.int("window_seconds", ACTIVE_WINDOW_SECONDS, 5, 900);
    let limit = q.int("limit", 20, 1, 100);
    q.finish()?;
    let now = utcnow();
    let cutoff = now - Duration::seconds(window);
    let active: i64 = sqlx::query_scalar("SELECT COUNT(id) FROM visitor WHERE last_seen_at >= ?").bind(cutoff).fetch_one(&st.pool).await?;
    let by_device = group_counts(&st, "device", cutoff).await?;
    let by_country = group_counts(&st, "country", cutoff).await?;
    let rows = sqlx::query(
        "SELECT flow_type, age_bucket, last_question_id, max_step, municipio, started, completed, risk_level, updated_at \
         FROM form_run ORDER BY updated_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(&st.pool)
    .await?;
    let mut recent = Vec::new();
    for r in rows {
        let upd: chrono::NaiveDateTime = r.try_get("updated_at")?;
        recent.push(json!({
            "flow_type": r.try_get::<Option<String>, _>("flow_type")?,
            "age_bucket": r.try_get::<Option<String>, _>("age_bucket")?,
            "last_question_id": r.try_get::<Option<String>, _>("last_question_id")?,
            "max_step": r.try_get::<i16, _>("max_step")?,
            "municipio": r.try_get::<Option<String>, _>("municipio")?,
            "started": r.try_get::<bool, _>("started")?,
            "completed": r.try_get::<bool, _>("completed")?,
            "risk_level": r.try_get::<Option<String>, _>("risk_level")?,
            "seconds_ago": (now - upd).num_seconds().max(0),
        }));
    }
    Ok(Json(json!({
        "window_seconds": window,
        "active_visitors": active,
        "by_device": by_device,
        "by_country": by_country,
        "recent_runs": recent,
    })))
}

pub async fn funnel(State(st): State<AppState>, _a: Admin) -> AppResult<Json<Value>> {
    let rows = sqlx::query("SELECT question_id, reached_count, answered_count FROM question_stat").fetch_all(&st.pool).await?;
    let mut stats: Vec<(String, i64, i64)> = Vec::new();
    for r in rows {
        stats.push((r.try_get("question_id")?, r.try_get("reached_count")?, r.try_get("answered_count")?));
    }
    let lookup: HashMap<&str, (i64, i64)> = stats.iter().map(|(q, r, a)| (q.as_str(), (*r, *a))).collect();
    let step = |qid: &str| -> Value {
        let (reached, answered) = lookup.get(qid).copied().unwrap_or((0, 0));
        let drop = (reached - answered).max(0);
        json!({"question_id": qid, "reached": reached, "answered": answered, "drop": drop, "drop_rate": rate(drop, reached)})
    };
    let mut flows = Map::new();
    for (name, order) in &st.form.flow_order {
        flows.insert(name.to_string(), Value::Array(order.iter().map(|q| step(q)).collect()));
    }
    let intro: Vec<Value> = st.form.intro_order.iter().map(|q| step(q)).collect();

    let cbf = sqlx::query("SELECT flow_type, COUNT(id) AS n FROM form_run WHERE completed = 1 AND flow_type IS NOT NULL GROUP BY flow_type")
        .fetch_all(&st.pool)
        .await?;
    let mut completed_by_flow = Map::new();
    for r in cbf {
        completed_by_flow.insert(r.try_get::<String, _>("flow_type")?, json!(r.try_get::<i64, _>("n")?));
    }

    let mut top: Vec<(i64, Value)> = stats
        .iter()
        .filter(|(q, _, _)| !["MINOR", "LOCATION", "RESULT"].contains(&q.as_str()))
        .map(|(q, r, _)| (*r, step(q)))
        .collect();
    top.sort_by(|a, b| b.0.cmp(&a.0)); // estable, como `sorted(..., reverse=True)` de Python
    let top: Vec<Value> = top.into_iter().take(10).map(|(_, v)| v).collect();

    Ok(Json(json!({"intro": intro, "flows": flows, "completed_by_flow": completed_by_flow, "top_reached": top})))
}

pub async fn violence(State(st): State<AppState>, _a: Admin, RawQuery(raw): RawQuery) -> AppResult<Json<Value>> {
    let mut q = Query::parse(raw);
    let f = RunFilters::parse(&mut q, true);
    q.finish()?;
    let cols: Vec<String> = SCORES.iter().map(|s| format!("score_{s}")).collect();
    let mx = format!("GREATEST({})", cols.join(", "));
    let mut sel: Vec<String> = Vec::new();
    for (i, c) in cols.iter().enumerate() {
        sel.push(format!("CAST(COALESCE(SUM({c}), 0) AS SIGNED) AS t{i}"));
    }
    for (i, c) in cols.iter().enumerate() {
        sel.push(format!("CAST(COALESCE(SUM({c} > 0), 0) AS SIGNED) AS p{i}"));
    }
    for (i, c) in cols.iter().enumerate() {
        // dominante = el PRIMERO (en orden fijo) que alcanza el máximo, si el máximo es > 0
        let prev: String = cols[..i].iter().map(|p| format!(" AND {p} <> {mx}")).collect();
        sel.push(format!("CAST(COALESCE(SUM({mx} > 0 AND {c} = {mx}{prev}), 0) AS SIGNED) AS d{i}"));
    }
    sel.push("COUNT(id) AS n".into());
    let mut qb = QueryBuilder::<MySql>::new(format!("SELECT {} FROM form_run WHERE completed = 1", sel.join(", ")));
    f.push(&mut qb);
    let row = qb.build().fetch_one(&st.pool).await?;
    let (mut totals, mut present, mut dominant) = (Map::new(), Map::new(), Map::new());
    for (i, s) in SCORES.iter().enumerate() {
        totals.insert(s.to_string(), json!(row.try_get::<i64, _>(format!("t{i}").as_str())?));
        present.insert(s.to_string(), json!(row.try_get::<i64, _>(format!("p{i}").as_str())?));
        dominant.insert(s.to_string(), json!(row.try_get::<i64, _>(format!("d{i}").as_str())?));
    }
    Ok(Json(json!({"totals": totals, "present": present, "dominant": dominant, "completed_runs": row.try_get::<i64, _>("n")?})))
}

pub async fn municipios(State(st): State<AppState>, _a: Admin, RawQuery(raw): RawQuery) -> AppResult<Json<Value>> {
    let mut q = Query::parse(raw);
    let f = RunFilters::parse(&mut q, false);
    let limit = q.int("limit", 60, 1, 100);
    q.finish()?;
    let mut qb = QueryBuilder::<MySql>::new("SELECT municipio, COUNT(id) AS n FROM form_run WHERE municipio IS NOT NULL");
    f.push(&mut qb);
    qb.push(" GROUP BY municipio ORDER BY COUNT(id) DESC LIMIT ").push_bind(limit);
    let rows = qb.build().fetch_all(&st.pool).await?;
    let mut items = Vec::new();
    for r in rows {
        items.push(json!({"municipio": r.try_get::<String, _>("municipio")?, "count": r.try_get::<i64, _>("n")?}));
    }
    let dir = sqlx::query("SELECT name, `count` FROM event_counter WHERE name LIKE 'dir_muni:%' ORDER BY `count` DESC LIMIT ?")
        .bind(limit)
        .fetch_all(&st.pool)
        .await?;
    let mut directory = Vec::new();
    for r in dir {
        let name: String = r.try_get("name")?;
        let muni = name.split_once(':').map(|x| x.1).unwrap_or("").to_string();
        directory.push(json!({"municipio": muni, "count": r.try_get::<i64, _>("count")?}));
    }
    Ok(Json(json!({"items": items, "directory": directory})))
}

pub async fn logins(State(st): State<AppState>, _a: Admin, RawQuery(raw): RawQuery) -> AppResult<Json<Value>> {
    let mut q = Query::parse(raw);
    let limit = q.int("limit", 100, 1, 500);
    q.finish()?;
    let rows = sqlx::query(
        "SELECT username, browser, os, device, country, user_agent, created_at FROM admin_login ORDER BY created_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(&st.pool)
    .await?;
    let mut items = Vec::new();
    for r in rows {
        let at: chrono::NaiveDateTime = r.try_get("created_at")?;
        items.push(json!({
            "username": r.try_get::<String, _>("username")?,
            "browser": r.try_get::<Option<String>, _>("browser")?,
            "os": r.try_get::<Option<String>, _>("os")?,
            "device": r.try_get::<Option<String>, _>("device")?,
            "country": r.try_get::<Option<String>, _>("country")?,
            "user_agent": r.try_get::<Option<String>, _>("user_agent")?,
            "created_at": isoformat(&at),
        }));
    }
    Ok(Json(json!({"items": items})))
}

pub async fn timeseries(State(st): State<AppState>, _a: Admin, RawQuery(raw): RawQuery) -> AppResult<Json<Value>> {
    let mut q = Query::parse(raw);
    let from = q.date("date_from");
    let to = q.date("date_to");
    q.finish()?;
    let mut qb = QueryBuilder::<MySql>::new("SELECT metric_date, page_views, form_starts, form_completes, minors, new_visitors FROM daily_metric WHERE 1=1");
    if let Some(d) = from {
        qb.push(" AND metric_date >= ").push_bind(d);
    }
    if let Some(d) = to {
        qb.push(" AND metric_date <= ").push_bind(d);
    }
    qb.push(" ORDER BY metric_date ASC");
    let rows = qb.build().fetch_all(&st.pool).await?;
    let mut items = Vec::new();
    for r in rows {
        let d: NaiveDate = r.try_get("metric_date")?;
        items.push(json!({
            "date": d.format("%Y-%m-%d").to_string(),
            "page_views": r.try_get::<i64, _>("page_views")?,
            "form_starts": r.try_get::<i64, _>("form_starts")?,
            "form_completes": r.try_get::<i64, _>("form_completes")?,
            "minors": r.try_get::<i64, _>("minors")?,
            "new_visitors": r.try_get::<i64, _>("new_visitors")?,
        }));
    }
    Ok(Json(json!({"items": items})))
}
