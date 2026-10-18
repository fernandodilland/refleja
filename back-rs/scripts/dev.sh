#!/usr/bin/env bash
# Desarrollo "cero configuración" (equivalente a `python -m app.seed` + uvicorn del backend Python):
#   1) arranca MariaDB local efímera  2) crea/actualiza el esquema  3) crea un admin de DESARROLLO
#   4) corre la API en 127.0.0.1:20832 con ENV=development y DEV_BYPASS_TURNSTILE=true.
# Admin local (solo esta BD de desarrollo): usuario `admin`, contraseña `admin-dev-local`.
set -euo pipefail
D="$(cd "$(dirname "$0")/.." && pwd)"; cd "$D"
"$D/scripts/mariadb_local.sh" start
"$D/scripts/apply_schema.sh" refleja_dev
export ENV=development DEV_BYPASS_TURNSTILE=true APP_PORT="${APP_PORT:-20832}"
export DATABASE_URL="mysql://refleja:dev_only_pw@127.0.0.1:${MDB_PORT:-33306}/refleja_dev"
REFLEJA_ADMIN_PASSWORD="${DEV_ADMIN_PASSWORD:-admin-dev-local}" cargo run --release --bin refleja-admin -- create-admin --username "${DEV_ADMIN_USER:-admin}"
exec cargo run --release --bin refleja-api
