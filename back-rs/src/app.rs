//! Estado compartido y construcción del router. Replica `back/app/main.py`.
use crate::config::Settings;
use crate::form_meta::FormMeta;
use crate::http::{cors, origin_guard};
use crate::rate_limit::RateLimiter;
use crate::routes;
use crate::security::Passwords;
use crate::turnstile::Turnstile;
use axum::extract::DefaultBodyLimit;
use axum::middleware;
use axum::Router;
use sqlx::MySqlPool;
use std::ops::Deref;
use std::sync::Arc;

pub struct Inner {
    pub settings: Settings,
    pub pool: MySqlPool,
    pub turnstile: Turnstile,
    pub limiter: RateLimiter,
    pub form: FormMeta,
    pub passwords: Passwords,
    /// Hash señuelo para igualar tiempos cuando el usuario no existe (evita enumeración).
    pub dummy_hash: String,
    pub cors: Vec<String>,
}

#[derive(Clone)]
pub struct AppState(pub Arc<Inner>);

impl Deref for AppState {
    type Target = Inner;
    fn deref(&self) -> &Inner {
        &self.0
    }
}

impl AppState {
    pub async fn new(settings: Settings, pool: MySqlPool) -> AppState {
        let turnstile = Turnstile::new(
            settings.turnstile_verify_url.clone(),
            settings.bypass_turnstile(),
            settings.turnstile_secret_login.clone(),
            settings.turnstile_secret_invisible.clone(),
        );
        let passwords = Passwords::new(settings.argon_concurrency);
        let dummy_hash = passwords.hash("refleja-timing-dummy-not-a-real-password".into()).await;
        let form = FormMeta::load(&settings.formulario_path);
        let cors = settings.cors_list();
        AppState(Arc::new(Inner { settings, pool, turnstile, limiter: RateLimiter::new(), form, passwords, dummy_hash, cors }))
    }
}

/// Límite de cuerpo: un lote de 50 eventos pesa unos pocos KiB; 256 KiB deja holgura.
const BODY_LIMIT: usize = 256 * 1024;

pub fn build_router(state: AppState) -> Router {
    routes::router()
        .fallback(routes::fallback)
        .method_not_allowed_fallback(routes::method_not_allowed)
        .layer(DefaultBodyLimit::max(BODY_LIMIT))
        // El guard va ANTES (más interno) que CORS: así su 403 también lleva cabeceras CORS.
        .layer(middleware::from_fn_with_state(state.clone(), origin_guard::origin_guard))
        .layer(middleware::from_fn_with_state(state.clone(), cors::cors))
        .layer(middleware::from_fn(crate::http::access_log))
        .with_state(state)
}
