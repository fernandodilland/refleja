#!/usr/bin/env bash
# Uso: scripts/apply_schema.sh <base_de_datos>   (MariaDB local de mariadb_local.sh)
set -euo pipefail
DB="$1"; D="$(cd "$(dirname "$0")/.." && pwd)"; SOCK="${MDB_DIR:-${TMPDIR:-/tmp}/refleja-mariadb}/mysql.sock"
mariadb --no-defaults -S "$SOCK" -uroot -e "CREATE DATABASE IF NOT EXISTS \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mariadb --no-defaults -S "$SOCK" -uroot "$DB" < "$D/migrations/0001_baseline.sql"
