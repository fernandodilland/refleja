//! CORS idéntico al `CORSMiddleware` de Starlette configurado en `main.py:55-62`.
use crate::app::AppState;
use crate::error::text_response;
use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::Response;

const ALLOW_METHODS: [&str; 3] = ["GET", "POST", "OPTIONS"];
const ALLOW_HEADERS_JOINED: &str = "Accept, Accept-Language, Authorization, Content-Language, Content-Type, X-Refleja-Token";
const ALLOW_HEADERS: [&str; 6] = ["accept", "accept-language", "authorization", "content-language", "content-type", "x-refleja-token"];

fn hv(s: &str) -> HeaderValue {
    HeaderValue::from_str(s).unwrap_or_else(|_| HeaderValue::from_static(""))
}

fn preflight(origin: &str, headers: &HeaderMap, allowed: bool) -> Response {
    let req_method = headers.get("access-control-request-method").and_then(|v| v.to_str().ok()).unwrap_or("");
    let req_headers = headers.get("access-control-request-headers").and_then(|v| v.to_str().ok());
    let mut failures: Vec<&str> = Vec::new();
    if !allowed {
        failures.push("origin");
    }
    if !ALLOW_METHODS.contains(&req_method) {
        failures.push("method");
    }
    if let Some(h) = req_headers {
        if h.split(',').any(|x| !ALLOW_HEADERS.contains(&x.to_lowercase().trim())) {
            failures.push("headers");
        }
    }
    let mut resp = if failures.is_empty() {
        text_response(StatusCode::OK, "OK")
    } else {
        text_response(StatusCode::BAD_REQUEST, &format!("Disallowed CORS {}", failures.join(", ")))
    };
    let h = resp.headers_mut();
    h.insert(header::VARY, HeaderValue::from_static("Origin"));
    h.insert(header::ACCESS_CONTROL_ALLOW_METHODS, hv(&ALLOW_METHODS.join(", ")));
    h.insert(header::ACCESS_CONTROL_MAX_AGE, HeaderValue::from_static("600"));
    h.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, hv(ALLOW_HEADERS_JOINED));
    h.insert(header::ACCESS_CONTROL_ALLOW_CREDENTIALS, HeaderValue::from_static("true"));
    if allowed {
        h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, hv(origin));
    }
    resp
}

pub async fn cors(State(st): State<AppState>, req: Request, next: Next) -> Response {
    let origin = match req.headers().get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        Some(o) => o.to_string(),
        None => return next.run(req).await,
    };
    let allowed = st.cors.iter().any(|o| o == &origin);
    if req.method() == Method::OPTIONS && req.headers().contains_key("access-control-request-method") {
        return preflight(&origin, req.headers(), allowed);
    }
    let mut resp = next.run(req).await;
    let h = resp.headers_mut();
    h.insert(header::ACCESS_CONTROL_ALLOW_CREDENTIALS, HeaderValue::from_static("true"));
    if allowed {
        h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, hv(&origin));
        h.append(HeaderName::from_static("vary"), HeaderValue::from_static("Origin"));
    }
    resp
}
