//! Configuración desde variables de entorno / `.env`. Replica `back/app/config.py`.
use std::env;

const DEFAULT_SECRETS: [(&str, &str); 3] = [
    ("JWT_SECRET", "cambia-esto-en-produccion-jwt"),
    ("PUBLIC_TOKEN_SECRET", "cambia-esto-en-produccion-public"),
    ("VID_HMAC_KEY", "cambia-esto-en-produccion-hmac"),
];

#[derive(Clone)]
pub struct Settings {
    pub env: String,
    pub app_host: String,
    pub app_port: u16,
    pub database_url: String,
    pub db_max_connections: u32,
    pub cors_origins: String,
    pub jwt_secret: String,
    pub public_token_secret: String,
    pub vid_hmac_key: String,
    pub access_token_ttl_min: i64,
    pub refresh_token_ttl_days: i64,
    pub public_token_ttl_days: i64,
    pub turnstile_secret_login: String,
    pub turnstile_secret_invisible: String,
    pub turnstile_verify_url: String,
    pub dev_bypass_turnstile: bool,
    pub cookie_domain: String,
    pub cookie_secure: bool,
    pub cookie_samesite: String,
    pub refresh_cookie_name: String,
    pub origin_secret: String,
    pub origin_secret_header: String,
    pub formulario_path: String,
    pub collect_rate_per_min: usize,
    pub session_rate_per_min: usize,
    pub ping_rate_per_min: usize,
    pub public_max_events: i64,
    pub public_max_runs: i64,
    pub public_max_actions: i64,
    pub argon_concurrency: usize,
}

fn s(name: &str, default: &str) -> String {
    env::var(name).unwrap_or_else(|_| default.to_string())
}

fn parse_bool(name: &str, default: bool) -> Result<bool, String> {
    match env::var(name) {
        Err(_) => Ok(default),
        Ok(v) => match v.trim().to_lowercase().as_str() {
            "1" | "true" | "t" | "yes" | "y" | "on" => Ok(true),
            "0" | "false" | "f" | "no" | "n" | "off" => Ok(false),
            _ => Err(format!("{name}: valor booleano inválido: {v:?}")),
        },
    }
}

fn parse_num<T: std::str::FromStr>(name: &str, default: T) -> Result<T, String> {
    match env::var(name) {
        Err(_) => Ok(default),
        Ok(v) => v.trim().parse::<T>().map_err(|_| format!("{name}: valor numérico inválido: {v:?}")),
    }
}

impl Settings {
    /// Carga `.env` del directorio de trabajo (las variables del proceso tienen precedencia).
    pub fn load() -> Result<Settings, String> {
        let _ = dotenvy::from_filename(".env");
        Self::from_env()
    }

    pub fn from_env() -> Result<Settings, String> {
        let raw_url = s("DATABASE_URL", "mysql://refleja:refleja@127.0.0.1:3306/refleja");
        let database_url = if raw_url.starts_with("sqlite") {
            return Err("DATABASE_URL: SQLite no está soportado por el backend Rust; usa mysql://usuario:pass@host:3306/base".into());
        } else {
            raw_url.replacen("mysql+pymysql://", "mysql://", 1)
        };
        let st = Settings {
            env: s("ENV", "development"),
            app_host: s("APP_HOST", "127.0.0.1"),
            app_port: parse_num("APP_PORT", 20832u16)?,
            database_url,
            db_max_connections: parse_num("DB_MAX_CONNECTIONS", 10u32)?,
            cors_origins: s(
                "CORS_ORIGINS",
                "https://refleja.org,https://www.refleja.org,http://localhost:8788,http://127.0.0.1:8788,http://localhost:8080,http://127.0.0.1:8080",
            ),
            jwt_secret: s("JWT_SECRET", DEFAULT_SECRETS[0].1),
            public_token_secret: s("PUBLIC_TOKEN_SECRET", DEFAULT_SECRETS[1].1),
            vid_hmac_key: s("VID_HMAC_KEY", DEFAULT_SECRETS[2].1),
            access_token_ttl_min: parse_num("ACCESS_TOKEN_TTL_MIN", 15)?,
            refresh_token_ttl_days: parse_num("REFRESH_TOKEN_TTL_DAYS", 7)?,
            public_token_ttl_days: parse_num("PUBLIC_TOKEN_TTL_DAYS", 30)?,
            turnstile_secret_login: s("TURNSTILE_SECRET_LOGIN", ""),
            turnstile_secret_invisible: s("TURNSTILE_SECRET_INVISIBLE", ""),
            turnstile_verify_url: s("TURNSTILE_VERIFY_URL", "https://challenges.cloudflare.com/turnstile/v0/siteverify"),
            dev_bypass_turnstile: parse_bool("DEV_BYPASS_TURNSTILE", false)?,
            cookie_domain: s("COOKIE_DOMAIN", ""),
            cookie_secure: parse_bool("COOKIE_SECURE", false)?,
            cookie_samesite: s("COOKIE_SAMESITE", "lax"),
            refresh_cookie_name: s("REFRESH_COOKIE_NAME", "refleja_rt"),
            origin_secret: s("ORIGIN_SECRET", ""),
            origin_secret_header: s("ORIGIN_SECRET_HEADER", "X-Origin-Secret"),
            formulario_path: s("FORMULARIO_PATH", ""),
            collect_rate_per_min: parse_num("COLLECT_RATE_PER_MIN", 120)?,
            session_rate_per_min: parse_num("SESSION_RATE_PER_MIN", 30)?,
            ping_rate_per_min: parse_num("PING_RATE_PER_MIN", 30)?,
            public_max_events: parse_num("PUBLIC_MAX_EVENTS", 2000)?,
            public_max_runs: parse_num("PUBLIC_MAX_RUNS", 20)?,
            public_max_actions: parse_num("PUBLIC_MAX_ACTIONS", 300)?,
            argon_concurrency: parse_num("ARGON2_CONCURRENCY", 2usize)?,
        };
        st.fail_closed()?;
        Ok(st)
    }

    /// En producción no se permite arrancar con secretos por defecto o débiles.
    fn fail_closed(&self) -> Result<(), String> {
        if self.is_prod() {
            let vals = [&self.jwt_secret, &self.public_token_secret, &self.vid_hmac_key];
            for ((name, default), val) in DEFAULT_SECRETS.iter().zip(vals) {
                if val == default || val.chars().count() < 32 {
                    return Err(format!(
                        "{name} debe definirse con un valor seguro (>=32 chars) en producción. Genera uno con: openssl rand -hex 48"
                    ));
                }
            }
        }
        Ok(())
    }

    pub fn is_prod(&self) -> bool {
        self.env.to_lowercase().starts_with("prod")
    }

    pub fn cors_list(&self) -> Vec<String> {
        self.cors_origins.split(',').map(|o| o.trim().to_string()).filter(|o| !o.is_empty()).collect()
    }

    /// Nunca se ignora Turnstile en producción.
    pub fn bypass_turnstile(&self) -> bool {
        self.dev_bypass_turnstile && !self.is_prod()
    }

    pub fn cookie_secure_effective(&self) -> bool {
        self.cookie_secure || self.is_prod()
    }
}
