# 06 · Ejecución, configuración, despliegue y observabilidad

## 1. Cómo se ejecuta hoy
| Entorno | Cómo | Evidencia |
|---|---|---|
| Local | `cd back && python3.10 -m venv .venv && pip install -r requirements.txt && python -m app.seed && uvicorn app.main:app --host 127.0.0.1 --port 20832 --reload` (VS Code: tareas `back: …` y `Refleja: front + back (local)`) | `back/README.md:31-45`, `.vscode/tasks.json` |
| Producción | systemd `refleja-api.service`: usuario/grupo `refleja-api`, `WorkingDirectory=/home/refleja-api/htdocs/api.refleja.org/back`, `ExecStart=…/venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 20832 --workers 2`, `Restart=always` (3 s), `NoNewPrivileges=true`, logs a journald | `back/deploy/refleja-api.service` |
| Proxy | CloudPanel "Reverse Proxy" `api.refleja.org` → `http://127.0.0.1:20832`; DNS proxied por Cloudflare | `back/README.md:107-116` |
| Front | `npx wrangler deploy` / Workers Builds (watch path `front/*`); autodetecta API: en `*.refleja.org` → `https://api.refleja.org/api`, en local `http://<host>:20832/api` | `front/src/auth-common.js:11-14`, `analytics.js:22`, `README.md:85,103` |

**Contrato de puerto/interfaz:** escuchar en `127.0.0.1:20832` (el front local y CloudPanel dependen de ello). Valores en `APP_HOST`/`APP_PORT` **declarados pero no usados por uvicorn**: el puerto lo fija `ExecStart` (`--host/--port`), `APP_PORT` solo se imprime en el log `[CONFIRMADO]`. En Rust conviene respetar `APP_HOST`/`APP_PORT` (ADR-005).

## 2. Variables de entorno (nombres; sin valores)
Carga: `pydantic-settings` lee `.env` del **directorio de trabajo** y las variables del proceso (las del proceso tienen precedencia); `extra="ignore"`. Booleanos aceptan los formatos de Pydantic (`true/false/1/0/yes/no/on/off`, sin distinguir mayúsculas) `[INFERIDO]` → caso de prueba.

| Variable | Obligatoria | Default | Propósito |
|---|---|---|---|
| `ENV` | no | `development` | `prod*` activa fail-closed, oculta docs, fuerza `Secure` y desactiva bypass |
| `APP_HOST`, `APP_PORT` | no | `127.0.0.1`, `20832` | Solo informativo hoy |
| `DATABASE_URL` | prod sí | `sqlite:///./refleja_dev.db` | `mysql+pymysql://user:pass@host:3306/refleja?charset=utf8mb4` |
| `CORS_ORIGINS` | no | refleja.org, www, localhost/127.0.0.1:8788 y :8080 | lista separada por comas |
| `JWT_SECRET`, `PUBLIC_TOKEN_SECRET`, `VID_HMAC_KEY` | **prod sí (≥32)** | valores de relleno | Firma access/refresh, firma token público, HMAC del `vid` |
| `ACCESS_TOKEN_TTL_MIN`, `REFRESH_TOKEN_TTL_DAYS`, `PUBLIC_TOKEN_TTL_DAYS` | no | 15, 7, 30 | Vidas de token |
| `TURNSTILE_SECRET_LOGIN`, `TURNSTILE_SECRET_INVISIBLE` | prod sí | `""` | Secretos Turnstile |
| `TURNSTILE_VERIFY_URL` | no | URL oficial | override (pruebas) |
| `DEV_BYPASS_TURNSTILE` | no | `false` | solo con `ENV≠prod` |
| `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAMESITE`, `REFRESH_COOKIE_NAME` | no | `""`, `false`, `lax`, `refleja_rt` | Cookie de refresh |
| `ORIGIN_SECRET`, `ORIGIN_SECRET_HEADER` | no | `""`, `X-Origin-Secret` | Guard de origen |
| `FORMULARIO_PATH` | no | autodetecta `front/src/formulario.json` | Fuente de qids |
| `COLLECT_RATE_PER_MIN`, `SESSION_RATE_PER_MIN`, `PING_RATE_PER_MIN` | no | 120, 30, 30 | Rate limits |
| `PUBLIC_MAX_EVENTS`, `PUBLIC_MAX_RUNS`, `PUBLIC_MAX_ACTIONS` | no | 2000, 20, 300 | Cuotas por token |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` | solo seed dev | `admin`/`admin` | `app/seed.py` |

`.env.example` solo lista un subconjunto (omite `FORMULARIO_PATH`, `*_RATE_*`, `PUBLIC_MAX_*`, `TURNSTILE_VERIFY_URL`, `REFRESH_COOKIE_NAME`) `[CONFIRMADO]`.
**Requisito de migración:** el binario Rust debe aceptar **los mismos nombres** para poder reutilizar el `.env` de producción sin cambios (el formato `DATABASE_URL` será `mysql+pymysql://` → decisión ADR-005: aceptar y traducir, o nuevo nombre).

