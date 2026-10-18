//! `POST /api/public/collect`. Replica `back/app/routers/public.py:127-323` y `schemas.py:18-77`.
use crate::app::AppState;
use crate::client::{client_country, device_from_ua, user_agent};
use crate::error::{AppError, AppResult, ValErr};
use crate::http::extract::PublicVid;
use crate::municipios::normalize_municipio;
use crate::repo::counters::{self, DailyDeltas};
use crate::repo::form_run::{self, FormRun};
use crate::repo::visitor;
use crate::security::hmac_vid;
use crate::validate::{expect_object, loc_of, parse_json_body, Errs};
use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Map, Value};
use sqlx::MySqlConnection;
use std::collections::HashMap;

const EVENT_TYPES: [&str; 10] = [
    "page_view", "run_start", "answer", "minor", "municipio", "result",
    "urgent_click", "hide_click", "restart", "directory_municipio",
];
const ACTION_EVENTS: [&str; 5] = ["page_view", "urgent_click", "hide_click", "restart", "directory_municipio"];

struct Scores {
    psicologica: i64,
    fisica: i64,
    economica: i64,
    patrimonial: i64,
    sexual: i64,
    intimidacion: i64,
}

struct Event {
    typ: String,
    run_uid: Option<String>,
    question_id: Option<String>,
    next_id: Option<String>,
    step: Option<i64>,
    flow_type: Option<String>,
    age_bucket: Option<String>,
    municipio: Option<String>,
    risk_level: Option<String>,
    scores: Option<Scores>,
    device: Option<String>,
}

fn model_type_err(loc: Vec<Value>, input: &Value) -> ValErr {
    ValErr {
        typ: "model_attributes_type",
        loc,
        msg: "Input should be a valid dictionary or object to extract fields from".into(),
        input: input.clone(),
        ctx: None,
    }
}

fn parse_event(v: &Value, base: &[Value], errs: &mut Errs) -> Option<Event> {
    let obj = match v.as_object() {
        Some(o) => o,
        None => {
            errs.0.push(model_type_err(base.to_vec(), v));
            return None;
        }
    };
    let before = errs.0.len();
    let typ = errs.literal(obj, base, "type", &EVENT_TYPES, true);
    let run_uid = errs.string(obj, base, "run_uid", 0, 36, false);
    let question_id = errs.string(obj, base, "question_id", 0, 32, false);
    let next_id = errs.string(obj, base, "next_id", 0, 32, false);
    let step = errs.int(obj, base, "step", 0, 20);
    let flow_type = errs.literal(obj, base, "flow_type", &["pareja", "fam", "trab"], false);
    let age_bucket = errs.literal(obj, base, "age_bucket", &["minor", "18-25", "26-40", "41+"], false);
    let municipio = errs.string(obj, base, "municipio", 0, 48, false);
    let risk_level = errs.literal(obj, base, "risk_level", &["low", "medium", "high"], false);
    let device = errs.literal(obj, base, "device", &["mobile", "desktop", "tablet"], false);
    let scores = match obj.get("scores") {
        None | Some(Value::Null) => None,
        Some(Value::Object(s)) => {
            let sb = loc_of(base, "scores");
            let mut g = |k: &str| errs.int(s, &sb, k, 0, 60).unwrap_or(0);
            Some(Scores {
                psicologica: g("psicologica"),
                fisica: g("fisica"),
                economica: g("economica"),
                patrimonial: g("patrimonial"),
                sexual: g("sexual"),
                intimidacion: g("intimidacion"),
            })
        }
        Some(other) => {
            errs.0.push(model_type_err(loc_of(base, "scores"), other));
            None
        }
    };
    if errs.0.len() > before {
        return None;
    }
    Some(Event { typ: typ?, run_uid, question_id, next_id, step, flow_type, age_bucket, municipio, risk_level, scores, device })
}

/// `CollectBatch`: lote `{"events": [...]}` o evento suelto `{"type": ...}` (compatibilidad).
fn parse_batch(v: &Value) -> Result<Vec<Event>, AppError> {
    let obj = expect_object(v)?;
    let wrapped: Map<String, Value>;
    let (obj, single) = if !obj.contains_key("events") && obj.contains_key("type") {
        let mut m = Map::new();
        m.insert("events".into(), Value::Array(vec![v.clone()]));
        wrapped = m;
        (&wrapped, true)
    } else {
        (obj, false)
    };
    let _ = single;
    let base = [json!("body")];
    let mut errs = Errs::new();
    let arr = match obj.get("events") {
        None => {
            errs.missing(&base, "events", obj);
            return errs.into_result(vec![]);
        }
        Some(Value::Array(a)) => a,
        Some(other) => {
            errs.push("list_type", loc_of(&base, "events"), "Input should be a valid list", other.clone(), None);
            return errs.into_result(vec![]);
        }
    };
    if arr.len() > 50 {
        errs.push(
            "too_long",
            loc_of(&base, "events"),
            format!("List should have at most 50 items after validation, not {}", arr.len()),
            Value::Array(arr.clone()),
            Some(json!({"field_type": "List", "max_length": 50, "actual_length": arr.len()})),
        );
        return errs.into_result(vec![]);
    }
    let mut events = Vec::with_capacity(arr.len());
    for (i, ev) in arr.iter().enumerate() {
        let mut loc = loc_of(&base, "events");
        loc.push(json!(i));
        if let Some(e) = parse_event(ev, &loc, &mut errs) {
            events.push(e);
        }
    }
    errs.into_result(events)
}

