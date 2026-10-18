#!/usr/bin/env bash
# Día D: la API de Refleja pasa de Python a Rust, con vuelta atrás (patrón de sistema.fernandodilland y correo.fractory.mx).
#
#   back-rs/scripts/dia-d.sh --simulacro   # solo comprueba; no cambia nada
#   back-rs/scripts/dia-d.sh               # ejecuta el corte
#   back-rs/scripts/dia-d.sh --deshacer    # vuelve al Python (en el puerto del Rust: CloudPanel no se toca)
#
# Orden del corte:
#   1. Comprobaciones: paquete listo y el Python como está.
#   2. Se para y deshabilita el Python (refleja-api.service) SIN BORRAR NADA: unidad, venv y código se quedan.
#      Un drop-in (`90-apagado-por-rust.conf`, ConditionPathExists de un archivo que no existe) impide que
#      vuelva a arrancar solo (reinicio del servidor, `back/deploy.sh`, `systemctl start`).
#   3. desplegar.sh --sin-compilar: sube el paquete, arranca refleja-api-rs y comprueba la salud.
#   4. Salud a través de Cloudflare/CloudPanel (https://api.refleja.org/api/health).
# Si algo falla tras el paso 2, se deshace solo.
# CloudPanel (App Port) ya apunta al puerto del Rust (20834); el Python escuchaba en 20832.

set -Eeuo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
[[ -f despliegue/despliegue.conf ]] && source despliegue/despliegue.conf
ALIAS_SSH="${ALIAS_SSH:-hivelocity}"
USUARIO_SITIO="${USUARIO_SITIO:-refleja-api}"
DOMINIO_SITIO="${DOMINIO_SITIO:-api.refleja.org}"
BASE="${BASE:-/home/${USUARIO_SITIO}/htdocs/${DOMINIO_SITIO}}"
RAIZ_PYTHON="${RAIZ_PYTHON:-${BASE}/back}"
PUERTO="${PUERTO:-20834}"
URL_PUBLICA="${URL_PUBLICA:-https://${DOMINIO_SITIO}/api/health}"
UNIDAD_PY="refleja-api.service"
UNIDAD_RS="refleja-api-rs.service"
BLOQUEO="90-apagado-por-rust.conf"
PUERTO_PY="91-puerto-del-rust.conf"

MODO="ejecutar"
case "${1:-}" in
  --simulacro) MODO="simulacro" ;;
  --deshacer) MODO="deshacer" ;;
  "") ;;
  *) echo "argumento desconocido: $1" >&2; exit 2 ;;
esac

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m OK\033[0m %s\n' "$*"; }
err() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; }
remoto() { ssh -o ConnectTimeout=15 "$ALIAS_SSH" "$@"; }

bloquear_python() {
  remoto "install -d -m 0755 /etc/systemd/system/${UNIDAD_PY}.d && printf '%s\n' \
'# Apagado por el corte a Rust (back-rs/scripts/dia-d.sh). Para volver: back-rs/scripts/dia-d.sh --deshacer' \
'[Unit]' 'ConditionPathExists=/etc/refleja-rs/permitir-python' >/etc/systemd/system/${UNIDAD_PY}.d/${BLOQUEO} && systemctl daemon-reload"
}

arrancar_python() {
  log "Volviendo al Python (en el puerto ${PUERTO}: CloudPanel ya apunta ahí)"
  remoto "systemctl disable --now ${UNIDAD_RS} 2>/dev/null || true"
  remoto "rm -f /etc/systemd/system/${UNIDAD_PY}.d/${BLOQUEO}"
  # La web Python escucha en el puerto al que apunta CloudPanel (su unidad original no se modifica)
  remoto "install -d -m 0755 /etc/systemd/system/${UNIDAD_PY}.d && printf '%s\n' \
'# Puesto por back-rs/scripts/dia-d.sh --deshacer: el Python en el puerto al que apunta CloudPanel' '[Service]' 'ExecStart=' \
'ExecStart=${RAIZ_PYTHON}/venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port ${PUERTO} --workers 2' \
>/etc/systemd/system/${UNIDAD_PY}.d/${PUERTO_PY} && systemctl daemon-reload"
  remoto "systemctl enable --now ${UNIDAD_PY}"
  remoto "for i in \$(seq 30); do curl -fsS -m 3 -o /dev/null http://127.0.0.1:${PUERTO}/api/health && exit 0; sleep 1; done; exit 1" \
    && ok "API Python responde en ${PUERTO}" || err "el Python tampoco responde en ${PUERTO}: journalctl -u refleja-api"
}

if [[ "$MODO" == "deshacer" ]]; then
  arrancar_python
  exit 0
fi

# ── 1. Comprobaciones ─────────────────────────────────────────────────
log "Comprobando el servidor"
PY_ACTIVO="$(remoto "systemctl is-active ${UNIDAD_PY} || true")"
log "Python (${UNIDAD_PY}): ${PY_ACTIVO}"
[[ -f dist/ultimo.tar.gz ]] || { err "no hay paquete en back-rs/dist/: ejecuta back-rs/scripts/compilar.sh"; exit 1; }
if [[ "$MODO" == "simulacro" ]]; then
  scripts/desplegar.sh --sin-compilar --simulacro
  ok "simulacro terminado: no se cambió nada"
  exit 0
fi

# ── 2. Apagar el Python (sin borrar nada) ─────────────────────────────
log "Parando y bloqueando el Python"
bloquear_python
remoto "systemctl disable --now ${UNIDAD_PY} 2>/dev/null || true"

# ── 3. Desplegar el Rust; si falla, se deshace solo ───────────────────
if ! scripts/desplegar.sh --sin-compilar; then
  err "falló el despliegue de Rust: volviendo al Python"
  arrancar_python
  exit 1
fi

# ── 4. Salud pública (como entra Cloudflare) ──────────────────────────
log "Salud pública: ${URL_PUBLICA}"
if curl -fsS --max-time 20 "${URL_PUBLICA}" | grep -q '"status":"ok"'; then
  ok "api.refleja.org responde desde Rust"
else
  err "la salud pública falló (¿CloudPanel apunta a ${PUERTO}?): volviendo al Python"
  arrancar_python
  exit 1
fi
ok "Día D completado. Python queda apagado, deshabilitado y bloqueado; para volver: back-rs/scripts/dia-d.sh --deshacer"
