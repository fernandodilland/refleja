#!/usr/bin/env bash
# Despliegue de la API Rust de Refleja desde la Mac: compila aquí, sube el paquete y lo activa allí
# (patrón de sistema.fernandodilland/rust/deploy y correo.fractory.mx). El servidor no compila ni tiene Rust.
# NO toca la unidad del Python: el corte lo hace dia-d.sh.
#
#   back-rs/scripts/desplegar.sh                 # compilar (con gates) + subir + activar
#   back-rs/scripts/desplegar.sh --simulacro     # todo menos cambiar algo en el servidor
#   back-rs/scripts/desplegar.sh --sin-compilar  # reutiliza back-rs/dist/ultimo.tar.gz
#   back-rs/scripts/desplegar.sh --revertir      # vuelve a la release anterior
#   back-rs/scripts/desplegar.sh --limpiar       # tras desplegar bien, libera disco en la Mac
#
# Configuración opcional: back-rs/despliegue/despliegue.conf (ver despliegue.conf.ejemplo).

set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
[[ -f despliegue/despliegue.conf ]] && source despliegue/despliegue.conf

ALIAS_SSH="${ALIAS_SSH:-hivelocity}"
USUARIO_SITIO="${USUARIO_SITIO:-refleja-api}"
DOMINIO_SITIO="${DOMINIO_SITIO:-api.refleja.org}"
BASE="${BASE:-/home/${USUARIO_SITIO}/htdocs/${DOMINIO_SITIO}}"
RAIZ_PYTHON="${RAIZ_PYTHON:-${BASE}/back}"
INSTALACION="${INSTALACION:-${BASE}/back-rs/prod}"
PUERTO="${PUERTO:-20834}"
CONSERVAR="${CONSERVAR:-5}"
TARGET="${TARGET:-x86_64-unknown-linux-gnu.2.35}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.cache/refleja-rs-target}"

SIMULACRO=0; SIN_COMPILAR=0; REVERTIR=0; LIMPIAR=0
for a in "$@"; do
  case "$a" in
    --simulacro) SIMULACRO=1 ;;
    --sin-compilar) SIN_COMPILAR=1 ;;
    --revertir) REVERTIR=1 ;;
    --limpiar) LIMPIAR=1 ;;
    *) echo "argumento desconocido: $a" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; }

VARIABLES="USUARIO_SITIO='${USUARIO_SITIO}' BASE='${BASE}' RAIZ_PYTHON='${RAIZ_PYTHON}' INSTALACION='${INSTALACION}' PUERTO='${PUERTO}' CONSERVAR='${CONSERVAR}'"
BANDERAS=""
[[ "$SIMULACRO" -eq 1 ]] && BANDERAS="--simulacro"

if [[ "$REVERTIR" -eq 1 ]]; then
  log "Revirtiendo en ${ALIAS_SSH}"
  ssh "$ALIAS_SSH" "env ${VARIABLES} bash '${INSTALACION}/instalar-en-servidor.sh' --revertir ${BANDERAS}"
  exit $?
fi

# ── Plataforma del servidor: x86_64 y glibc >= 2.35 ───────────────────
log "Comprobando la plataforma de ${ALIAS_SSH}"
PLATAFORMA="$(ssh "$ALIAS_SSH" 'uname -m; ldd --version 2>&1 | head -1 | grep -Eo "[0-9]+\.[0-9]+$"')"
ARQ="$(sed -n 1p <<<"$PLATAFORMA")"; GLIBC="$(sed -n 2p <<<"$PLATAFORMA")"
[[ "$ARQ" == "x86_64" ]] || { err "el servidor es ${ARQ}; ajusta TARGET"; exit 1; }
if [[ -n "$GLIBC" ]] && ! printf '2.35\n%s\n' "$GLIBC" | sort -V -C; then
  err "glibc ${GLIBC} < 2.35: ajusta TARGET (p. ej. x86_64-unknown-linux-gnu.${GLIBC})"; exit 1
fi
log "Servidor ${ARQ}, glibc ${GLIBC:-?}"

# ── Compilar en la Mac ────────────────────────────────────────────────
[[ "$SIN_COMPILAR" -eq 1 ]] || TARGET="$TARGET" scripts/compilar.sh >/dev/null
PAQUETE="$(readlink -f dist/ultimo.tar.gz 2>/dev/null || true)"
[[ -f "$PAQUETE" ]] || { err "no hay paquete en back-rs/dist/ (ejecuta back-rs/scripts/compilar.sh)"; exit 1; }
NOMBRE="$(basename "$PAQUETE" .tar.gz)"
log "Subiendo ${NOMBRE} ($(du -h "$PAQUETE" | cut -f1))"

# ── Subir, desempaquetar e instalar ───────────────────────────────────
REMOTO="$(ssh "$ALIAS_SSH" 'mktemp -d /tmp/refleja-rs.XXXXXXXX')"
trap 'ssh "$ALIAS_SSH" "rm -rf ${REMOTO}" >/dev/null 2>&1 || true' EXIT
scp -q "$PAQUETE" "${ALIAS_SSH}:${REMOTO}/"
# El usuario del sitio debe poder ejecutar el binario para validarlo.
ssh "$ALIAS_SSH" "tar -C '${REMOTO}' -xzf '${REMOTO}/${NOMBRE}.tar.gz' && chmod -R go+rX '${REMOTO}'"
ssh "$ALIAS_SSH" "env ${VARIABLES} bash '${REMOTO}/${NOMBRE}/instalar-en-servidor.sh' ${BANDERAS}"

# El instalador queda junto a las releases para poder revertir sin paquete.
if [[ "$SIMULACRO" -eq 0 ]]; then
  ssh "$ALIAS_SSH" "install -o root -g '${USUARIO_SITIO}' -m 0750 '${REMOTO}/${NOMBRE}/instalar-en-servidor.sh' '${INSTALACION}/instalar-en-servidor.sh'"
fi
log "Listo. Prueba local: ssh -N -L ${PUERTO}:127.0.0.1:${PUERTO} ${ALIAS_SSH}"

if [[ "$LIMPIAR" -eq 1 && "$SIMULACRO" -eq 0 ]]; then
  scripts/limpiar.sh
fi
