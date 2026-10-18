#!/usr/bin/env bash
# Instala en el SERVIDOR un paquete ya compilado de la API de Refleja (Rust). Corre como root.
# Lo invoca back-rs/scripts/desplegar.sh desde la Mac; no hace falta lanzarlo a mano.
#
#   instalar-en-servidor.sh [--simulacro] [--revertir]
#
# Variables (las pasa desplegar.sh): USUARIO_SITIO BASE RAIZ_PYTHON INSTALACION PUERTO CONSERVAR
#
# Lo que hace, en orden, y lo que NUNCA hace:
#   1. Comprueba sumas SHA-256, usuario, .env, formulario.json y que el puerto no es el del Python (20832).
#   2. Copia el binario a $INSTALACION/releases/<id> (root:usuario, 0750).
#   3. Valida como el usuario del sitio: configuración + base + esquema (`refleja-api --check`).
#   4. Instala/actualiza SOLO la unidad refleja-api-rs.service.
#   5. Cambia el enlace `actual` de forma atómica y reinicia la unidad.
#   6. Healthcheck en 127.0.0.1:$PUERTO; si falla, vuelve a la release anterior (o para la unidad Rust).
#   NUNCA toca la unidad del Python, nginx/CloudPanel, el .env, ni el esquema de la base (no ejecuta DDL).

set -Eeuo pipefail

SIMULACRO=0
REVERTIR=0
for a in "$@"; do
  case "$a" in
    --simulacro) SIMULACRO=1 ;;
    --revertir) REVERTIR=1 ;;
    *) echo "argumento desconocido: $a" >&2; exit 2 ;;
  esac
done

USUARIO_SITIO="${USUARIO_SITIO:-refleja-api}"
BASE="${BASE:-/home/${USUARIO_SITIO}/htdocs/api.refleja.org}"
RAIZ_PYTHON="${RAIZ_PYTHON:-${BASE}/back}"
INSTALACION="${INSTALACION:-${BASE}/back-rs/prod}"
PUERTO="${PUERTO:-20834}"
CONSERVAR="${CONSERVAR:-5}"
UNIDAD="refleja-api-rs.service"
PUERTO_PYTHON=20832
PAQUETE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REINTENTOS_SALUD="${REINTENTOS_SALUD:-40}"
URL_SALUD="http://127.0.0.1:${PUERTO}/api/health"

log() { printf '\033[1;34m[rs]\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m[rs] OK\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[rs] ERROR\033[0m %s\n' "$*" >&2; }
hacer() {
  if [[ "$SIMULACRO" -eq 1 ]]; then printf '\033[2m[simulacro]\033[0m %s\n' "$*"; else "$@"; fi
}

# ── 1. Comprobaciones ─────────────────────────────────────────────────
[[ "$EUID" -eq 0 ]] || { err "ejecútalo como root"; exit 1; }
id -u "$USUARIO_SITIO" >/dev/null 2>&1 || { err "no existe el usuario ${USUARIO_SITIO}"; exit 1; }
[[ "$PUERTO" =~ ^[0-9]+$ ]] || { err "PUERTO inválido: ${PUERTO}"; exit 1; }
[[ "$PUERTO" != "$PUERTO_PYTHON" ]] || { err "${PUERTO_PYTHON} es el puerto del Python: elige otro"; exit 1; }
[[ -f "${RAIZ_PYTHON}/.env" ]] || { err "no existe ${RAIZ_PYTHON}/.env"; exit 1; }
[[ -f "${BASE}/front/src/formulario.json" ]] || { err "no existe ${BASE}/front/src/formulario.json (la API lo lee para validar las preguntas)"; exit 1; }

releases_ordenadas() { ls -1 "${INSTALACION}/releases" 2>/dev/null | sort; }
actual_id() { if [[ -L "${INSTALACION}/actual" ]]; then basename "$(readlink "${INSTALACION}/actual")"; else echo ninguna; fi; }

