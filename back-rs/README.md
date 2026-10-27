# Refleja · API (Rust) — `back-rs/`

Backend productivo de `api.refleja.org` (Rust + Axum + Tokio + SQLx/MariaDB). Reescritura del FastAPI de `../back/` con el mismo contrato HTTP, mismos efectos en MariaDB y mismas variables de entorno. Contratos, endpoints, datos, seguridad y decisiones: [`../docs/migration/README.md`](../docs/migration/README.md).

<!-- aviso-historico:inicio (flujo-pc-docs.py) -->
> **Ojo (oct 2026):** este back está en producción desde el 18 oct; donde diga «no desplegado», es de antes. Manda el bloque «Flujo PC» de [`AGENTS.md`](../AGENTS.md).
<!-- aviso-historico:fin -->

<!-- Consolidado 2026-10-27 de: back-rs/README, back-rs/despliegue/README, back/README (Python). Formato denso para LLM. -->

## Resumen
| | |
|---|---|
| Rutas (15) | `/api/health`, `/api/public/{session,ping,collect}`, `/api/auth/{login,refresh,logout,me}`, `/api/platform/{overview,realtime,funnel,violence,municipios,logins,timeseries}` (+ `/api/docs`, `/api/openapi.json` solo `ENV`≠prod) |
| BD | MariaDB (SQLx, sin SQLite). Esquema `migrations/0001_baseline.sql`; el servicio **no ejecuta DDL**, solo verifica contra `migrations/expected_schema.txt` |
| Escucha | `APP_HOST:APP_PORT` (def. `127.0.0.1:20832`; **prod 20834** fijado por la unidad systemd) |
| Secretos | solo `.env` (ignorado por git); plantilla `.env.example`; variables completas en `../docs/migration/README.md` §7 |
| Privacidad | sin IP, sin PII: visitante = HMAC-SHA256 de id aleatorio de 128 bit; solo país (`CF-IPCountry`); log de acceso sin IP/cabeceras/cuerpos |
| Tablas (8) | `admin_user, admin_session, visitor, form_run, question_stat, daily_metric, admin_login, event_counter` |

## Flujo normal (PC Debian, usuario `dev`; manda `../AGENTS.md`)
`dev contexto` → `dev probar refleja` (gate) → `dev compilar refleja` → commit+push → `dev desplegar refleja --simulacro` y luego `dev desplegar refleja` (solo si el dueño lo pide). Revertir: `dev revertir refleja`; respaldo previo a migrar a mano: `dev respaldar refleja`. Datos reales sin tocar prod: `dev copia refleja sql -e "SELECT …"`, `dev ensayar refleja archivo.sql`. Por dentro: `scripts/mariadb_local.sh start` + `scripts/compilar.sh` → `dist/refleja-api-rs-<id>.tar.gz` → `desplegar-paquete refleja <paquete>` / `desplegar-paquete revertir refleja` (el servidor guarda 1 release: la 1ª reversa no tiene destino). Front: push a `main` (Workers Builds).
**No usar** (son de la Mac + root): `../desplegar.sh`, `scripts/desplegar.sh`, `scripts/dia-d.sh`, `npx wrangler deploy` a mano, `ssh hivelocity`.

## Desarrollo local
Requiere Rust estable y MariaDB local (sin Docker).
```bash
cd back-rs
scripts/dev.sh                          # atajo: MariaDB local + esquema + admin dev (admin / admin-dev-local) + API en 127.0.0.1:20832 con /api/docs
# paso a paso:
scripts/mariadb_local.sh start          # MariaDB efímera 127.0.0.1:33306 ($TMPDIR/refleja-mariadb)
scripts/apply_schema.sh refleja_dev     # crea BD y aplica migrations/0001_baseline.sql
cp .env.example .env                    # ENV=development DATABASE_URL=mysql://refleja:dev_only_pw@127.0.0.1:33306/refleja_dev DEV_BYPASS_TURNSTILE=true (token mágico `dev-bypass`, nunca en prod)
cargo run --release                     # 127.0.0.1:20832 (el front local ya apunta ahí)
```
Todo el sitio (VS Code, F5 «Refleja: front + back (local)»): front `http://localhost:8788` (wrangler dev) + back `:20832`; el front detecta entorno (`*.refleja.org` → `https://api.refleja.org/api`, local → `localhost:20832`). Admin nuevo (contraseña por env o stdin, nunca argumento):
```bash
REFLEJA_ADMIN_PASSWORD='…' cargo run --release --bin refleja-admin -- create-admin --username miusuario
printf '%s' 'pw' | cargo run --release --bin refleja-admin -- hash-password    # imprime hash Argon2id
```
Limpieza: `cargo clean`; `scripts/mariadb_local.sh stop && rm -rf "${TMPDIR:-/tmp}/refleja-mariadb"`.

## Verificación (lo que corre `compilar.sh`; `--rapido` omite los gates)
```bash
cargo fmt --check && cargo clippy --release --all-targets -- -D warnings
cargo audit                              # excepción justificada en .cargo/audit.toml
cargo test --release                     # unitarias + vectores generados con Python (PyJWT, argon2-cffi, analytics.py)
cargo build --release && RS_PROFILE=release python3 tests/contract/diff.py
```
`tests/contract/diff.py` levanta Python y Rust contra dos MariaDB idénticas: ~230 peticiones (validación, CORS, auth, rotación/reuso de refresh, cuotas, panel, modo producción, `ORIGIN_SECRET`, fail-closed), compara respuestas y las 8 tablas, y prueba que tokens/sesiones son intercambiables Python↔Rust. Necesita `../back/.venv` (Python 3.10). Benchmark: `RS_PROFILE=release python3 bench/bench.py` (resultados en `../docs/migration/README.md` §9). `compilar.sh`: `cargo zigbuild` (glibc 2.35), SHA-256 en el paquete, compila fuera del repo (`~/.cache/refleja-rs-target`, 3 hilos; `--limpiar`/`scripts/limpiar.sh` lo borra). En macOS solo: `--no-mac-metadata` de tar.

