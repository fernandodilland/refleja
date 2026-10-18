//! Documentación interactiva de desarrollo (`/api/docs`, `/api/openapi.json`, `/docs/oauth2-redirect`).
//! Solo se monta con `ENV` distinto de producción, como en `back/app/main.py:30-32`.
//! Los archivos de `assets/` se capturaron del propio FastAPI; si cambian los endpoints,
//! regenéralos con `scripts/refresh_openapi.sh`.
use crate::app::AppState;
use axum::http::{header, HeaderValue};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;

pub const PATHS: [&str; 3] = ["/api/docs", "/api/openapi.json", "/docs/oauth2-redirect"];

fn page(ct: &'static str, body: &'static str) -> Response {
    let mut r = body.into_response();
    r.headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(ct));
    r
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/docs",
            get(|| async {
                page(
                    "text/html; charset=utf-8",
                    include_str!("../../assets/docs.html"),
                )
            }),
        )
        .route(
            "/api/openapi.json",
            get(|| async {
                page(
                    "application/json",
                    include_str!("../../assets/openapi.json"),
                )
            }),
        )
        .route(
            "/docs/oauth2-redirect",
            get(|| async {
                page(
                    "text/html; charset=utf-8",
                    include_str!("../../assets/oauth2-redirect.html"),
                )
            }),
        )
}
