//! Middleware y extractores HTTP.
pub mod cors;
pub mod extract;
pub mod origin_guard;

use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response;
use std::time::Instant;

/// Log de acceso mínimo: método, ruta, estado y latencia. Sin IP, cabeceras ni cuerpos (privacidad).
pub async fn access_log(req: Request, next: Next) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let t = Instant::now();
    let resp = next.run(req).await;
    tracing::info!(
        "{} {} -> {} ({} ms)",
        method,
        path,
        resp.status().as_u16(),
        t.elapsed().as_millis()
    );
    resp
}
