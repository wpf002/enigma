#!/usr/bin/env bash
# Restore an AACT snapshot into the local aact database.
# Download the daily static copy (Postgres dump) from CTTI and place it in
# infra/aact/dumps/ before running. Requires a free CTTI account.
set -euo pipefail

DUMP="${1:-}"
[ -z "$DUMP" ] && { echo "usage: restore.sh <path-to-aact-dump>"; exit 1; }
[ -f "$DUMP" ] || { echo "not found: $DUMP"; exit 1; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$ROOT/.env" ] && { set -a; . "$ROOT/.env"; set +a; }
PORT="${AACT_PG_PORT:-5433}"

echo "==> Restoring $DUMP into aact@localhost:$PORT"
PGPASSWORD=aact psql -h localhost -p "$PORT" -U aact -d aact -q -c 'DROP SCHEMA IF EXISTS ctgov CASCADE'
PGPASSWORD=aact pg_restore -h localhost -p "$PORT" -U aact -d aact --no-owner --clean --if-exists -j 4 "$DUMP"
echo "==> Done. Recording checksum."
shasum -a 256 "$DUMP" | tee "$ROOT/infra/aact/last_restore.sha256"