/// Cuotas de por vida del visitante (anti-abuso).
struct Quota {
    events: i64,
    runs: i64,
    actions: i64,
    d_events: i64,
    d_runs: i64,
    d_completions: i64,
    d_page_views: i64,
    d_actions: i64,
}

struct Entry {
    run: FormRun,
    orig: FormRun,
}

struct Ctx<'a> {
    st: &'a AppState,
    visitor_id: i64,
    q: Quota,
    runs: HashMap<String, Entry>,
}

impl Ctx<'_> {
    /// Run del evento; lo crea si hace falta y la cuota lo permite.
    async fn run_for(&mut self, conn: &mut MySqlConnection, ev: &Event) -> Result<Option<String>, sqlx::Error> {
        let uid = match ev.run_uid.as_deref() {
            Some(u) if !u.is_empty() => u.to_string(),
            _ => return Ok(None),
        };
        if self.runs.contains_key(&uid) {
            return Ok(Some(uid));
        }
        let run = match form_run::get_by_uid(conn, &uid).await? {
            Some(r) => r,
            None => {
                if self.q.runs + self.q.d_runs >= self.st.settings.public_max_runs {
                    return Ok(None);
                }
                let r = form_run::create(conn, &uid, self.visitor_id).await?;
                self.q.d_runs += 1;
                r
            }
        };
        self.runs.insert(uid.clone(), Entry { orig: run.clone(), run });
        Ok(Some(uid))
    }

    /// Cuenta reached('r') o answered('a') de un qid UNA vez por run (idempotente).
    async fn count_q(&mut self, conn: &mut MySqlConnection, uid: &str, qid: Option<&str>, kind: &str) -> Result<(), sqlx::Error> {
        let Some(qid) = qid else { return Ok(()) };
        if qid.is_empty() || !self.st.form.is_valid_question_id(qid) {
            return Ok(());
        }
        let run = &mut self.runs.get_mut(uid).expect("run cargado").run;
        let mut counted = run.counted.clone().unwrap_or_default();
        let mut seen: Vec<Value> = counted.get(kind).and_then(|v| v.as_array().cloned()).unwrap_or_default();
        if seen.iter().any(|s| s.as_str() == Some(qid)) {
            return Ok(());
        }
        seen.push(json!(qid));
        counted.insert(kind.to_string(), Value::Array(seen));
        run.counted = Some(counted);
        if kind == "r" {
            counters::bump_question(conn, &self.st.form, qid, 1, 0).await
        } else {
            counters::bump_question(conn, &self.st.form, qid, 0, 1).await
        }
    }

    async fn process(&mut self, conn: &mut MySqlConnection, ev: &Event) -> Result<(), sqlx::Error> {
        let et = ev.typ.as_str();
        // Eventos globales (no ligados a un run): acotados por la cuota de acciones.
        if ACTION_EVENTS.contains(&et) {
            if self.q.actions + self.q.d_actions >= self.st.settings.public_max_actions {
                return Ok(());
            }
            self.q.d_actions += 1;
            match et {
                "page_view" => {
                    self.q.d_page_views += 1;
                    counters::bump_daily(conn, DailyDeltas { page_views: 1, ..Default::default() }).await?;
                }
                "urgent_click" | "hide_click" | "restart" => counters::bump_counter(conn, et, 1).await?,
                _ => {
                    if let Some(m) = normalize_municipio(ev.municipio.as_deref()) {
                        counters::bump_counter(conn, &format!("dir_muni:{m}"), 1).await?;
                    }
                }
            }
            return Ok(());
        }

        // Eventos del formulario: requieren un run (acotado por la cuota de runs).
        let Some(uid) = self.run_for(conn, ev).await? else { return Ok(()) };
        match et {
            "run_start" => {
                let r = &mut self.runs.get_mut(&uid).unwrap().run;
                r.started = true;
                if r.max_step < 1 {
                    r.max_step = 1;
                }
                r.last_question_id = Some("age".into());
                self.count_q(conn, &uid, Some("age"), "r").await?;
            }
            "answer" => {
                let st = self.st;
                let form = &st.form;
                let flow: Option<String> = ev.flow_type.clone().or_else(|| self.runs[&uid].run.flow_type.clone());
                let q_ok = form.qid_ok_for_flow(ev.question_id.as_deref().unwrap_or(""), flow.as_deref());
                if q_ok {
                    self.count_q(conn, &uid, ev.question_id.as_deref(), "a").await?;
                }
                let nxt: Option<&str> = ev
                    .next_id
                    .as_deref()
                    .filter(|n| !n.is_empty() && form.qid_ok_for_flow(n, flow.as_deref()));
                if let Some(n) = nxt {
                    self.count_q(conn, &uid, Some(n), "r").await?;
                }
                let mut bump_start = false;
                {
                    let r = &mut self.runs.get_mut(&uid).unwrap().run;
                    r.started = true;
                    if let Some(ft) = &ev.flow_type {
                        if r.flow_type.is_none() && !r.completed {
                            bump_start = true;
                        }
                        r.flow_type = Some(ft.clone());
                    }
                    if let Some(ab) = &ev.age_bucket {
                        r.age_bucket = Some(ab.clone());
                    }
                    if let Some(step) = ev.step {
                        if step > r.max_step as i64 {
                            r.max_step = step as i16;
                        }
                    }
                    let last = nxt
                        .map(|s| s.to_string())
                        .or_else(|| if q_ok { ev.question_id.clone().filter(|s| !s.is_empty()) } else { None });
                    if let Some(l) = last {
                        r.last_question_id = Some(l);
                    }
                }
                if bump_start {
                    counters::bump_daily(conn, DailyDeltas { form_starts: 1, ..Default::default() }).await?;
                }
            }
            "minor" => {
                let r = &mut self.runs.get_mut(&uid).unwrap().run;
                r.started = true;
                r.age_bucket = Some("minor".into());
                r.last_question_id = Some("MINOR".into());
                if !r.completed {
                    r.completed = true;
                    self.q.d_completions += 1;
                    counters::bump_daily(conn, DailyDeltas { minors: 1, form_completes: 1, ..Default::default() }).await?;
                }
            }
            "municipio" => {
                if let Some(m) = normalize_municipio(ev.municipio.as_deref()) {
                    let r = &mut self.runs.get_mut(&uid).unwrap().run;
                    r.municipio = Some(m);
                    r.last_question_id = Some("LOCATION".into());
                }
            }
            "result" => {
                let r = &mut self.runs.get_mut(&uid).unwrap().run;
                r.started = true;
                r.last_question_id = Some("RESULT".into());
                if let Some(rl) = &ev.risk_level {
                    r.risk_level = Some(rl.clone());
                }
                if let Some(m) = normalize_municipio(ev.municipio.as_deref()) {
                    r.municipio = Some(m);
                }
                if let Some(s) = &ev.scores {
                    r.score_psicologica = s.psicologica as i16;
                    r.score_fisica = s.fisica as i16;
                    r.score_economica = s.economica as i16;
                    r.score_patrimonial = s.patrimonial as i16;
                    r.score_sexual = s.sexual as i16;
                    r.score_intimidacion = s.intimidacion as i16;
                }
                if !r.completed {
                    r.completed = true;
                    self.q.d_completions += 1;
                    counters::bump_daily(conn, DailyDeltas { form_completes: 1, ..Default::default() }).await?;
                }
            }
            _ => {}
        }
        Ok(())
    }
}

