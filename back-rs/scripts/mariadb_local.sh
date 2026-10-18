#!/usr/bin/env bash
# MariaDB local efímera para desarrollo/pruebas (Homebrew). Sin Docker.
# Uso: scripts/mariadb_local.sh start|stop|status   (datos en $MDB_DIR, puerto $MDB_PORT)
set -euo pipefail
MDB_DIR="${MDB_DIR:-${TMPDIR:-/tmp}/refleja-mariadb}"
MDB_PORT="${MDB_PORT:-33306}"
SOCK="$MDB_DIR/mysql.sock"
case "${1:-start}" in
  start)
    if [ ! -d "$MDB_DIR/data/mysql" ]; then
      mkdir -p "$MDB_DIR"
      mariadb-install-db --no-defaults --datadir="$MDB_DIR/data" --auth-root-authentication-method=normal >/dev/null
    fi
    if ! mariadb-admin --no-defaults -S "$SOCK" -uroot ping >/dev/null 2>&1; then
      nohup mariadbd --no-defaults --datadir="$MDB_DIR/data" --socket="$SOCK" --port="$MDB_PORT" \
        --bind-address=127.0.0.1 --innodb-buffer-pool-size=32M --max-connections=60 \
        --skip-name-resolve --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci \
        >"$MDB_DIR/server.log" 2>&1 &
      for _ in $(seq 1 40); do mariadb-admin --no-defaults -S "$SOCK" -uroot ping >/dev/null 2>&1 && break; sleep 0.5; done
    fi
    mariadb --no-defaults -S "$SOCK" -uroot -e "CREATE USER IF NOT EXISTS 'refleja'@'127.0.0.1' IDENTIFIED VIA mysql_native_password USING PASSWORD('dev_only_pw'); CREATE USER IF NOT EXISTS 'refleja'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('dev_only_pw'); GRANT ALL ON \`refleja\_%\`.* TO 'refleja'@'127.0.0.1'; GRANT ALL ON \`refleja\_%\`.* TO 'refleja'@'localhost'; FLUSH PRIVILEGES;"
    echo "MariaDB lista en 127.0.0.1:$MDB_PORT (usuario refleja / bases refleja_*)";;
  stop) mariadb-admin --no-defaults -S "$SOCK" -uroot shutdown 2>/dev/null && echo detenida || echo "no estaba corriendo";;
  status) mariadb-admin --no-defaults -S "$SOCK" -uroot ping;;
esac
