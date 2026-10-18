//! Autenticación del administrador. Replica `back/app/routers/auth.py`.
use crate::app::AppState;
use crate::client::{browser_from_ua, client_country, client_ip, device_from_ua, os_from_ua, user_agent};
use crate::error::{AppError, AppResult};
use crate::http::extract::Admin;
use crate::repo::admin::{self, NewLogin};
use crate::security::{decode_jwt, encode_jwt, needs_rehash, new_jti, sha256_hex};
use crate::timefmt::{isoformat, utcnow};
use crate::validate::{expect_object, parse_json_body, Errs};
use axum::body::Bytes;
use axum::extract::{ConnectInfo, State};
use axum::http::{header, HeaderMap, HeaderValue};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};
use sqlx::MySqlConnection;
use std::net::SocketAddr;

const COOKIE_PATH: &str = "/api/auth";

/// `Set-Cookie` como lo emite Starlette (atributos en orden alfabético).
fn set_refresh_cookie(st: &AppState, token: &str) -> HeaderValue {
    let s = &st.settings;
    let mut c = format!("{}={}", s.refresh_cookie_name, token);
    if !s.cookie_domain.is_empty() {
        c.push_str(&format!("; Domain={}", s.cookie_domain));
    }
    c.push_str(&format!("; HttpOnly; Max-Age={}; Path={}; SameSite={}", s.refresh_token_ttl_days * 86400, COOKIE_PATH, s.cookie_samesite));
    if s.cookie_secure_effective() {
        c.push_str("; Secure");
    }
    HeaderValue::from_str(&c).expect("cookie válida")
}

fn clear_refresh_cookie(st: &AppState) -> HeaderValue {
    let s = &st.settings;
    let mut c = format!("{}=\"\"", s.refresh_cookie_name);
    if !s.cookie_domain.is_empty() {
        c.push_str(&format!("; Domain={}", s.cookie_domain));
    }
    let exp = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT");
    c.push_str(&format!("; expires={exp}; Max-Age=0; Path={COOKIE_PATH}; SameSite=lax"));
    HeaderValue::from_str(&c).expect("cookie válida")
}

fn token_body(st: &AppState, access: String) -> Json<Value> {
    Json(json!({"access_token": access, "token_type": "bearer", "expires_in": st.settings.access_token_ttl_min * 60}))
}

fn create_access(st: &AppState, user_id: i64, username: &str) -> String {
    encode_jwt(
        &st.settings.jwt_secret,
        vec![("typ", "access".into()), ("sub", user_id.to_string().into()), ("username", username.into())],
        st.settings.access_token_ttl_min * 60,
    )
}

/// Crea la sesión (refresh) y devuelve `(access_token, Set-Cookie)`.
async fn issue_session(st: &AppState, conn: &mut MySqlConnection, user_id: i64, username: &str, headers: &HeaderMap) -> Result<(String, HeaderValue), AppError> {
    let jti = new_jti();
    let refresh = encode_jwt(
        &st.settings.jwt_secret,
        vec![("typ", "refresh".into()), ("sub", user_id.to_string().into()), ("jti", jti.clone().into())],
        st.settings.refresh_token_ttl_days * 86400,
    );
    let ua = user_agent(headers);
    let ua_hash = ua.as_deref().filter(|u| !u.is_empty()).map(sha256_hex);
    let expires = utcnow() + chrono::Duration::days(st.settings.refresh_token_ttl_days);
    admin::insert_session(conn, user_id, &jti, &sha256_hex(&refresh), ua_hash.as_deref(), expires).await?;
    Ok((create_access(st, user_id, username), set_refresh_cookie(st, &refresh)))
}

fn with_cookie(mut r: Response, cookie: HeaderValue) -> Response {
    r.headers_mut().append(header::SET_COOKIE, cookie);
    r
}