pub async fn collect(
    State(st): State<AppState>,
    PublicVid(vid): PublicVid,
    headers: HeaderMap,
    body: Bytes,
) -> AppResult<Json<Value>> {
    let v = parse_json_body(&headers, &body)?;
    let events = parse_batch(&v)?;

    let vid_h = hmac_vid(&st.settings.vid_hmac_key, &vid);
    if !st.limiter.allow(&format!("coll:{vid_h}"), st.settings.collect_rate_per_min) {
        return Err(AppError::too_many("Demasiadas peticiones."));
    }

    let country = client_country(&headers);
    let ua = user_agent(&headers);
    let mut device: String = device_from_ua(ua.as_deref()).to_string();
    if let Some(d) = events.iter().find_map(|e| e.device.clone()) {
        device = d;
    }

    let mut tx = st.pool.begin().await?;
    let (vis, _) = visitor::get_or_create(&mut tx, &vid_h, country.as_deref(), Some(&device)).await?;
    let mut ctx = Ctx {
        st: &st,
        visitor_id: vis.id,
        q: Quota {
            events: vis.events_count as i64,
            runs: vis.run_count as i64,
            actions: vis.action_count as i64,
            d_events: 0,
            d_runs: 0,
            d_completions: 0,
            d_page_views: 0,
            d_actions: 0,
        },
        runs: HashMap::new(),
    };
    let mut accepted = 0;
    for ev in &events {
        if ctx.q.events + ctx.q.d_events >= st.settings.public_max_events {
            break; // cuota de por vida alcanzada: se ignora el resto
        }
        ctx.process(&mut tx, ev).await?;
        ctx.q.d_events += 1;
        accepted += 1;
    }
    for e in ctx.runs.values() {
        if e.run != e.orig {
            form_run::save(&mut tx, &e.run).await?;
        }
    }
    let q = &ctx.q;
    visitor::bump_quota(&mut tx, &vid_h, q.d_events, q.d_runs, q.d_completions, q.d_page_views, q.d_actions).await?;
    tx.commit().await?;
    Ok(Json(json!({"ok": true, "accepted": accepted})))
}
