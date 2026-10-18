//! Errores y formatos de respuesta observables. Replica el comportamiento de FastAPI:
//! `{"detail": "..."}` para errores de negocio y 422 con estructura Pydantic para validación.
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Map, Value};

#[derive(Debug, Clone)]
pub struct ValErr {
    pub typ: &'static str,
    pub loc: Vec<Value>,
    pub msg: String,
    pub input: Value,
    pub ctx: Option<Value>,
}

impl ValErr {
    pub fn to_json(&self) -> Value {
        let mut m = Map::new();
        m.insert("type".into(), json!(self.typ));
        m.insert("loc".into(), Value::Array(self.loc.clone()));
        m.insert("msg".into(), json!(self.msg));
        m.insert("input".into(), self.input.clone());
        if let Some(c) = &self.ctx {
            m.insert("ctx".into(), c.clone());
        }
        Value::Object(m)
    }
}

#[derive(Debug)]
pub enum AppError {
    /// `{"detail": <texto>}` con el estado indicado (y `WWW-Authenticate: Bearer` opcional).
    Detail {
        status: StatusCode,
        detail: String,
        bearer: bool,
    },
    Validation(Vec<ValErr>),
    PayloadTooLarge,
    Internal(String),
}

impl AppError {
    pub fn detail(status: StatusCode, detail: &str) -> Self {
        AppError::Detail {
            status,
            detail: detail.to_string(),
            bearer: false,
        }
    }
    pub fn unauthorized(detail: &str) -> Self {
        Self::detail(StatusCode::UNAUTHORIZED, detail)
    }
    pub fn unauthorized_bearer(detail: &str) -> Self {
        AppError::Detail {
            status: StatusCode::UNAUTHORIZED,
            detail: detail.to_string(),
            bearer: true,
        }
    }
    pub fn forbidden(detail: &str) -> Self {
        Self::detail(StatusCode::FORBIDDEN, detail)
    }
    pub fn too_many(detail: &str) -> Self {
        Self::detail(StatusCode::TOO_MANY_REQUESTS, detail)
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Internal(format!("db: {e}"))
    }
}

pub fn text_response(status: StatusCode, body: &str) -> Response {
    let mut r = (status, body.to_string()).into_response();
    r.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    r
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            AppError::Detail {
                status,
                detail,
                bearer,
            } => {
                let mut r = (status, Json(json!({ "detail": detail }))).into_response();
                if bearer {
                    r.headers_mut()
                        .insert(header::WWW_AUTHENTICATE, HeaderValue::from_static("Bearer"));
                }
                r
            }
            AppError::Validation(errs) => {
                let arr: Vec<Value> = errs.iter().map(|e| e.to_json()).collect();
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(json!({ "detail": arr })),
                )
                    .into_response()
            }
            AppError::PayloadTooLarge => {
                text_response(StatusCode::PAYLOAD_TOO_LARGE, "Request Entity Too Large")
            }
            AppError::Internal(msg) => {
                tracing::error!("error interno: {msg}");
                text_response(StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error")
            }
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