pub async fn login(
    State(st): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: Bytes,
) -> AppResult<Response> {
    let v = parse_json_body(&headers, &body)?;
    let obj = expect_object(&v)?;
    let mut errs = Errs::new();
    let b = [json!("body")];
    let username = errs.string(obj, &b, "username", 1, 64, true);
    let password = errs.string(obj, &b, "password", 1, 256, true);
    let ts = errs.string(obj, &b, "turnstile_token", 1, 2048, true);
    errs.into_result(())?;
    let (username, password, ts) = (username.unwrap_or_default(), password.unwrap_or_default(), ts.unwrap_or_default());

    let ip = client_ip(&headers, Some(peer));
    if !st.turnstile.verify_login(Some(&ts), ip.as_deref()).await {
        return Err(AppError::forbidden("Verificación anti-bot fallida."));
    }

    let mut tx = st.pool.begin().await?;
    let user = admin::user_by_username(&mut tx, &username).await?;
    // Siempre se ejecuta un Argon2 (hash real o señuelo): el tiempo no revela si el usuario existe.
    let valid = match &user {
        Some(u) if u.is_active => st.passwords.verify(u.password_hash.clone(), password.clone()).await,
        _ => {
            st.passwords.verify(st.dummy_hash.clone(), password.clone()).await;
            false
        }
    };
    let user = match (valid, user) {
        (true, Some(u)) => u,
        _ => return Err(AppError::unauthorized("Usuario o contraseña incorrectos.")),
    };

    let new_hash = if needs_rehash(&user.password_hash) { Some(st.passwords.hash(password).await) } else { None };
    admin::set_login(&mut tx, user.id, new_hash.as_deref()).await?;

    // Historial de inicio de sesión (datos generales, sin IP).
    let ua = user_agent(&headers);
    let ua255: Option<String> = ua.as_ref().map(|u| u.chars().take(255).collect::<String>()).filter(|u| !u.is_empty());
    let country = client_country(&headers);
    admin::insert_login(
        &mut tx,
        NewLogin {
            admin_user_id: user.id,
            username: &user.username,
            browser: browser_from_ua(ua.as_deref()),
            os: os_from_ua(ua.as_deref()),
            device: device_from_ua(ua.as_deref()),
            country: country.as_deref(),
            user_agent: ua255.as_deref(),
        },
    )
    .await?;

    let (access, cookie) = issue_session(&st, &mut tx, user.id, &user.username, &headers).await?;
    tx.commit().await?;
    Ok(with_cookie(token_body(&st, access).into_response(), cookie))
}

/// Valor de una cookie del header `Cookie`.
fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    for h in headers.get_all(header::COOKIE) {
        let Ok(s) = h.to_str() else { continue };
        for part in s.split(';') {
            if let Some((k, v)) = part.trim().split_once('=') {
                if k == name {
                    return Some(v.trim_matches('"').to_string());
                }
            }
        }
    }
    None
}

pub async fn refresh(State(st): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    let cookie = cookie_value(&headers, &st.settings.refresh_cookie_name).filter(|c| !c.is_empty());
    let Some(cookie) = cookie else { return Err(AppError::unauthorized("Sin sesión.")) };
    // Nota: igual que en Python, los 401 de esta ruta NO envían Set-Cookie (ADR-010).
    let data = decode_jwt(&st.settings.jwt_secret, &cookie, "refresh").map_err(|_| AppError::unauthorized("Sesión inválida."))?;
    let jti = data.get("jti").and_then(|j| j.as_str()).unwrap_or("").to_string();

    let mut tx = st.pool.begin().await?;
    let sess = admin::session_by_jti(&mut tx, &jti).await?;
    let now = utcnow();
    let sess = match sess {
        Some(s) if s.token_hash == sha256_hex(&cookie) => s,
        _ => return Err(AppError::unauthorized("Sesión inválida.")),
    };

    // Reuso de un refresh YA rotado => posible robo: se invalida toda la familia del admin.
    if sess.revoked_at.is_some() {
        admin::revoke_all_active(&mut tx, sess.admin_user_id, now).await?;
        tx.commit().await?;
        tracing::warn!("Reuso de refresh token detectado (admin_user_id={}). Familia de sesiones revocada.", sess.admin_user_id);
        return Err(AppError::unauthorized("Sesión revocada por seguridad."));
    }
    if sess.expires_at < now {
        return Err(AppError::unauthorized("Sesión expirada."));
    }
    let user = match admin::user_by_id(&mut tx, sess.admin_user_id).await? {
        Some(u) if u.is_active => u,
        _ => return Err(AppError::unauthorized("Usuario no válido.")),
    };

    // Rotación: se revoca la sesión actual y se emite una nueva.
    admin::revoke_session(&mut tx, sess.id, now).await?;
    let (access, cookie) = issue_session(&st, &mut tx, user.id, &user.username, &headers).await?;
    tx.commit().await?;
    Ok(with_cookie(token_body(&st, access).into_response(), cookie))
}

pub async fn logout(State(st): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    if let Some(cookie) = cookie_value(&headers, &st.settings.refresh_cookie_name).filter(|c| !c.is_empty()) {
        if let Ok(data) = decode_jwt(&st.settings.jwt_secret, &cookie, "refresh") {
            let jti = data.get("jti").and_then(|j| j.as_str()).unwrap_or("");
            let mut conn = st.pool.acquire().await?;
            if let Some(s) = admin::session_by_jti(&mut conn, jti).await? {
                if s.revoked_at.is_none() {
                    admin::revoke_session(&mut conn, s.id, utcnow()).await?;
                }
            }
        }
    }
    Ok(with_cookie(Json(json!({"ok": true})).into_response(), clear_refresh_cookie(&st)))
}

pub async fn me(Admin(u): Admin) -> Json<Value> {
    Json(json!({"id": u.id, "username": u.username, "last_login_at": u.last_login_at.as_ref().map(isoformat)}))
}