# Cabecera del guard de origen (solo si ORIGIN_SECRET está definido en el .env). Se pasa a curl por stdin
# para que el secreto no aparezca en la lista de procesos ni en la salida.
cabecera_origen() {
  local secreto cabecera
  secreto="$(grep -E '^ORIGIN_SECRET=' "${RAIZ_PYTHON}/.env" | tail -n1 | cut -d= -f2- | tr -d '\r"'"'" || true)"
  [[ -n "$secreto" ]] || return 0
  cabecera="$(grep -E '^ORIGIN_SECRET_HEADER=' "${RAIZ_PYTHON}/.env" | tail -n1 | cut -d= -f2- | tr -d '\r"'"'" || true)"
  printf 'header = "%s: %s"\n' "${cabecera:-X-Origin-Secret}" "$secreto"
}

esperar_salud() {
  local codigo cuerpo i
  for ((i = 1; i <= REINTENTOS_SALUD; i++)); do
    cuerpo="$(cabecera_origen | curl -s --max-time 5 -K - -o - -w '\n%{http_code}' "$URL_SALUD" 2>/dev/null || true)"
    codigo="${cuerpo##*$'\n'}"
    if [[ "$codigo" == "200" && "$cuerpo" == *'"status":"ok"'* ]]; then
      ok "salud 200: $(head -c 200 <<<"${cuerpo%$'\n'*}")"
      return 0
    fi
    sleep 1
  done
  err "salud no respondió 200 tras ${REINTENTOS_SALUD} s (último código: ${codigo:-sin respuesta})"
  return 1
}

unidad_sana() {
  sleep 3
  if systemctl is-active --quiet "$UNIDAD"; then ok "${UNIDAD} activa"; else err "${UNIDAD} no sigue activa"; return 1; fi
}

cambiar_a() {
  local id="$1"
  hacer ln -sfn "releases/${id}" "${INSTALACION}/actual.nuevo"
  hacer mv -Tf "${INSTALACION}/actual.nuevo" "${INSTALACION}/actual"
  hacer systemctl restart "$UNIDAD"
}

# ── Volver atrás ──────────────────────────────────────────────────────
if [[ "$REVERTIR" -eq 1 ]]; then
  ACTUAL="$(actual_id)"
  ANTERIOR="$(releases_ordenadas | grep -v -x "$ACTUAL" | tail -1 || true)"
  [[ -n "$ANTERIOR" ]] || { err "no hay release anterior a ${ACTUAL}"; exit 1; }
  log "Volviendo de ${ACTUAL} a ${ANTERIOR}"
  cambiar_a "$ANTERIOR"
  [[ "$SIMULACRO" -eq 1 ]] || esperar_salud
  exit $?
fi

ID="$(cat "${PAQUETE}/VERSION")"
log "Paquete ${ID}"
(cd "$PAQUETE" && sha256sum -c --quiet SHA256SUMS) || { err "las sumas SHA-256 no coinciden"; exit 1; }
ok "sumas SHA-256"

