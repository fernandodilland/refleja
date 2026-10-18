# Refleja · API (Rust)

Reescritura en **Rust + Axum + Tokio** del backend FastAPI (`../back/`). Mismo contrato HTTP, mismos
efectos en MariaDB, mismas variables de entorno. Documentación completa de la migración en
[`../docs/migration/`](../docs/migration/README.md).

| | |
|---|---|
| Rutas | 15 (`/api/health`, `/api/public/{session,ping,collect}`, `/api/auth/{login,refresh,logout,me}`, `/api/platform/{overview,realtime,funnel,violence,municipios,logins,timeseries}`) |
| Base de datos | MariaDB (SQLx, sin SQLite). Esquema: `migrations/0001_baseline.sql` (no se ejecuta DDL al arrancar; el servicio solo **verifica** el esquema) |
| Escucha | `APP_HOST:APP_PORT` (por defecto `127.0.0.1:20832`, igual que el backend Python) |
| Secretos | Solo en `.env` (ignorado por git). Plantilla: `.env.example` |

## Desarrollo local (macOS/Linux)

Atajo cero configuración (equivale a `python -m app.seed` + uvicorn): `back-rs/scripts/dev.sh` — arranca MariaDB local, aplica el esquema, crea el admin de desarrollo (`admin` / `admin-dev-local`) y sirve la API en `127.0.0.1:20832` con `/api/docs` disponible (solo `ENV` ≠ producción). Paso a paso:

Requiere Rust estable (`cargo`) y MariaDB local. Sin Docker:

```bash
cd back-rs
scripts/mariadb_local.sh start            # MariaDB efímera en 127.0.0.1:33306 (datos en $TMPDIR/refleja-mariadb)
scripts/apply_schema.sh refleja_dev       # crea la BD y aplica migrations/0001_baseline.sql
cp .env.example .env                      # y ajusta: ENV=development, DATABASE_URL=mysql://refleja:dev_only_pw@127.0.0.1:33306/refleja_dev, DEV_BYPASS_TURNSTILE=true
cargo run --release                       # arranca en 127.0.0.1:20832 (el front local ya apunta ahí)
```

Crear un administrador (la contraseña se lee de la variable o de stdin, **nunca** como argumento):

```bash
REFLEJA_ADMIN_PASSWORD='una-contraseña-larga' cargo run --release --bin refleja-admin -- create-admin --username miusuario
printf '%s' 'contraseña' | cargo run --release --bin refleja-admin -- hash-password     # imprime el hash Argon2id
```

## Verificación

```bash
cargo fmt --check && cargo clippy --release --all-targets -- -D warnings
cargo audit                                # dependencias (excepción justificada en .cargo/audit.toml)
cargo test --release                       # unitarias + vectores generados con Python (PyJWT, argon2-cffi, analytics.py)
cargo build --release && RS_PROFILE=release python3 tests/contract/diff.py
```

`tests/contract/diff.py` levanta **Python y Rust** contra dos bases MariaDB idénticas, ejecuta ~230 peticiones
(validación, CORS, auth, rotación/reuso de refresh, cuotas, panel, modo producción, `ORIGIN_SECRET`, fail-closed) y
compara respuestas y estado final de las tablas; además prueba que **tokens y sesiones son intercambiables** entre
ambos backends (requisito para un cutover sin cerrar sesiones). Necesita `../back/.venv` (Python 3.10).

Benchmark de memoria/latencia: `RS_PROFILE=release python3 bench/bench.py` (ver `../docs/migration/evidence/`).

## Despliegue

Ver [`despliegue/README.md`](despliegue/README.md) y, desde la raíz del repo, `./desplegar.sh` (patrón de sistema.fernandodilland / correo.fractory.mx: compila en la Mac, sube el paquete, el servidor no tiene Rust). Puerto de producción **20834**. **No se ha desplegado a producción.**

## Limpieza (liberar disco/RAM del equipo)

```bash
cargo clean                                # borra target/ (cientos de MB)
scripts/mariadb_local.sh stop && rm -rf "${TMPDIR:-/tmp}/refleja-mariadb"
```
