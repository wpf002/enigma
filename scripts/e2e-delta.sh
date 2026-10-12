#!/usr/bin/env bash
# End-to-end check of snapshot versioning, delta sync and watchlist alerts.
# Runs in two scratch databases (enigma_e2e, aact_e2e) and drops them at the end.
# Your working databases are not touched. Needs the containers and the engine running.
#
#   pnpm test:e2e
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a; . ./.env; set +a

EPORT="${ENIGMA_PG_PORT:-5432}"
APORT="${AACT_PG_PORT:-5433}"
epsql() { PGPASSWORD=enigma psql -h localhost -p "$EPORT" -U enigma -v ON_ERROR_STOP=1 -At "$@"; }
apsql() { PGPASSWORD=aact psql -h localhost -p "$APORT" -U aact -v ON_ERROR_STOP=1 -At "$@"; }
cleanup() {
  epsql -d enigma -c 'DROP DATABASE IF EXISTS enigma_e2e' >/dev/null
  apsql -d aact -c 'DROP DATABASE IF EXISTS aact_e2e' >/dev/null
}
trap cleanup EXIT
cleanup
epsql -d enigma -c 'CREATE DATABASE enigma_e2e' >/dev/null
apsql -d aact -c 'CREATE DATABASE aact_e2e' >/dev/null

export DATABASE_URL="postgresql://enigma:enigma@localhost:$EPORT/enigma_e2e"
export AACT_DATABASE_URL="postgresql://aact:aact@localhost:$APORT/aact_e2e"
ingest() { (cd apps/ingest && npx tsx src/index.ts "$@") | grep -E "complete|ERROR|Error|no alerts" | cut -c26-220 || true; }
fail() { echo "FAIL: $1"; exit 1; }

echo "==> migrate"
(cd packages/db && npx prisma migrate deploy >/dev/null)

echo "==> snapshot 1 (200 trials from the registry, one held out of scope)"
(cd apps/ingest && npx tsx src/index.ts aact-subset --limit 200 >/dev/null)
HELD=$(apsql -d aact_e2e -c "SELECT s.nct_id FROM ctgov.studies s JOIN ctgov.outcome_analyses a USING (nct_id) GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1 OFFSET 3")
CHANGED=$(apsql -d aact_e2e -c "SELECT s.nct_id FROM ctgov.studies s JOIN ctgov.outcome_analyses a USING (nct_id) WHERE a.param_value IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1 OFFSET 4")
REMOVED=$(apsql -d aact_e2e -c "SELECT nct_id FROM ctgov.studies ORDER BY nct_id LIMIT 1 OFFSET 20")
apsql -d aact_e2e -c "UPDATE ctgov.studies SET study_type = 'OBSERVATIONAL' WHERE nct_id = '$HELD'" >/dev/null
ingest snapshot
ingest pipeline
S1=$(epsql -d enigma_e2e -c 'SELECT id FROM "Snapshot" ORDER BY "createdAt" LIMIT 1')
RAW1=$(epsql -d enigma_e2e -c "SELECT count(*) FROM raw_study WHERE \"snapshotId\" = '$S1'")
HASH1=$(epsql -d enigma_e2e -c "SELECT md5(string_agg(\"contentHash\", ',' ORDER BY \"nctId\")) FROM raw_study WHERE \"snapshotId\" = '$S1'")

echo "==> watchlists"
epsql -d enigma_e2e -c "INSERT INTO \"Watchlist\" (id, name, kind, value) VALUES ('w1', 'held-out trial', 'TRIAL', '$HELD'), ('w2', 'changed trial', 'TRIAL', '$CHANGED'), ('w3', 'removed trial', 'TRIAL', '$REMOVED'), ('w4', 'HbA1c', 'ENDPOINT', 'hba1c-change')" >/dev/null

