#!/usr/bin/env bash
# Regenera assets/ desde el backend Python (en SQLite temporal). Solo para mantener la doc de desarrollo.
set -euo pipefail
D="$(cd "$(dirname "$0")/.." && pwd)"; B="$D/../back"; S="$(mktemp -d)"; P=29870
(cd "$S" && ENV=development DATABASE_URL="sqlite:///$S/t.db" PYTHONPATH="$B" PYTHONDONTWRITEBYTECODE=1 "$B/.venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port $P >"$S/log" 2>&1 </dev/null &)
sleep 4
curl -fs http://127.0.0.1:$P/api/docs -o "$D/assets/docs.html"
curl -fs http://127.0.0.1:$P/api/openapi.json -o "$D/assets/openapi.json"
curl -fs http://127.0.0.1:$P/docs/oauth2-redirect -o "$D/assets/oauth2-redirect.html"
pkill -f "port $P" || true; rm -rf "$S"; echo "assets actualizados"
