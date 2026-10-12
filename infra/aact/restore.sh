#!/usr/bin/env bash
# Restore an AACT snapshot into the local aact database.
# Download the daily static copy (Postgres dump) from CTTI and place it in
# infra/aact/dumps/ before running. Requires a free CTTI account.
set -euo pipefail

DUMP="${1:-}"
[ -z "$DUMP" ] && { echo "usage: restore.sh <path-to-aact-dump>"; exit 1; }
[ -f "$DUMP" ] || { echo "not found: $DUMP"; exit 1; }

echo "==> Restoring $DUMP into aact@localhost:5433"
pg_restore -h localhost -p 5433 -U aact -d aact --no-owner --clean --if-exists -j 4 "$DUMP"
echo "==> Done. Recording checksum."
shasum -a 256 "$DUMP" | tee infra/aact/last_restore.sha256
