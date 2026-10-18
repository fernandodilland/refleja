//! Blindaje opcional de origen (`ORIGIN_SECRET`). Replica `main.py:38-52`.
use crate::app::AppState;
use crate::error::AppError;
use axum::extract::{Request, State};
use axum::http::{Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use subtle::ConstantTimeEq;

pub async fn origin_guard(State(st): State<AppState>, req: Request, next: Next) -> Response {
    let secret = &st.settings.origin_secret;
    if !secret.is_empty() && req.uri().path().starts_with("/api") && req.method() != Method::OPTIONS
    {
        let provided = req
            .headers()
            .get(st.settings.origin_secret_header.as_str())
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let ok = !provided.is_empty() && provided.as_bytes().ct_eq(secret.as_bytes()).into();
        if !ok {
            return AppError::detail(StatusCode::FORBIDDEN, "Origen no autorizado.")
                .into_response();
        }
    }
    next.run(req).await
}
