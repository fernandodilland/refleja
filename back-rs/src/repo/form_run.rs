//! Tabla `form_run` (1 fila por intento del cuestionario). Replica `analytics.py:234-255`.
use serde_json::{Map, Value};
use sqlx::{FromRow, MySqlConnection};

#[derive(Debug, Clone, PartialEq)]
pub struct FormRun {
    pub id: i64,
    pub age_bucket: Option<String>,
    pub flow_type: Option<String>,
    pub started: bool,
    pub max_step: i16,
    pub last_question_id: Option<String>,
    pub completed: bool,
    pub municipio: Option<String>,
    pub risk_level: Option<String>,
    pub score_psicologica: i16,
    pub score_fisica: i16,
    pub score_economica: i16,
    pub score_patrimonial: i16,
    pub score_sexual: i16,
    pub score_intimidacion: i16,
    /// `{"r": [qids alcanzados], "a": [qids respondidos]}` (idempotencia por pregunta).
    pub counted: Option<Map<String, Value>>,
}

#[derive(FromRow)]
struct Row {
    id: i64,
    age_bucket: Option<String>,
    flow_type: Option<String>,
    started: bool,
    max_step: i16,
    last_question_id: Option<String>,
    completed: bool,
    municipio: Option<String>,
    risk_level: Option<String>,
    score_psicologica: i16,
    score_fisica: i16,
    score_economica: i16,
    score_patrimonial: i16,
    score_sexual: i16,
    score_intimidacion: i16,
    counted: Option<String>,
}

impl From<Row> for FormRun {
    fn from(r: Row) -> Self {
        let counted = r.counted.and_then(|s| serde_json::from_str::<Value>(&s).ok()).and_then(|v| match v {
            Value::Object(m) => Some(m),
            _ => None,
        });
        FormRun {
            id: r.id,
            age_bucket: r.age_bucket,
            flow_type: r.flow_type,
            started: r.started,
            max_step: r.max_step,
            last_question_id: r.last_question_id,
            completed: r.completed,
            municipio: r.municipio,
            risk_level: r.risk_level,
            score_psicologica: r.score_psicologica,
            score_fisica: r.score_fisica,
            score_economica: r.score_economica,
            score_patrimonial: r.score_patrimonial,
            score_sexual: r.score_sexual,
            score_intimidacion: r.score_intimidacion,
            counted,
        }
    }
}

const COLS: &str = "id, age_bucket, flow_type, started, max_step, last_question_id, completed, municipio, risk_level, \
    score_psicologica, score_fisica, score_economica, score_patrimonial, score_sexual, score_intimidacion, \
    CAST(counted AS CHAR) AS counted";

pub async fn get_by_uid(conn: &mut MySqlConnection, run_uid: &str) -> Result<Option<FormRun>, sqlx::Error> {
    let q = format!("SELECT {COLS} FROM form_run WHERE run_uid = ?");
    Ok(sqlx::query_as::<_, Row>(&q).bind(run_uid).fetch_optional(conn).await?.map(Into::into))
}

/// Crea el run (tolerando que otro lo haya creado a la vez) y lo devuelve.
pub async fn create(conn: &mut MySqlConnection, run_uid: &str, visitor_id: i64) -> Result<FormRun, sqlx::Error> {
    sqlx::query("INSERT IGNORE INTO form_run (run_uid, visitor_id) VALUES (?, ?)")
        .bind(run_uid)
        .bind(visitor_id)
        .execute(&mut *conn)
        .await?;
    get_by_uid(conn, run_uid).await?.ok_or(sqlx::Error::RowNotFound)
}

/// UPDATE completo del run; fija `updated_at` (ordena "tiempo real" en el panel).
pub async fn save(conn: &mut MySqlConnection, r: &FormRun) -> Result<(), sqlx::Error> {
    let counted = r.counted.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());
    sqlx::query(
        "UPDATE form_run SET age_bucket=?, flow_type=?, started=?, max_step=?, last_question_id=?, completed=?, \
         municipio=?, risk_level=?, score_psicologica=?, score_fisica=?, score_economica=?, score_patrimonial=?, \
         score_sexual=?, score_intimidacion=?, counted=?, updated_at=NOW() WHERE id=?",
    )
    .bind(&r.age_bucket)
    .bind(&r.flow_type)
    .bind(r.started)
    .bind(r.max_step)
    .bind(&r.last_question_id)
    .bind(r.completed)
    .bind(&r.municipio)
    .bind(&r.risk_level)
    .bind(r.score_psicologica)
    .bind(r.score_fisica)
    .bind(r.score_economica)
    .bind(r.score_patrimonial)
    .bind(r.score_sexual)
    .bind(r.score_intimidacion)
    .bind(counted)
    .bind(r.id)
    .execute(conn)
    .await?;
    Ok(())
}