## 3. Despliegue actual (`back/deploy.sh`)
1. Valida comandos (`git curl python3.10 sudo`) y permisos `sudo -n systemctl show …` (sudoers `back/deploy/refleja-api.sudoers`).
2. `git fetch` + **`git reset --hard origin/main`** en la raíz del repo del servidor (el back es subcarpeta).
3. Construye `venv.new`, `pip install -r requirements.txt`, *swap* atómico de venv.
4. `systemctl restart refleja-api.service` (único downtime) → healthcheck `GET http://127.0.0.1:<puerto>/api/health` (30 intentos × 1 s) donde el puerto se detecta del `ExecStart` con `sed` sobre `--port`.
5. Fallo ⇒ rollback de venv **y** `git reset --hard <PREV_REV>` + restart; imprime `systemctl status` y `journalctl`.
**Implicaciones para Rust:** el parseo de `--port` desde `ExecStart` fallaría si el puerto va en `.env` o con otro flag; el rollback de código implica recompilar o conservar el binario anterior; sudoers permite exactamente `restart/start/stop/status/show/journalctl` de ese servicio.
**Migraciones BD en el despliegue:** ninguna (solo las *light migrations* al arrancar la app).
**Rollback BD:** inexistente (las migraciones son aditivas).

## 4. Observabilidad
Logs: stdout/stderr → journald (`journalctl -u refleja-api.service`), nivel INFO, formato por defecto de `logging`/uvicorn (línea de acceso por petición). Sin métricas, sin tracing, sin alertas, sin Sentry `[CONFIRMADO]`. Health: `/api/health` (no comprueba BD). Backups/restauración de MariaDB: `[DESCONOCIDO]` (gestionado por CloudPanel/propietario → Q-10).

## 5. Diferencias entre entornos
| Aspecto | Dev | Prod |
|---|---|---|
| BD | SQLite, `create_all` crea todo | MariaDB, `seed.sql` + `create_all` (tablas faltantes) + `ALTER … IF NOT EXISTS` |
| Turnstile | `dev-bypass` posible | siempre real |
| Docs `/api/docs` | sí | no |
| Cookie `Secure` | opcional | forzada |
| Workers | 1 (`--reload`) | 2 |
| Secretos | por defecto permitidos | ≥32 chars obligatorios |
| IP/país | sin cabeceras CF | cabeceras de Cloudflare |

## 6. Requisitos de compilación para Rust (propuestos, pendientes de ADR)
- Toolchain en máquina de desarrollo: rustc/cargo 1.99.1 (verificado). Servidor de producción: `[DESCONOCIDO]` (distribución, glibc, ¿hay compilador?) → ADR-003 (compilar en CI/local y subir binario vs. compilar en servidor) y Q-11.
- Si el binario se compila fuera, usar `x86_64-unknown-linux-gnu`/`musl` según la distro del servidor `[DESCONOCIDO]`.
- `formulario.json` y `.env` deben estar disponibles en la ruta que espera el proceso o embebidos (ADR-013).
