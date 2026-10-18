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

type Getter<'a> = &'a dyn Fn(&str) -> Option<String>;

fn s(g: Getter, name: &str, default: &str) -> String {
    g(name).unwrap_or_else(|| default.to_string())
}

fn parse_bool(g: Getter, name: &str, default: bool) -> Result<bool, String> {
    match g(name) {
        None => Ok(default),
        Some(v) => match v.trim().to_lowercase().as_str() {
            "1" | "true" | "t" | "yes" | "y" | "on" => Ok(true),
            "0" | "false" | "f" | "no" | "n" | "off" => Ok(false),
            _ => Err(format!("{name}: valor booleano inválido: {v:?}")),
        },
    }
}

fn parse_num<T: std::str::FromStr>(g: Getter, name: &str, default: T) -> Result<T, String> {
    match g(name) {
        None => Ok(default),
        Some(v) => v
            .trim()
            .parse::<T>()
            .map_err(|_| format!("{name}: valor numérico inválido: {v:?}")),
    }
}

impl Settings {
    /// Carga `.env` del directorio de trabajo (las variables del proceso tienen precedencia).
    pub fn load() -> Result<Settings, String> {
        let _ = dotenvy::from_filename(".env");
        Self::from_env()
    }

    pub fn from_env() -> Result<Settings, String> {
        Self::from_env_map(&|k| env::var(k).ok())
    }

    /// Construye la configuración desde un lector de variables (permite probar sin tocar el entorno).
    pub fn from_env_map(g: Getter) -> Result<Settings, String> {
        let raw_url = s(
            g,
            "DATABASE_URL",
            "mysql://refleja:refleja@127.0.0.1:3306/refleja",
        );
        let database_url = normalize_db_url(&raw_url)?;
        let st = Settings {
            env: s(g, "ENV", "development"),
            app_host: s(g, "APP_HOST", "127.0.0.1"),
            app_port: parse_num(g, "APP_PORT", 20832u16)?,
            database_url,
            db_max_connections: parse_num(g, "DB_MAX_CONNECTIONS", 10u32)?,
            cors_origins: s(
                g,
                "CORS_ORIGINS",
                "https://refleja.org,https://www.refleja.org,http://localhost:8788,http://127.0.0.1:8788,http://localhost:8080,http://127.0.0.1:8080",
            ),
            jwt_secret: s(g, "JWT_SECRET", DEFAULT_SECRETS[0].1),
            public_token_secret: s(g, "PUBLIC_TOKEN_SECRET", DEFAULT_SECRETS[1].1),
            vid_hmac_key: s(g, "VID_HMAC_KEY", DEFAULT_SECRETS[2].1),
            access_token_ttl_min: parse_num(g, "ACCESS_TOKEN_TTL_MIN", 15)?,
            refresh_token_ttl_days: parse_num(g, "REFRESH_TOKEN_TTL_DAYS", 7)?,
            public_token_ttl_days: parse_num(g, "PUBLIC_TOKEN_TTL_DAYS", 30)?,
            turnstile_secret_login: s(g, "TURNSTILE_SECRET_LOGIN", ""),
            turnstile_secret_invisible: s(g, "TURNSTILE_SECRET_INVISIBLE", ""),
            turnstile_verify_url: s(g, "TURNSTILE_VERIFY_URL", "https://challenges.cloudflare.com/turnstile/v0/siteverify"),
            dev_bypass_turnstile: parse_bool(g, "DEV_BYPASS_TURNSTILE", false)?,
            cookie_domain: s(g, "COOKIE_DOMAIN", ""),
            cookie_secure: parse_bool(g, "COOKIE_SECURE", false)?,
            cookie_samesite: s(g, "COOKIE_SAMESITE", "lax"),
            refresh_cookie_name: s(g, "REFRESH_COOKIE_NAME", "refleja_rt"),
            origin_secret: s(g, "ORIGIN_SECRET", ""),
            origin_secret_header: s(g, "ORIGIN_SECRET_HEADER", "X-Origin-Secret"),
            formulario_path: s(g, "FORMULARIO_PATH", ""),
            collect_rate_per_min: parse_num(g, "COLLECT_RATE_PER_MIN", 120)?,
            session_rate_per_min: parse_num(g, "SESSION_RATE_PER_MIN", 30)?,
            ping_rate_per_min: parse_num(g, "PING_RATE_PER_MIN", 30)?,
            public_max_events: parse_num(g, "PUBLIC_MAX_EVENTS", 2000)?,
            public_max_runs: parse_num(g, "PUBLIC_MAX_RUNS", 20)?,
            public_max_actions: parse_num(g, "PUBLIC_MAX_ACTIONS", 300)?,
            argon_concurrency: parse_num(g, "ARGON2_CONCURRENCY", 1usize)?,
        };
        st.fail_closed()?;
        Ok(st)
    }

