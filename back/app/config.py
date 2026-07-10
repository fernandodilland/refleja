"""Configuración de la aplicación, cargada desde variables de entorno / .env."""
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_SECRETS = {
    "JWT_SECRET": "cambia-esto-en-produccion-jwt",
    "PUBLIC_TOKEN_SECRET": "cambia-esto-en-produccion-public",
    "VID_HMAC_KEY": "cambia-esto-en-produccion-hmac",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Entorno / servidor ---
    ENV: str = "development"  # "development" | "production"
    APP_HOST: str = "127.0.0.1"
    APP_PORT: int = 20832

    # --- Base de datos ---
    # Dev local: SQLite (cero configuración).
    # Producción: mysql+pymysql://usuario:pass@127.0.0.1:3306/refleja
    DATABASE_URL: str = "sqlite:///./refleja_dev.db"

    # --- CORS (orígenes del front, separados por coma) ---
    CORS_ORIGINS: str = (
        "https://refleja.org,https://www.refleja.org,"
        "http://localhost:8788,http://127.0.0.1:8788,"
        "http://localhost:8080,http://127.0.0.1:8080"
    )

    # --- Secretos de firma (¡obligatorio cambiarlos en producción!) ---
    JWT_SECRET: str = "cambia-esto-en-produccion-jwt"
    PUBLIC_TOKEN_SECRET: str = "cambia-esto-en-produccion-public"
    VID_HMAC_KEY: str = "cambia-esto-en-produccion-hmac"

    # --- Tiempos de vida de tokens ---
    ACCESS_TOKEN_TTL_MIN: int = 15
    REFRESH_TOKEN_TTL_DAYS: int = 7
    PUBLIC_TOKEN_TTL_DAYS: int = 30

    # --- Cloudflare Turnstile ---
    # Managed (login /acceso)
    TURNSTILE_SECRET_LOGIN: str = ""
    # Invisible (sitio público -> token estadístico)
    TURNSTILE_SECRET_INVISIBLE: str = ""
    TURNSTILE_VERIFY_URL: str = (
        "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    )
    # Solo se respeta si ENV=development. Permite probar sin resolver Turnstile.
    DEV_BYPASS_TURNSTILE: bool = False

    # --- Cookies (refresh token del admin) ---
    COOKIE_DOMAIN: str = ""          # prod: ".refleja.org"
    COOKIE_SECURE: bool = False      # prod: True
    COOKIE_SAMESITE: str = "lax"     # prod cross-site: "none"
    REFRESH_COOKIE_NAME: str = "refleja_rt"

    # --- Blindaje de origen (opcional; CloudPanel ya limita a Cloudflare) ---
    # Si ORIGIN_SECRET != "", se exige el header en todas las rutas /api.
    ORIGIN_SECRET: str = ""
    ORIGIN_SECRET_HEADER: str = "X-Origin-Secret"

    # --- Validación del formulario ---
    # Ruta a formulario.json (fuente de verdad de qids/flujos). Vacío = autodetectar
    # front/src/formulario.json junto al repo.
    FORMULARIO_PATH: str = ""

    # --- Anti-abuso ---
    COLLECT_RATE_PER_MIN: int = 120  # peticiones/min por token estadístico (ráfaga)
    SESSION_RATE_PER_MIN: int = 30   # emisiones de token/min por IP
    PING_RATE_PER_MIN: int = 10      # señales de vida/min por token (el front manda ~2.4/min)
    # Cuotas de POR VIDA por token/visitante (persistidas). Acotan el impacto de
    # un token válido abusivo sin saturar la BD.
    PUBLIC_MAX_EVENTS: int = 2000    # eventos totales aceptados por token (techo duro)
    PUBLIC_MAX_RUNS: int = 20        # intentos de formulario por token (acota form_run y completaciones)
    PUBLIC_MAX_ACTIONS: int = 300    # eventos globales (page_view/urgente/ocultar/reinicio/directorio) por token

    @property
    def is_prod(self) -> bool:
        return self.ENV.lower().startswith("prod")

    @model_validator(mode="after")
    def _fail_closed_in_prod(self) -> "Settings":
        """En producción no se permite arrancar con secretos por defecto/débiles."""
        if self.is_prod:
            for name, default in _DEFAULT_SECRETS.items():
                val = getattr(self, name)
                if val == default or len(val) < 32:
                    raise ValueError(
                        f"{name} debe definirse con un valor seguro (>=32 chars) "
                        "en producción. Genera uno con: openssl rand -hex 48"
                    )
        return self

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def bypass_turnstile(self) -> bool:
        # Nunca se ignora Turnstile en producción, pase lo que pase.
        return self.DEV_BYPASS_TURNSTILE and not self.is_prod


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
