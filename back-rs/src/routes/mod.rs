//! Rutas bajo `/api`. Replica el registro de routers de `main.py:65-72`.
pub mod auth;
pub mod collect;
pub mod platform;
pub mod public;

use crate::app::AppState;
use axum::extract::Request;
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, MethodRouter};
use axum::{Json, Router};
use serde_json::json;

const ROUTE_PATHS: [&str; 15] = [
    "/api/health",
    "/api/public/session",
    "/api/public/ping",
    "/api/public/collect",
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/auth/me",
    "/api/platform/overview",
    "/api/platform/realtime",
    "/api/platform/funnel",
    "/api/platform/violence",
    "/api/platform/municipios",
    "/api/platform/logins",
    "/api/platform/timeseries",
];

/// GET sin el HEAD automático de axum (FastAPI responde 405 a HEAD).
fn get_only<H, T>(h: H) -> MethodRouter<AppState>
where
    H: axum::handler::Handler<T, AppState>,
    T: 'static,
{
    get(h).head(method_not_allowed)
}

const GET_ROUTES: [&str; 9] = [
    "/api/health", "/api/auth/me", "/api/platform/overview", "/api/platform/realtime", "/api/platform/funnel",
    "/api/platform/violence", "/api/platform/municipios", "/api/platform/logins", "/api/platform/timeseries",
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/health", get_only(health))
        .route("/api/public/session", post(public::session))
        .route("/api/public/ping", post(public::ping))
        .route("/api/public/collect", post(collect::collect))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/refresh", post(auth::refresh))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/me", get_only(auth::me))
        .route("/api/platform/overview", get_only(platform::overview))
        .route("/api/platform/realtime", get_only(platform::realtime))
        .route("/api/platform/funnel", get_only(platform::funnel))
        .route("/api/platform/violence", get_only(platform::violence))
        .route("/api/platform/municipios", get_only(platform::municipios))
        .route("/api/platform/logins", get_only(platform::logins))
        .route("/api/platform/timeseries", get_only(platform::timeseries))
}

async fn health(axum::extract::State(st): axum::extract::State<AppState>) -> Json<serde_json::Value> {
    Json(json!({"status": "ok", "env": st.settings.env}))
}

/// 404 JSON; si existe la ruta sin la barra final, 307 hacia ella (como Starlette `redirect_slashes`).
pub async fn fallback(req: Request) -> Response {
    let path = req.uri().path();
    if path.len() > 1 && path.ends_with('/') {
        let alt = &path[..path.len() - 1];
        if ROUTE_PATHS.contains(&alt) {
            let host = req.headers().get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("localhost");
            let scheme = req.headers().get("x-forwarded-proto").and_then(|v| v.to_str().ok()).unwrap_or("http");
            let mut loc = format!("{scheme}://{host}{alt}");
            if let Some(q) = req.uri().query() {
                loc.push('?');
                loc.push_str(q);
            }
            let mut r = StatusCode::TEMPORARY_REDIRECT.into_response();
            if let Ok(v) = HeaderValue::from_str(&loc) {
                r.headers_mut().insert(header::LOCATION, v);
            }
            return r;
        }
    }
    (StatusCode::NOT_FOUND, Json(json!({"detail": "Not Found"}))).into_response()
}

pub async fn method_not_allowed(req: Request) -> Response {
    let allow = if GET_ROUTES.contains(&req.uri().path()) { "GET" } else { "POST" };
    let mut r = (StatusCode::METHOD_NOT_ALLOWED, Json(json!({"detail": "Method Not Allowed"}))).into_response();
    r.headers_mut().insert(header::ALLOW, HeaderValue::from_static(allow));
    r
}