# ── 2. Copia de la release ────────────────────────────────────────────
DIR_RELEASE="${INSTALACION}/releases/${ID}"
hacer install -d -o root -g "$USUARIO_SITIO" -m 0750 "$INSTALACION" "${INSTALACION}/releases" "$DIR_RELEASE" "${DIR_RELEASE}/bin"
for b in "${PAQUETE}"/bin/*; do hacer install -o root -g "$USUARIO_SITIO" -m 0750 "$b" "${DIR_RELEASE}/bin/"; done
hacer install -o root -g "$USUARIO_SITIO" -m 0640 "${PAQUETE}/VERSION" "${DIR_RELEASE}/VERSION"

# ── 3. Validación como el usuario del sitio ───────────────────────────
DIR_VALIDAR="$DIR_RELEASE"
[[ "$SIMULACRO" -eq 1 ]] && DIR_VALIDAR="$PAQUETE"
log "Validando configuración, base de datos y esquema como ${USUARIO_SITIO}"
if ! (cd "$RAIZ_PYTHON" && runuser -u "$USUARIO_SITIO" -- env APP_PORT="$PUERTO" "${DIR_VALIDAR}/bin/refleja-api" --check); then
  err "la configuración, la base o el esquema no valen para la API Rust; no se cambia nada"
  [[ "$SIMULACRO" -eq 1 ]] || rm -rf "$DIR_RELEASE"
  exit 1
fi

# ── 4. Unidad systemd (solo refleja-api-rs) ───────────────────────────
TEMPORAL="$(mktemp)"
trap 'rm -f "$TEMPORAL"' EXIT
destino="/etc/systemd/system/${UNIDAD}"
sed -e "s|@USUARIO@|${USUARIO_SITIO}|g" -e "s|@RAIZ_PYTHON@|${RAIZ_PYTHON}|g" \
    -e "s|@INSTALACION@|${INSTALACION}|g" -e "s|@PUERTO@|${PUERTO}|g" \
    "${PAQUETE}/systemd/${UNIDAD}" >"$TEMPORAL"
if grep -q '@[A-Z_]*@' "$TEMPORAL"; then err "quedan marcadores sin sustituir en ${UNIDAD}"; exit 1; fi
if ! cmp -s "$TEMPORAL" "$destino" 2>/dev/null; then
  log "Instalando ${destino}"
  hacer install -m 0644 -o root -g root "$TEMPORAL" "$destino"
  hacer systemctl daemon-reload
  if command -v systemd-analyze >/dev/null && [[ "$SIMULACRO" -eq 0 ]]; then
    # Se valida contra la release NUEVA: en la primera instalación `actual` aún no existe.
    verificar="$(mktemp -d)"
    sed "s|${INSTALACION}/actual/|${DIR_RELEASE}/|g" "$destino" >"${verificar}/${UNIDAD}"
    if ! systemd-analyze verify "${verificar}/${UNIDAD}"; then
      rm -rf "$verificar"
      hacer rm -f "$destino"
      hacer systemctl daemon-reload
      err "systemd-analyze rechaza ${UNIDAD}"
      exit 1
    fi
    rm -rf "$verificar"
  fi
fi
hacer systemctl enable --quiet "$UNIDAD"

# ── 5 y 6. Cambio atómico + salud, con vuelta atrás ───────────────────
ANTERIOR="$(actual_id)"
log "Activando ${ID} (antes: ${ANTERIOR})"
cambiar_a "$ID"
if [[ "$SIMULACRO" -eq 1 ]]; then ok "simulacro terminado: no se cambió nada"; exit 0; fi

if ! esperar_salud || ! unidad_sana; then
  journalctl -u "$UNIDAD" -n 20 --no-pager || true
  if [[ "$ANTERIOR" != "ninguna" && -d "${INSTALACION}/releases/${ANTERIOR}" ]]; then
    err "volviendo a ${ANTERIOR}"
    cambiar_a "$ANTERIOR"
    esperar_salud || err "la release anterior TAMPOCO responde: revisa journalctl -u refleja-api-rs"
  else
    err "no hay release anterior: se para la unidad Rust (el Python queda como estaba)"
    systemctl stop "$UNIDAD" 2>/dev/null || true
  fi
  exit 1
fi

# ── Limpieza: se conservan las $CONSERVAR más recientes ───────────────
releases_ordenadas | head -n "-${CONSERVAR}" | while read -r vieja; do
  [[ "$vieja" == "$ID" || "$vieja" == "$ANTERIOR" ]] && continue
  log "Borrando release antigua ${vieja}"
  rm -rf "${INSTALACION:?}/releases/${vieja:?}"
done
ok "desplegada ${ID} en ${URL_SALUD}"
