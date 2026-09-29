#!/usr/bin/env bash
# Uji migrasi + RLS di PostgreSQL lokal sementara (tanpa Docker).
# Pemakaian: bash scripts/test-db.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
export PATH="$PGBIN:$PATH"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
cleanup() { pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
RUNAS=()
if [ "$(id -u)" = "0" ]; then chown -R postgres "$TMP" 2>/dev/null || true; RUNAS=(runuser -u postgres --); fi
"${RUNAS[@]}" initdb -D "$TMP/data" -U postgres -A trust >/dev/null
"${RUNAS[@]}" pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$TMP" -p "$PORT" -U postgres -d postgres)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_stub_supabase.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "▶ $(basename "$f")"; "${PSQL[@]}" -f "$f"; done
echo "▶ seed.sql"; "${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
for f in "$ROOT"/supabase/tests/[1-9]*.sql; do echo "▶ test $(basename "$f")"; "${PSQL[@]}" -o /dev/null -f "$f"; done
echo "✅ Semua uji database lulus"
