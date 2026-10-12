#!/usr/bin/env bash
# Cold start in one command: Postgres containers -> migrations -> AACT restore
# -> immutable raw layer + Snapshot record. This is the Phase 0 exit gate.
#
#   pnpm cold-start infra/aact/dumps/<snapshot>.dmp   full AACT dump (CTTI account)
#   pnpm cold-start --subset                          AACT-shaped subset from the public API
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -f .env ] || cp .env.example .env
set -a; . ./.env; set +a

ARG="${1:-}"
[ -z "$ARG" ] && { echo "usage: cold-start.sh <path-to-aact-dump> | --subset"; exit 1; }

echo "==> Postgres"
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --wait

echo "==> Build packages"
pnpm install --frozen-lockfile
pnpm build --filter='./packages/*'

echo "==> Migrations"
pnpm --filter @enigma/db run migrate:deploy

if [ "$ARG" = "--subset" ]; then
  echo "==> AACT subset from ClinicalTrials.gov API"
  pnpm ingest aact-subset
else
  echo "==> AACT restore"
  bash infra/aact/restore.sh "$ARG"
fi

echo "==> Raw layer"
pnpm ingest snapshot
