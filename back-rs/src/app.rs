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

/// Hash Argon2id (mismos parámetros que los reales) de una contraseña desechable: sirve de señuelo para
/// igualar tiempos cuando el usuario no existe. No es un secreto. Precalculado para no gastar 64 MiB al arrancar.
const DUMMY_HASH: &str = "$argon2id$v=19$m=65536,t=3,p=4$OSk5iJQwGsk28xm3T1VN8Q$aKyZm7yZlQwvGpKKZMywuYPMo30UDHyvB9wbAgsskDQ";

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
        let dummy_hash = DUMMY_HASH.to_string();
        let form = FormMeta::load(&settings.formulario_path);
        let cors = settings.cors_list();
        AppState(Arc::new(Inner {
            settings,
            pool,
            turnstile,
            limiter: RateLimiter::new(),
            form,
            passwords,
            dummy_hash,
            cors,
        }))
    }
}

/// Límite de cuerpo: un lote de 50 eventos pesa unos pocos KiB; 256 KiB deja holgura.
const BODY_LIMIT: usize = 256 * 1024;

pub fn build_router(state: AppState) -> Router {
    let mut api = routes::router();
    // Documentación interactiva solo fuera de producción (como `docs_url`/`openapi_url` de FastAPI).
    if !state.settings.is_prod() {
        api = api.merge(routes::docs::router());
    }
    let inner = api
        .fallback(routes::fallback)
        .method_not_allowed_fallback(routes::method_not_allowed)
        .layer(DefaultBodyLimit::max(BODY_LIMIT))
        .with_state(state.clone());
    // Las capas envuelven al router completo (no a cada MethodRouter) para que el preflight CORS
    // salga sin la cabecera `Allow` que axum añade a sus 405.
    Router::new()
        .fallback_service(inner)
        // El guard va ANTES (más interno) que CORS: así su 403 también lleva cabeceras CORS.
        .layer(middleware::from_fn_with_state(
            state.clone(),
            origin_guard::origin_guard,
        ))
        .layer(middleware::from_fn_with_state(state.clone(), cors::cors))
        .layer(middleware::from_fn(crate::http::access_log))
}
