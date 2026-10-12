# Enigma

**A contradiction engine for structured clinical evidence.**

Enigma finds pairs of trials whose measured results cannot both be true — and proves the pair was comparable before it makes the claim.

---

## Why

Most apparent contradictions in the clinical literature are artifacts: different endpoints, different populations, different dosing, different follow-up windows, different analysis populations. Existing citation-intelligence tools classify *rhetorical* disagreement — they read the sentence in which one paper cites another and decide whether it sounds like a conflict. That measures what authors wrote about each other, not whether the numbers conflict.

Enigma measures the numbers, and refuses to compare anything that fails a comparability gate.

The output is not a list of interesting questions. It is a contradiction with citations, a comparability proof, and a named discriminating variable.

---

## What it does

- Ingests the AACT snapshot of ClinicalTrials.gov — interventional trials with posted summary results
- Normalizes every result into a typed `EffectRecord` with resolved direction convention and unified effect measure
- Harmonizes endpoints, populations, interventions, and dosing against a versioned ontology
- Scores pairwise comparability across eight dimensions, taking the **minimum**, never the mean
- Classifies statistical incompatibility (C1–C5) only on pairs that clear the gate
- Ranks by diagnostic value — how much resolving the conflict would change
- Emits a dossier with the full `Factor[]` provenance chain behind every score

---

## Architecture

```
apps/
  web/      Next.js 14 — dossier viewer, contradiction map, evidence timeline
  api/      Fastify 4 — read API over the claim store
  ingest/   Node worker — AACT sync + normalization pipeline
  engine/   Python FastAPI — comparability scoring + incompatibility testing
packages/
  db/          Prisma + Postgres 16
  core/        Effect-size types, unit algebra, direction conventions
  harmonize/   Ontology + versioned rule registry
  provenance/  Factor[] chain builder
  shared/      Cross-cutting types, config, errors
```

TypeScript orchestrates. Python computes. Statistical tests live in exactly one place.

---

## Quick start

```bash
git clone git@github.com:wpf002/enigma.git && cd enigma
pnpm install
docker compose -f infra/docker/docker-compose.yml up -d
cp .env.example .env
pnpm db:migrate

# AACT snapshot (free CTTI account required for the dump)
pnpm aact:restore infra/aact/dumps/<snapshot>.dmp

# Python engine
cd apps/engine && uv sync && cd ../..

pnpm dev
```

| Service | Port |
|---|---|
| web | 3000 |
| api | 4000 |
| engine | 8100 |
| postgres (enigma) | 5432 |
| postgres (aact) | 5433 |

---

## Locked invariants

Never "fix" these. See `ENIGMA_ROADMAP.md` §2 for the full list and rationale.

1. Gate first, always. No contradiction is emitted without passing the comparability gate.
2. Comparability failure is a product, not an error.
3. Every contradiction carries a full `Factor[]` provenance chain.
4. Effect sizes are structs, never bare floats.
5. Direction convention is resolved at ingest.
6. Enigma never says a result is wrong — only that two results cannot both hold under stated conditions.
7. Terminated and null trials are first-class.
8. Statistical math lives only in the Python engine.
9. Every dossier records the AACT snapshot it was computed against.
10. No LLM output enters the claim store.

---

## Output grammar

Enforced at the type level. Enigma emits:

> **A** and **B** cannot both hold under conditions **C**. The discriminating variable is **D**.

It does not emit clinical recommendations, treatment guidance, or judgments about which trial is correct.

---

## Status

Phase 0 — bootstrap and ingestion.

See `ENIGMA_ROADMAP.md` for phase gates and exit criteria.

---

## License

Private.
