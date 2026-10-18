//! Extractores de autenticación. Replican `back/app/deps.py:26-78`.
//! Se declaran ANTES que los de cuerpo/query para que el 401 preceda al 422 (como FastAPI).
use crate::app::AppState;
use crate::error::AppError;
use crate::repo::admin::{self, AdminUser};
use crate::security::{decode_jwt, JwtError};
use axum::extract::FromRequestParts;
use axum::http::request::Parts;

/// `vid` pseudónimo del token estadístico (`X-Refleja-Token`).
pub struct PublicVid(pub String);

impl FromRequestParts<AppState> for PublicVid {
    type Rejection = AppError;
    async fn from_request_parts(parts: &mut Parts, st: &AppState) -> Result<Self, AppError> {
        let tok = parts
            .headers
            .get("x-refleja-token")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if tok.is_empty() {
            return Err(AppError::unauthorized("Falta el token estadístico."));
        }
        match decode_jwt(&st.settings.public_token_secret, tok, "public") {
            Err(JwtError::Expired) => Err(AppError::unauthorized("Token expirado.")),
            Err(JwtError::Invalid) => Err(AppError::unauthorized("Token inválido.")),
            Ok(c) => match c
                .get("vid")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
            {
                Some(v) => Ok(PublicVid(v.to_string())),
                None => Err(AppError::unauthorized("Token inválido.")),
            },
        }
    }
}

/// Administrador autenticado por access token (Bearer).
pub struct Admin(pub AdminUser);

impl FromRequestParts<AppState> for Admin {
    type Rejection = AppError;
    async fn from_request_parts(parts: &mut Parts, st: &AppState) -> Result<Self, AppError> {
        let auth = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if auth.is_empty() || !auth.to_lowercase().starts_with("bearer ") {
            return Err(AppError::unauthorized_bearer("No autenticado."));
        }
        let token = auth.split_once(' ').map(|x| x.1).unwrap_or("").trim();
        let claims = decode_jwt(&st.settings.jwt_secret, token, "access")
            .map_err(|_| AppError::unauthorized_bearer("Sesión inválida o expirada."))?;
        let id: i64 = claims
            .get("sub")
            .and_then(|s| s.as_str())
            .and_then(|s| s.trim().parse().ok())
            .ok_or_else(|| AppError::unauthorized_bearer("Sesión inválida o expirada."))?;
        let mut conn = st.pool.acquire().await?;
        match admin::user_by_id(&mut conn, id).await? {
            Some(u) if u.is_active => Ok(Admin(u)),
            _ => Err(AppError::unauthorized("Usuario no válido.")),
        }
    }
}
