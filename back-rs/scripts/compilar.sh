#!/usr/bin/env bash
# Compila EN LA MAC el binario Linux de la API de Refleja y arma el paquete que se sube al servidor.
# El servidor no tiene ni necesita Rust (mismo patrón que sistema.fernandodilland y correo.fractory.mx).
#
#   back-rs/scripts/compilar.sh            # gates (fmt, clippy, pruebas, audit, paridad con Python) + binarios + paquete
#   back-rs/scripts/compilar.sh --rapido   # sin gates (solo para repetir un empaquetado)
#
# Requisitos (una vez): rustup target add x86_64-unknown-linux-gnu, brew install zig,
# cargo install cargo-zigbuild --locked; para el gate de paridad: MariaDB local (scripts/mariadb_local.sh)
# y ../back/.venv (Python 3.10).
#
# Resultado: back-rs/dist/refleja-api-rs-<version>-<fecha>-<commit>.tar.gz (y el enlace dist/ultimo.tar.gz) con
#   bin/refleja-api  bin/refleja-admin   systemd/   migraciones/ (esquema de referencia)   instalar-en-servidor.sh   VERSION   SHA256SUMS

set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
[[ -f despliegue/despliegue.conf ]] && source despliegue/despliegue.conf
TARGET="${TARGET:-x86_64-unknown-linux-gnu.2.35}"
TRIPLE="${TARGET%%.[0-9]*}"
# Fuera del repo y con pocos hilos: no satura la Mac. `desplegar.sh --limpiar` borra lo que ocupa.
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.cache/refleja-rs-target}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-3}"
BINS=(refleja-api refleja-admin)

log() { printf '\033[1;34m==>\033[0m %s\n' "$*" >&2; }
err() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; }

[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
for cmd in cargo cargo-zigbuild zig shasum tar; do
  command -v "$cmd" >/dev/null 2>&1 || { err "falta '$cmd' (ver la cabecera de este script)"; exit 1; }
done

if [[ "${1:-}" != "--rapido" ]]; then
  log "Gates: fmt, clippy (-D warnings) y pruebas"
  cargo fmt --all --check
  cargo clippy --all-targets --locked -- -D warnings
  salida="$(cargo test --locked 2>&1)" || { echo "$salida" >&2; err "fallan las pruebas"; exit 1; }
  total="$(grep -Eo '^test result: ok\. [0-9]+ passed' <<<"$salida" | awk '{s+=$4} END {print s+0}')"
  [[ "$total" -gt 0 ]] || { err "no se ejecutó ninguna prueba"; exit 1; }
  log "Pruebas: ${total} en verde"
  if command -v cargo-audit >/dev/null 2>&1; then
    log "cargo audit"; cargo audit >&2 || { err "cargo audit encontró vulnerabilidades"; exit 1; }
  else
    log "AVISO: cargo-audit no está instalado (brew install cargo-audit); se omite"
  fi
  log "Gate de paridad: la misma batería de peticiones contra el Python y el Rust (MariaDB local)"
  scripts/mariadb_local.sh start >/dev/null
  cargo build --release --locked >&2
  RS_BIN="${CARGO_TARGET_DIR}/release/refleja-api" python3 tests/contract/diff.py >&2 \
    || { err "la paridad con el backend Python falló"; exit 1; }
fi

log "Compilando para ${TARGET}"
cargo zigbuild --release --locked --target "$TARGET" $(printf -- '--bin %s ' "${BINS[@]}") >&2
for b in "${BINS[@]}"; do
  [[ -x "${CARGO_TARGET_DIR}/${TRIPLE}/release/${b}" ]] || { err "no se encontró ${b}"; exit 1; }
done

VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo sincommit)"
[[ -z "$(git status --porcelain -- . 2>/dev/null)" ]] || COMMIT="${COMMIT}-sucio"
ID="${VERSION}-$(date -u +%Y%m%d%H%M%S)-${COMMIT}"

mkdir -p dist
PAQ="dist/refleja-api-rs-${ID}"
rm -rf "$PAQ"
mkdir -p "$PAQ/bin" "$PAQ/systemd" "$PAQ/migraciones"
for b in "${BINS[@]}"; do cp "${CARGO_TARGET_DIR}/${TRIPLE}/release/${b}" "$PAQ/bin/"; done
cp despliegue/systemd/*.service "$PAQ/systemd/"
cp migrations/0001_baseline.sql migrations/expected_schema.txt "$PAQ/migraciones/"
cp despliegue/instalar-en-servidor.sh "$PAQ/"
echo "$ID" >"$PAQ/VERSION"
(cd "$PAQ" && shasum -a 256 bin/* systemd/* migraciones/* instalar-en-servidor.sh VERSION >SHA256SUMS)

# COPYFILE_DISABLE: sin los `._*` de macOS dentro del tar (--no-mac-metadata solo existe en el tar de macOS;
# en la PC con Debian, GNU tar no lo conoce).
SIN_MAC=(); [[ $(uname) == Darwin ]] && SIN_MAC=(--no-mac-metadata)
COPYFILE_DISABLE=1 tar --no-xattrs "${SIN_MAC[@]}" -C dist -czf "dist/refleja-api-rs-${ID}.tar.gz" "refleja-api-rs-${ID}"
rm -rf "$PAQ"
ln -sfn "refleja-api-rs-${ID}.tar.gz" dist/ultimo.tar.gz
log "Paquete: back-rs/dist/refleja-api-rs-${ID}.tar.gz ($(du -h "dist/refleja-api-rs-${ID}.tar.gz" | cut -f1))"
echo "$ID"
