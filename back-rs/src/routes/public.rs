//! `POST /api/public/session` y `/api/public/ping`. Replica `back/app/routers/public.py:63-124`.
use crate::app::AppState;
use crate::client::{client_country, client_ip, device_from_ua, user_agent};
use crate::error::{AppError, AppResult};
use crate::http::extract::PublicVid;
use crate::repo::{counters, visitor};
use crate::security::{encode_jwt, hmac_vid, new_vid};
use crate::validate::{expect_object, parse_json_body, Errs};
use axum::body::Bytes;
use axum::extract::{ConnectInfo, State};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};
use std::net::SocketAddr;

pub async fn session(
    State(st): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: Bytes,
) -> AppResult<Json<Value>> {
    let v = parse_json_body(&headers, &body)?;
    let obj = expect_object(&v)?;
    let mut errs = Errs::new();
    let token = errs.string(obj, &[json!("body")], "turnstile_token", 1, 2048, true);
    errs.into_result(())?;
    let token = token.unwrap_or_default();

    // Límite por IP: evita emisión masiva de tokens aunque se resuelva Turnstile en bucle.
    let ip = client_ip(&headers, Some(peer)).unwrap_or_else(|| "unknown".into());
    if !st
        .limiter
        .allow(&format!("sess:{ip}"), st.settings.session_rate_per_min)
    {
        return Err(AppError::too_many("Demasiadas solicitudes."));
    }
    if !st.turnstile.verify_invisible(Some(&token), Some(&ip)).await {
        return Err(AppError::forbidden("Verificación anti-bot fallida."));
    }

    let vid = new_vid();
    let vid_h = hmac_vid(&st.settings.vid_hmac_key, &vid);
    let ua = user_agent(&headers);
    let device = device_from_ua(ua.as_deref());
    let country = client_country(&headers);

    let mut attempt = 0;
    loop {
        let r: Result<(), sqlx::Error> = async {
            let mut tx = st.pool.begin().await?;
            let (_, created) =
                visitor::get_or_create(&mut tx, &vid_h, country.as_deref(), Some(device)).await?;
            if created {
                counters::bump_daily(
                    &mut tx,
                    counters::DailyDeltas {
                        new_visitors: 1,
                        ..Default::default()
                    },
                )
                .await?;
            }
            tx.commit().await
        }
        .await;
        match r {
            Ok(()) => break,
            Err(e) if crate::db::is_retryable(&e) && attempt + 1 < crate::db::MAX_TX_ATTEMPTS => {
                attempt += 1;
                crate::db::backoff(attempt).await;
            }
            Err(e) => return Err(e.into()),
        }
    }

    let ttl_days = st.settings.public_token_ttl_days;
    let token = encode_jwt(
        &st.settings.public_token_secret,
        vec![("typ", "public".into()), ("vid", vid.into())],
        ttl_days * 86400,
    );
    Ok(Json(json!({"token": token, "expires_in_days": ttl_days})))
}

pub async fn ping(
    State(st): State<AppState>,
    PublicVid(vid): PublicVid,
    headers: HeaderMap,
) -> AppResult<Json<Value>> {
    let vid_h = hmac_vid(&st.settings.vid_hmac_key, &vid);
    if !st
        .limiter
        .allow(&format!("ping:{vid_h}"), st.settings.ping_rate_per_min)
    {
        return Err(AppError::too_many("Demasiadas señales."));
    }
    let country = client_country(&headers);
    let ua = user_agent(&headers);
    let device = device_from_ua(ua.as_deref());
    let mut tx = st.pool.begin().await?;
    visitor::get_or_create(&mut tx, &vid_h, country.as_deref(), Some(device)).await?;
    visitor::touch(&mut tx, &vid_h).await?;
    tx.commit().await?;
    Ok(Json(json!({"ok": true})))
}
