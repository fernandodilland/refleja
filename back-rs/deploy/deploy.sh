#!/usr/bin/env bash
set -Eeuo pipefail
# =====================================================================
#  Refleja API (Rust) · despliegue con swap atómico del binario + healthcheck + rollback
#  Uso (como usuario del servicio, en el servidor):
#     BINARY=/ruta/al/refleja-api  back-rs/deploy/deploy.sh      # binario ya compilado (recomendado)
#     BUILD=1                      back-rs/deploy/deploy.sh      # compila en el servidor (requiere cargo; usa mucha RAM)
#  NO se ha ejecutado contra un servidor real: ensáyalo primero (ver deploy/README.md).
# =====================================================================
SERVICE_NAME="${SERVICE_NAME:-refleja-api-rs.service}"
BRANCH="${BRANCH:-main}"; REMOTE="${REMOTE:-origin}"
UPDATE_REPO="${UPDATE_REPO:-1}"          # actualiza formulario.json y fuentes con git
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"; HEALTH_SLEEP_SECONDS="${HEALTH_SLEEP_SECONDS:-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"          # .../back-rs
BIN_DIR="$APP_DIR/bin"; BIN="$BIN_DIR/refleja-api"; BIN_NEW="$BIN.new"; BIN_PREV="$BIN.prev"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
run_privileged() { if [[ "${EUID}" -eq 0 ]]; then "$@"; else sudo -n "$@"; fi; }

on_error() { local c=$?; log "ERROR: despliegue falló (exit=$c). Tip: sudo journalctl -u ${SERVICE_NAME} -n 120 --no-pager"; exit "$c"; }
trap on_error ERR

# Lee una variable del .env SIN imprimir valores sensibles
env_get() { [[ -f "$APP_DIR/.env" ]] && grep -E "^$1=" "$APP_DIR/.env" | tail -n1 | cut -d= -f2- | tr -d '\r' || true; }
APP_PORT="${APP_PORT:-$(env_get APP_PORT)}"; APP_PORT="${APP_PORT:-20832}"
APP_HOST="${APP_HOST:-$(env_get APP_HOST)}"; APP_HOST="${APP_HOST:-127.0.0.1}"
ORIGIN_SECRET_VAL="$(env_get ORIGIN_SECRET)"; ORIGIN_HDR="$(env_get ORIGIN_SECRET_HEADER)"; ORIGIN_HDR="${ORIGIN_HDR:-X-Origin-Secret}"
HEALTH_URL="${HEALTH_URL:-http://${APP_HOST}:${APP_PORT}${HEALTH_PATH}}"

healthcheck() {
  local i args=(-fsS)
  # Si el guard de origen está activo, el healthcheck debe enviar la cabecera (si no, 403 y rollback).
  [[ -n "$ORIGIN_SECRET_VAL" ]] && args+=(-H "${ORIGIN_HDR}: ${ORIGIN_SECRET_VAL}")
  for ((i=1; i<=HEALTH_RETRIES; i++)); do
    if curl "${args[@]}" "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
    sleep "$HEALTH_SLEEP_SECONDS"
  done
  return 1
}

for c in curl git; do command -v "$c" >/dev/null || { log "ERROR: falta $c"; exit 1; }; done
[[ "${EUID}" -ne 0 ]] && { command -v sudo >/dev/null || { log "ERROR: falta sudo"; exit 1; }; }
[[ -f "$APP_DIR/.env" ]] || { log "ERROR: falta $APP_DIR/.env (copia .env.example y rellénalo)"; exit 1; }

if [[ "$UPDATE_REPO" == "1" ]]; then
  REPO_DIR="$(git -C "$APP_DIR" rev-parse --show-toplevel)"
  PREV_REV="$(git -C "$REPO_DIR" rev-parse HEAD)"
  log "Actualizando código ${REMOTE}/${BRANCH} (HEAD actual ${PREV_REV:0:8})"
  git -C "$REPO_DIR" fetch "$REMOTE" "$BRANCH"
  git -C "$REPO_DIR" reset --hard "${REMOTE}/${BRANCH}"
fi

mkdir -p "$BIN_DIR"
if [[ "${BUILD:-0}" == "1" ]]; then
  command -v cargo >/dev/null || { log "ERROR: BUILD=1 pero no hay cargo"; exit 1; }
  log "Compilando en el servidor (cargo build --release, jobs=${CARGO_BUILD_JOBS:-1})..."
  (cd "$APP_DIR" && CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-1}" cargo build --release --locked)
  cp "$APP_DIR/target/release/refleja-api" "$BIN_NEW"
elif [[ -n "${BINARY:-}" && -f "$BINARY" ]]; then
  cp "$BINARY" "$BIN_NEW"
else
  log "ERROR: indica BINARY=/ruta/refleja-api o BUILD=1"; exit 1
fi
chmod 755 "$BIN_NEW"

# Swap atómico (rename en el mismo directorio) conservando el anterior para rollback
[[ -f "$BIN" ]] && cp -p "$BIN" "$BIN_PREV"
mv -f "$BIN_NEW" "$BIN"
log "Reiniciando ${SERVICE_NAME}..."
run_privileged systemctl restart "$SERVICE_NAME"

log "Validando healthcheck: ${HEALTH_URL}"
if healthcheck; then
  log "OK: servicio arriba."; curl -fsS ${ORIGIN_SECRET_VAL:+-H "${ORIGIN_HDR}: ${ORIGIN_SECRET_VAL}"} "$HEALTH_URL" || true; echo
  exit 0
fi

log "ERROR: healthcheck falló. Rollback al binario anterior..."
if [[ -f "$BIN_PREV" ]]; then
  mv -f "$BIN_PREV" "$BIN"
  run_privileged systemctl restart "$SERVICE_NAME" || true
  if healthcheck; then log "Rollback aplicado correctamente."; else log "ALERTA: ni el despliegue ni el rollback pasaron healthcheck."; fi
else
  log "No hay binario anterior para restaurar."
fi
run_privileged systemctl status "$SERVICE_NAME" --no-pager -l || true
run_privileged journalctl -u "$SERVICE_NAME" -n 120 --no-pager || true
exit 1