## Producción (Hivelocity, CloudPanel)
**Estado:** en producción desde 2026-10-18 (primer release `1.0.0-20261018190542-1f8a3c1`). Python instalado pero apagado, deshabilitado y bloqueado.
| Qué | Dónde |
|---|---|
| Repo (Python + front + `.env` + `formulario.json`) | `/home/refleja-api/htdocs/api.refleja.org` (`back/.env`, `front/src/formulario.json`); todo dentro de `htdocs` ⇒ entra en los respaldos del sitio |
| Releases Rust | `…/api.refleja.org/back-rs/prod/releases/<versión>-<fecha>-<commit>/bin/{refleja-api,refleja-admin}` |
| Release activa | enlace `…/back-rs/prod/actual` (cambio atómico); instalador en `…/back-rs/prod/instalar-en-servidor.sh` |
| Unidad | `refleja-api-rs.service` (usuario `refleja-api`, `WorkingDirectory=…/back`, `MemoryMax=256M`); plantilla `despliegue/systemd/` |
| Puerto | `127.0.0.1:20834` (CloudPanel → Reverse Proxy `api.refleja.org` → App Port); 20832 queda libre para Python |
| Config | **la misma `back/.env`** del Python (no se copia ni modifica); el puerto lo fija la unidad (`APP_PORT=20834`) |
`back-rs/prod/` y `back-rs/dist/` están en `.gitignore` (el `git reset --hard` del `back/deploy.sh` Python no los toca). CloudPanel ya limita el origen a Cloudflare ⇒ `ORIGIN_SECRET` vacío; Cloudflare: `api.refleja.org` proxied (naranja); Turnstile: `refleja.org` y `www` en hostnames de cada widget.

**Instalador (root, servidor):** (1) comprueba SHA-256, usuario, `back/.env`, `front/src/formulario.json` y que el puerto no sea 20832; (2) copia binario a `releases/<id>` (`root:refleja-api`, 0750); (3) valida como `refleja-api` con `refleja-api --check` (config + conexión + esquema; si falla no cambia nada); (4) actualiza solo `refleja-api-rs.service`; (5) cambia el enlace `actual` y reinicia; (6) healthcheck `GET http://127.0.0.1:20834/api/health` (envía `ORIGIN_SECRET` si está en `.env`); si falla vuelve a la release anterior (o para la unidad Rust y deja Python como estaba). Nunca toca la unidad del Python, CloudPanel/nginx, el `.env` ni el esquema. Servidor requerido: x86_64, glibc ≥ 2.35.

**Esquema:** si el de producción difiere (p. ej. falta `event_counter`, que antes creaba `create_all` del Python) `--check` falla y no se despliega; `migrations/0001_baseline.sql` (idempotente) se aplica a mano con `mariadb` solo si hace falta (antes `dev ensayar refleja` contra la copia local, y `dev respaldar refleja`). Migración nueva: solo agregar (expand→contract).

**Histórico (Mac, ya no se usa):** `./desplegar.sh {simulacro|dia-d|back|revertir|deshacer|verificar}` → `scripts/{compilar,desplegar,dia-d,limpiar}.sh`, `despliegue/despliegue.conf(.ejemplo)`; requería `rustup target add x86_64-unknown-linux-gnu`, `zig`, `cargo-zigbuild`, alias SSH root `hivelocity`. `dia-d.sh` apagó Python con drop-in `90-apagado-por-rust.conf` y `deshacer` lo arrancaba en 20834 con `91-puerto-del-rust.conf`. Detalle del corte: `../docs/migration/README.md` §11.

**Mapa de Sistemas** (`sistema.fernandodilland.com/sistemas#mapa`): se actualiza a mano tras cambios de despliegue (ningún script); ya refleja Rust vivo y Python obsoleto.

## Legado Python (`../back/`, apagado; oráculo del arnés de paridad)
FastAPI 0.115 / Python 3.10, `127.0.0.1:20832`, `--workers 2`, dev con SQLite. Funcionalidad: `POST /api/public/session` (Turnstile invisible → JWT estadístico 30 d), `POST /api/public/collect` (header `X-Refleja-Token`), login admin (Argon2id + Turnstile managed → access 15 min + refresh cookie httpOnly rotable), panel `/api/platform/*`. Despliegue Python (histórico): CloudPanel BD `refleja` + usuario; `seed.sql`+`migration.sql` confidenciales (en `.gitignore`; plantilla `seed.example.sql`); `.env` con `ENV=production`, `DATABASE_URL=mysql+pymysql://…?charset=utf8mb4`, secretos ≥32 (`openssl rand -hex 48/48/32`), `COOKIE_SECURE=true`; `back/deploy.sh` + `back/deploy/refleja-api.service`/sudoers. Dev: `cd back && python3.10 -m venv .venv && ./.venv/bin/python -m pip install -r requirements.txt && ./.venv/bin/python -m app.seed && ./.venv/bin/python -m uvicorn app.main:app --port 20832 --reload` (admin dev `admin/admin`, docs `/api/docs`). Seguridad (vigente también en Rust): secretos Turnstile solo en `.env`; rotar los que se hayan compartido en texto plano; refresh con detección de reuso (revoca toda la familia); rate-limit en memoria por proceso (Redis solo si hiciera falta exactitud global); token estadístico = capacidad sin PII en `localStorage`, no revocable individualmente: ante incidente rotar `PUBLIC_TOKEN_SECRET`. Retirar `back/` = TASK-0050 (solo con autorización del dueño).
