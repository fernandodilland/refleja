//! Tablas `admin_user`, `admin_session`, `admin_login`.
use crate::timefmt::utcnow;
use chrono::NaiveDateTime;
use sqlx::{FromRow, MySqlConnection};

#[derive(Debug, Clone, FromRow)]
pub struct AdminUser {
    pub id: i64,
    pub username: String,
    pub password_hash: String,
    pub is_active: bool,
    pub last_login_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, FromRow)]
pub struct AdminSession {
    pub id: i64,
    pub admin_user_id: i64,
    pub token_hash: String,
    pub expires_at: NaiveDateTime,
    pub revoked_at: Option<NaiveDateTime>,
}

const USER_COLS: &str = "id, username, password_hash, is_active, last_login_at";

pub async fn user_by_username(conn: &mut MySqlConnection, username: &str) -> Result<Option<AdminUser>, sqlx::Error> {
    sqlx::query_as::<_, AdminUser>(&format!("SELECT {USER_COLS} FROM admin_user WHERE username = ?"))
        .bind(username)
        .fetch_optional(conn)
        .await
}

pub async fn user_by_id(conn: &mut MySqlConnection, id: i64) -> Result<Option<AdminUser>, sqlx::Error> {
    sqlx::query_as::<_, AdminUser>(&format!("SELECT {USER_COLS} FROM admin_user WHERE id = ?"))
        .bind(id)
        .fetch_optional(conn)
        .await
}

pub async fn set_login(conn: &mut MySqlConnection, id: i64, new_hash: Option<&str>) -> Result<(), sqlx::Error> {
    match new_hash {
        Some(h) => sqlx::query("UPDATE admin_user SET password_hash = ?, last_login_at = ?, updated_at = NOW() WHERE id = ?")
            .bind(h).bind(utcnow()).bind(id).execute(conn).await?,
        None => sqlx::query("UPDATE admin_user SET last_login_at = ?, updated_at = NOW() WHERE id = ?")
            .bind(utcnow()).bind(id).execute(conn).await?,
    };
    Ok(())
}

pub struct NewLogin<'a> {
    pub admin_user_id: i64,
    pub username: &'a str,
    pub browser: Option<&'a str>,
    pub os: Option<&'a str>,
    pub device: &'a str,
    pub country: Option<&'a str>,
    pub user_agent: Option<&'a str>,
}

pub async fn insert_login(conn: &mut MySqlConnection, l: NewLogin<'_>) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO admin_login (admin_user_id, username, browser, os, device, country, user_agent) VALUES (?,?,?,?,?,?,?)")
        .bind(l.admin_user_id).bind(l.username).bind(l.browser).bind(l.os).bind(l.device).bind(l.country).bind(l.user_agent)
        .execute(conn).await?;
    Ok(())
}

pub async fn insert_session(
    conn: &mut MySqlConnection,
    user_id: i64,
    jti: &str,
    token_hash: &str,
    ua_hash: Option<&str>,
    expires_at: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO admin_session (admin_user_id, refresh_jti, token_hash, user_agent_hash, expires_at) VALUES (?,?,?,?,?)")
        .bind(user_id).bind(jti).bind(token_hash).bind(ua_hash).bind(expires_at)
        .execute(conn).await?;
    Ok(())
}

pub async fn session_by_jti(conn: &mut MySqlConnection, jti: &str) -> Result<Option<AdminSession>, sqlx::Error> {
    sqlx::query_as::<_, AdminSession>("SELECT id, admin_user_id, token_hash, expires_at, revoked_at FROM admin_session WHERE refresh_jti = ?")
        .bind(jti)
        .fetch_optional(conn)
        .await
}

pub async fn revoke_session(conn: &mut MySqlConnection, id: i64, now: NaiveDateTime) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE admin_session SET revoked_at = ?, updated_at = NOW() WHERE id = ?")
        .bind(now).bind(id).execute(conn).await?;
    Ok(())
}

/// Revoca todas las sesiones activas del usuario (reuso de refresh detectado).
pub async fn revoke_all_active(conn: &mut MySqlConnection, user_id: i64, now: NaiveDateTime) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE admin_session SET revoked_at = ?, updated_at = NOW() WHERE admin_user_id = ? AND revoked_at IS NULL")
        .bind(now).bind(user_id).execute(conn).await?;
    Ok(())
}