    /// En producción no se permite arrancar con secretos por defecto o débiles.
    fn fail_closed(&self) -> Result<(), String> {
        if self.is_prod() {
            let vals = [
                &self.jwt_secret,
                &self.public_token_secret,
                &self.vid_hmac_key,
            ];
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
        self.cors_origins
            .split(',')
            .map(|o| o.trim().to_string())
            .filter(|o| !o.is_empty())
            .collect()
    }

    /// Nunca se ignora Turnstile en producción.
    pub fn bypass_turnstile(&self) -> bool {
        self.dev_bypass_turnstile && !self.is_prod()
    }

    pub fn cookie_secure_effective(&self) -> bool {
        self.cookie_secure || self.is_prod()
    }
}

/// Acepta `mysql://` y el formato del backend Python (`mysql+pymysql://`); rechaza SQLite.
pub fn normalize_db_url(raw: &str) -> Result<String, String> {
    if raw.starts_with("sqlite") {
        return Err("DATABASE_URL: SQLite no está soportado por el backend Rust; usa mysql://usuario:pass@host:3306/base".into());
    }
    Ok(raw.replacen("mysql+pymysql://", "mysql://", 1))
}

/// `Debug` deliberadamente parcial: nunca imprime secretos ni la URL de la base de datos.
impl std::fmt::Debug for Settings {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Settings")
            .field("env", &self.env)
            .field("app_host", &self.app_host)
            .field("app_port", &self.app_port)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(env: &str, jwt: &str) -> Settings {
        let mut s = Settings::from_env_map(&|k| match k {
            "ENV" => Some(env.to_string()),
            "JWT_SECRET" => Some(jwt.to_string()),
            "PUBLIC_TOKEN_SECRET" => Some("p".repeat(40)),
            "VID_HMAC_KEY" => Some("v".repeat(40)),
            _ => None,
        })
        .unwrap_or_else(|e| panic!("{e}"));
        s.env = env.to_string();
        s
    }

    #[test]
    fn db_url_translation() {
        assert_eq!(
            normalize_db_url("mysql+pymysql://u:p@h:3306/d?charset=utf8mb4").unwrap(),
            "mysql://u:p@h:3306/d?charset=utf8mb4"
        );
        assert_eq!(normalize_db_url("mysql://u@h/d").unwrap(), "mysql://u@h/d");
        assert!(normalize_db_url("sqlite:///x.db").is_err());
    }

    #[test]
    fn prod_flags() {
        let p = settings("Production", &"j".repeat(40));
        assert!(p.is_prod() && p.cookie_secure_effective());
        assert!(!settings("development", "x").is_prod());
    }

    #[test]
    fn fail_closed_prod() {
        let get = |env: &'static str, jwt: String| {
            Settings::from_env_map(&move |k| match k {
                "ENV" => Some(env.to_string()),
                "JWT_SECRET" => Some(jwt.clone()),
                "PUBLIC_TOKEN_SECRET" => Some("p".repeat(32)),
                "VID_HMAC_KEY" => Some("v".repeat(32)),
                _ => None,
            })
        };
        assert!(get("production", "j".repeat(31))
            .unwrap_err()
            .contains("JWT_SECRET"));
        assert!(get("prod", "cambia-esto-en-produccion-jwt".into()).is_err());
        assert!(get("production", "j".repeat(32)).is_ok());
        assert!(get("development", "corto".into()).is_ok());
    }

    #[test]
    fn bypass_never_in_prod() {
        let mk = |env: &'static str| {
            Settings::from_env_map(&move |k| match k {
                "ENV" => Some(env.to_string()),
                "DEV_BYPASS_TURNSTILE" => Some("yes".into()),
                "JWT_SECRET" | "PUBLIC_TOKEN_SECRET" | "VID_HMAC_KEY" => Some("s".repeat(40)),
                _ => None,
            })
            .unwrap()
        };
        assert!(mk("development").bypass_turnstile());
        assert!(!mk("production").bypass_turnstile());
    }

    #[test]
    fn cors_list_trims() {
        let s = Settings::from_env_map(&|k| {
            (k == "CORS_ORIGINS").then(|| " https://a.org , ,https://b.org,".to_string())
        })
        .unwrap();
        assert_eq!(s.cors_list(), vec!["https://a.org", "https://b.org"]);
    }

    #[test]
    fn bool_parsing() {
        let b = |v: &'static str| {
            Settings::from_env_map(&move |k| (k == "COOKIE_SECURE").then(|| v.to_string()))
        };
        assert!(
            b("TRUE").unwrap().cookie_secure
                && b("on").unwrap().cookie_secure
                && !b("0").unwrap().cookie_secure
        );
        assert!(b("quizas").is_err());
    }
}