echo "==> registry moves on: $HELD posts results, $CHANGED changes an estimate, $REMOVED leaves scope"
apsql -d aact_e2e -c "UPDATE ctgov.studies SET study_type = 'INTERVENTIONAL' WHERE nct_id = '$HELD'" >/dev/null
apsql -d aact_e2e -c "UPDATE ctgov.outcome_analyses SET param_value = param_value * 1.5 WHERE nct_id = '$CHANGED'" >/dev/null
apsql -d aact_e2e -c "UPDATE ctgov.studies SET overall_status = 'WITHDRAWN' WHERE nct_id = '$REMOVED'" >/dev/null
apsql -d aact_e2e -c "UPDATE ctgov.enigma_subset_meta SET value = value || '-rev2' WHERE key IN ('version', 'checksum')" >/dev/null

echo "==> snapshot 2"
ingest snapshot
ingest pipeline
S2=$(epsql -d enigma_e2e -c 'SELECT id FROM "Snapshot" ORDER BY "createdAt" DESC LIMIT 1')

echo "==> checks"
[ "$S1" != "$S2" ] || fail "second snapshot was not created"
[ "$(epsql -d enigma_e2e -c "SELECT \"previousId\" FROM \"Snapshot\" WHERE id = '$S2'")" = "$S1" ] || fail "snapshot 2 does not point at snapshot 1"
DELTA=$(epsql -d enigma_e2e -c "SELECT string_agg(kind || ':' || \"nctId\", ' ' ORDER BY kind) FROM \"SnapshotDelta\" WHERE \"snapshotId\" = '$S2'")
[ "$DELTA" = "ADDED:$HELD CHANGED:$CHANGED REMOVED:$REMOVED" ] || fail "delta was '$DELTA'"
echo "delta          $DELTA"
[ "$(epsql -d enigma_e2e -c "SELECT count(*) FROM raw_study WHERE \"snapshotId\" = '$S1'")" = "$RAW1" ] || fail "raw rows of snapshot 1 changed"
[ "$(epsql -d enigma_e2e -c "SELECT md5(string_agg(\"contentHash\", ',' ORDER BY \"nctId\")) FROM raw_study WHERE \"snapshotId\" = '$S1'")" = "$HASH1" ] || fail "raw content of snapshot 1 changed"
echo "raw layer      snapshot 1 unchanged ($RAW1 trials)"
if epsql -d enigma_e2e -c "DELETE FROM raw_study WHERE \"snapshotId\" = '$S1'" >/dev/null 2>&1; then fail "raw_study accepted a DELETE"; fi
echo "immutability   DELETE on raw_study rejected"
ALERTS=$(epsql -d enigma_e2e -c "SELECT string_agg(a.kind || ':' || w.name, ' | ' ORDER BY w.id, a.kind) FROM \"Alert\" a JOIN \"Watchlist\" w ON w.id = a.\"watchlistId\" WHERE a.\"snapshotId\" = '$S2' AND w.kind = 'TRIAL'")
case "$ALERTS" in
  *"TRIAL_ADDED:held-out trial"*"TRIAL_CHANGED:changed trial"*"TRIAL_REMOVED:removed trial"*) echo "alerts         $ALERTS" ;;
  *) fail "trial alerts were '$ALERTS'" ;;
esac
echo "endpoint watch $(epsql -d enigma_e2e -c "SELECT count(*) FROM \"Alert\" WHERE \"watchlistId\" = 'w4' AND \"snapshotId\" = '$S2'") alerts on HbA1c"
[ "$(epsql -d enigma_e2e -c "SELECT count(*) FROM \"Dossier\" d JOIN \"Contradiction\" c ON c.id = d.\"contradictionId\" WHERE d.\"snapshotId\" <> c.\"snapshotId\"")" = "0" ] || fail "a dossier points at another snapshot"
echo "dossiers       $(epsql -d enigma_e2e -c "SELECT \"snapshotId\" = '$S2', count(*) FROM \"Dossier\" GROUP BY 1 ORDER BY 1" | tr '\n' ' ')(t = snapshot 2)"
echo "PASS"
