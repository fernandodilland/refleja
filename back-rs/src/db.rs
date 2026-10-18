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
        have.entry(t.to_lowercase()).or_default().insert(c.to_lowercase());
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
        Err(format!("esquema incompleto, falta: {}. Aplica migrations/0001_baseline.sql", missing.join(", ")))
    }
}
