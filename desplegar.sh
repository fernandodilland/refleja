#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================================
#  desplegar.sh — despliegue de la API de Refleja (Rust) desde la Mac.
#
#    ./desplegar.sh back          compila (con gates), sube y activa la API Rust en el puerto 20834
#    ./desplegar.sh dia-d         corte Python → Rust (apaga y bloquea refleja-api.service y despliega)
#    ./desplegar.sh revertir      vuelve a la release Rust anterior
#    ./desplegar.sh deshacer      vuelve al Python (en el puerto 20834; CloudPanel no se toca)
#    ./desplegar.sh simulacro     todo menos cambiar algo en el servidor
#    ./desplegar.sh verificar     solo comprueba que todo responde
#
#  El FRONT no se despliega aquí: Cloudflare Workers Builds lo publica solo con cada push a `main`
#  (ver README.md). El backend va primero: hacer push a main DESPUÉS de que la API esté arriba.
#  OBSOLETO desde la PC Debian (usa `dev desplegar refleja`). Detalles históricos: back-rs/README.md §Producción. Requiere el alias `hivelocity` en ~/.ssh/config.
# ============================================================================

URL_API="${URL_API:-https://api.refleja.org}"
URL_FRONT="${URL_FRONT:-https://refleja.org}"
OBJETIVO="${1:-}"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ"

log() { printf '\033[1;36m> %s\033[0m\n' "$*"; }
err() { printf '\033[1;31mx %s\033[0m\n' "$*" >&2; }
ok() { printf '\033[1;32mv %s\033[0m\n' "$*"; }

verificar() {
  local fallos=0 cuerpo codigo
  log "Verificando ${URL_API}/api/health"
  if cuerpo="$(curl -fsS --max-time 15 "${URL_API}/api/health")" && grep -q '"status":"ok"' <<<"$cuerpo"; then
    ok "API correcta: ${cuerpo}"
  else
    err "La API no responde o su estado no es 'ok'"; fallos=$((fallos + 1))
  fi
  log "Verificando ${URL_FRONT}"
  codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL_FRONT" || echo 000)"
  if [[ "$codigo" == "200" ]]; then ok "Front responde (200)"; else err "Front devolvió ${codigo}"; fallos=$((fallos + 1)); fi
  return "$fallos"
}

case "$OBJETIVO" in
  back)      back-rs/scripts/desplegar.sh --limpiar && verificar ;;
  dia-d)     back-rs/scripts/compilar.sh >/dev/null && back-rs/scripts/dia-d.sh && verificar && back-rs/scripts/limpiar.sh ;;
  revertir)  back-rs/scripts/desplegar.sh --revertir && verificar ;;
  deshacer)  back-rs/scripts/dia-d.sh --deshacer && verificar ;;
  simulacro) back-rs/scripts/desplegar.sh --simulacro ;;
  verificar) verificar ;;
  *) sed -n 4,14p "$0"; exit 2 ;;
esac
