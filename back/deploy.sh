#!/usr/bin/env bash
set -Eeuo pipefail

# =====================================================================
#  Refleja API · despliegue con venv atómico + healthcheck + rollback
#  Uso (como usuario del servicio):
#     su - refleja-api
#     /home/refleja-api/htdocs/api.refleja.org/back/deploy.sh
# =====================================================================

# ---------------- Configuración (editable por env) -------------------
SERVICE_NAME="${SERVICE_NAME:-refleja-api.service}"
BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
PYTHON_BIN="${PYTHON_BIN:-python3.10}"
APP_PORT="${APP_PORT:-20832}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
HEALTH_URL="${HEALTH_URL:-}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_SLEEP_SECONDS="${HEALTH_SLEEP_SECONDS:-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../back
VENV_DIR="${SCRIPT_DIR}/venv"
VENV_NEW_DIR="${SCRIPT_DIR}/venv.new"
VENV_OLD_DIR="${SCRIPT_DIR}/venv.old"
PREV_REV=""
NEW_REV=""

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

run_privileged() {
  if [[ "${EUID}" -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

on_error() {
  local exit_code=$?
  log "ERROR: despliegue falló (exit=${exit_code})."
  log "Tip: sudo journalctl -u ${SERVICE_NAME} -n 120 --no-pager"
  exit "$exit_code"
}
trap on_error ERR

healthcheck() {
  local i
  for ((i=1; i<=HEALTH_RETRIES; i++)); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
    sleep "$HEALTH_SLEEP_SECONDS"
  done
  return 1
}

detect_service_port() {
  local exec_start detected_port
  exec_start="$(run_privileged systemctl show -p ExecStart --value "$SERVICE_NAME" 2>/dev/null || true)"
  if [[ -n "$exec_start" ]]; then
    detected_port="$(printf '%s\n' "$exec_start" | sed -nE 's/.*--port[=[:space:]]*([0-9]{2,5}).*/\1/p' | head -n 1)"
    [[ -n "$detected_port" ]] && { echo "$detected_port"; return 0; }
  fi
  return 1
}

log "Iniciando despliegue de refleja-api..."
cd "$SCRIPT_DIR"

required_cmds=(git curl "$PYTHON_BIN")
[[ "${EUID}" -ne 0 ]] && required_cmds+=(sudo)
for cmd in "${required_cmds[@]}"; do
  command -v "$cmd" >/dev/null 2>&1 || { log "ERROR: comando requerido no disponible: $cmd"; exit 1; }
done

# Permisos sudo no interactivos para systemctl del servicio.
# Usamos 'systemctl show' como sonda: devuelve 0 si el sudo está permitido,
# independientemente de si el servicio está activo o no.
if [[ "${EUID}" -ne 0 ]]; then
  log "Validando permisos sudo NOPASSWD para ${SERVICE_NAME}..."
  if ! sudo -n systemctl show -p ExecStart --value "$SERVICE_NAME" >/dev/null 2>&1; then
    log "ERROR: faltan permisos sudo NOPASSWD para gestionar ${SERVICE_NAME}."
    log "Revisa /etc/sudoers.d/refleja-api (ver back/deploy/refleja-api.sudoers)."
    exit 1
  fi
fi

# Raíz del repositorio git (el back puede ser una subcarpeta del repo)
if ! git -C "$SCRIPT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log "ERROR: ${SCRIPT_DIR} no está dentro de un repositorio git."
  exit 1
fi
REPO_DIR="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
log "Repositorio git: ${REPO_DIR}"

[[ -f "${SCRIPT_DIR}/requirements.txt" ]] || { log "ERROR: no se encontró requirements.txt en ${SCRIPT_DIR}"; exit 1; }

# Puerto real del servicio (si systemd lo define)
if detected_port="$(detect_service_port)"; then
  APP_PORT="$detected_port"
  log "Puerto detectado desde systemd: ${APP_PORT}"
fi
[[ -z "$HEALTH_URL" ]] && HEALTH_URL="http://127.0.0.1:${APP_PORT}${HEALTH_PATH}"
log "Healthcheck: ${HEALTH_URL}"

# 1) Actualizar código (sin detener el servicio). .env (no versionado) se conserva.
log "Actualizando código (${REMOTE}/${BRANCH})..."
PREV_REV="$(git -C "$REPO_DIR" rev-parse HEAD)"
git -C "$REPO_DIR" fetch "$REMOTE" "$BRANCH"
git -C "$REPO_DIR" reset --hard "${REMOTE}/${BRANCH}"
NEW_REV="$(git -C "$REPO_DIR" rev-parse HEAD)"
log "Código: ${PREV_REV} -> ${NEW_REV}"

# 2) Construir venv nuevo en paralelo al servicio en marcha
log "Creando venv nuevo en ${VENV_NEW_DIR}..."
rm -rf "$VENV_NEW_DIR"
"$PYTHON_BIN" -m venv "$VENV_NEW_DIR"
# shellcheck disable=SC1091
source "$VENV_NEW_DIR/bin/activate"
log "Actualizando pip/setuptools/wheel..."
python -m pip install --upgrade pip setuptools wheel
log "Instalando dependencias..."
pip install -r "${SCRIPT_DIR}/requirements.txt"
deactivate

# 3) Swap atómico de venv
log "Swap atómico de venv..."
rm -rf "$VENV_OLD_DIR"
[[ -d "$VENV_DIR" ]] && mv "$VENV_DIR" "$VENV_OLD_DIR"
mv "$VENV_NEW_DIR" "$VENV_DIR"

# 4) Reiniciar servicio (único downtime)
log "Reiniciando ${SERVICE_NAME}..."
run_privileged systemctl restart "$SERVICE_NAME"

# 5) Healthcheck con rollback
log "Validando healthcheck..."
if healthcheck; then
  log "OK: servicio arriba."
  curl -s "$HEALTH_URL" || true; echo
  rm -rf "$VENV_OLD_DIR"
  exit 0
fi

log "ERROR: healthcheck no respondió. Rollback de venv y código..."
if [[ -d "$VENV_OLD_DIR" ]]; then
  rm -rf "$VENV_DIR"; mv "$VENV_OLD_DIR" "$VENV_DIR"
fi
if [[ -n "$PREV_REV" ]]; then
  log "Revirtiendo código a ${PREV_REV}"
  git -C "$REPO_DIR" reset --hard "$PREV_REV" || true
fi
run_privileged systemctl restart "$SERVICE_NAME" || true

if healthcheck; then
  log "Rollback aplicado correctamente."
else
  log "ALERTA: ni el despliegue ni el rollback pasaron healthcheck."
fi
run_privileged systemctl status "$SERVICE_NAME" --no-pager -l || true
run_privileged journalctl -u "$SERVICE_NAME" -n 120 --no-pager || true
exit 1
