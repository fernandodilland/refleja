#!/usr/bin/env bash
# Libera disco en la Mac tras desplegar bien: borra la caché de compilación (varios GB) y los paquetes viejos
# de dist/ (se quedan los 2 últimos, para poder volver atrás sin recompilar).
set -Eeuo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.cache/refleja-rs-target}"
printf '\033[1;34m==>\033[0m Limpiando la Mac (%s y paquetes viejos)\n' "$CARGO_TARGET_DIR"
rm -rf "$CARGO_TARGET_DIR" target
ls -1t dist/refleja-api-rs-*.tar.gz 2>/dev/null | tail -n +3 | xargs rm -f
