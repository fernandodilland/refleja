//! Pool MariaDB y verificación del esquema (sin DDL). Replica `back/app/database.py`.
use crate::config::Settings;
use sqlx::mysql::{MySqlConnectOptions, MySqlPool, MySqlPoolOptions};
use sqlx::{Executor, Row};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use std::time::Duration;

const EXPECTED_SCHEMA: &str = include_str!("../migrations/expected_schema.txt");

pub async fn connect(st: &Settings) -> Result<MySqlPool, sqlx::Error> {
    let opts = MySqlConnectOptions::from_str(&st.database_url)?.charset("utf8mb4");
    MySqlPoolOptions::new()
        .max_connections(st.db_max_connections)
        .max_lifetime(Duration::from_secs(1800))
        .acquire_timeout(Duration::from_secs(10))
        .test_before_acquire(true)
        .after_connect(|conn, _| {
            Box::pin(async move {
                conn.execute("SET time_zone='+00:00'").await?;
                // READ COMMITTED evita el error 1020 ("Record has changed since last read") que MariaDB
                // 11.8+/12 lanza con innodb_snapshot_isolation en los incrementos concurrentes.
                conn.execute("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED")
                    .await?;
                Ok(())
            })
        })
        .connect_with(opts)
        .await
}

/// Falla rápido si falta alguna tabla/columna esperada. No ejecuta DDL (ADR-006).
pub async fn verify_schema(pool: &MySqlPool) -> Result<(), String> {
    let rows = sqlx::query(
        "SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE()",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("no se pudo leer el esquema: {e}"))?;
    let mut have: HashMap<String, HashSet<String>> = HashMap::new();
    for r in rows {
        let t: String = r.try_get("t").unwrap_or_default();
        let c: String = r.try_get("c").unwrap_or_default();
        have.entry(t.to_lowercase())
            .or_default()
            .insert(c.to_lowercase());
    }
    let mut missing = Vec::new();
    for line in EXPECTED_SCHEMA.lines().filter(|l| !l.trim().is_empty()) {
        let (table, cols) = line.split_once(':').unwrap();
        match have.get(table.trim()) {
            None => missing.push(format!("tabla {}", table.trim())),
            Some(h) => {
                for c in cols.split_whitespace() {
                    if !h.contains(c) {
                        missing.push(format!("columna {}.{}", table.trim(), c));
                    }
                }
            }
        }
    }
    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "esquema incompleto, falta: {}. Aplica migrations/0001_baseline.sql",
            missing.join(", ")
        ))
    }
}

/// Errores transitorios de concurrencia (deadlock 1213, espera de bloqueo 1205, conflicto de snapshot 1020):
/// la petición es reproducible, así que se reintenta la transacción completa.
pub fn is_retryable(e: &sqlx::Error) -> bool {
    use sqlx::mysql::MySqlDatabaseError;
    match e {
        sqlx::Error::Database(d) => d
            .try_downcast_ref::<MySqlDatabaseError>()
            .map(|m| matches!(m.number(), 1213 | 1205 | 1020))
            .unwrap_or(false),
        _ => false,
    }
}

pub async fn backoff(attempt: u32) {
    let ms = 8 * (attempt as u64 + 1) + (rand::random::<u64>() % 16);
    tokio::time::sleep(Duration::from_millis(ms)).await;
}

pub const MAX_TX_ATTEMPTS: u32 = 5;
