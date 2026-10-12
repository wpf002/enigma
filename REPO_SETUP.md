# Enigma — Repo Setup

Run these before anything else.

## 1. Create the remote

On GitHub, create a new **private** repo under `wpf002` named `enigma`. Do not initialize with a README, .gitignore, or license — the bootstrap script provides them.

## 2. Run the bootstrap

```bash
cd ~/dev            # or wherever your projects live
bash bootstrap.sh   # creates ./enigma with full structure + installs
cd enigma
```

Then drop `README.md`, `ENIGMA_ROADMAP.md`, and this file into the repo root.

## 3. Initialize and push

```bash
git init
git branch -M main

git add .
git commit -m "chore: bootstrap Enigma monorepo

- pnpm 9 Turborepo workspace (apps/*, packages/*)
- apps: web (Next 14), api (Fastify 4), ingest (Node), engine (Python/FastAPI)
- packages: db (Prisma/Postgres 16), core, harmonize, provenance, shared
- Prisma schema skeleton: Snapshot, EffectRecord, ComparabilityEdge, Contradiction
- Docker compose: enigma + aact Postgres instances
- AACT restore script and env scaffolding"

git remote add origin git@github.com:wpf002/enigma.git
git push -u origin main
```

## 4. Branch protection

```bash
gh repo edit wpf002/enigma --enable-issues --enable-projects=false
gh api -X PUT repos/wpf002/enigma/branches/main/protection \
  -f required_status_checks='{"strict":true,"contexts":["typecheck","test"]}' \
  -F enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":0}' \
  -F restrictions=null
```

## 5. Phase branch convention

One branch per roadmap phase. Never work on `main`.

```bash
git checkout -b phase/0-bootstrap-ingestion
```

Phase branches merge to `main` only after their exit gate in `ENIGMA_ROADMAP.md` §7 is met and documented in the PR description.

## 6. Railway

```bash
railway login
railway init --name enigma
railway add --database postgres
```

Services to create (one per app, all from the same repo, distinct root directories):

| Railway service | Root dir | Start command |
|---|---|---|
| `enigma-api` | `apps/api` | `node dist/index.js` |
| `enigma-web` | `apps/web` | `next start` |
| `enigma-ingest` | `apps/ingest` | `node dist/index.js` |
| `enigma-engine` | `apps/engine` | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

Shared variables to set at the project level: `DATABASE_URL`, `AACT_DATABASE_URL`, `ENGINE_URL`, and the tuning constants from `.env.example`.

**Note on AACT:** the snapshot is large. Restore it locally first and work against local Postgres through Phase 3. Do not put the raw AACT restore on Railway until the normalization pipeline is stable and you know which subset you actually need.

## 7. First commit after setup

The first real work is Phase 0's exit gate: a full AACT restore reproducible from cold start in one command. Everything else waits.
