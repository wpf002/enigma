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

Needs Node 20+, pnpm 9, Docker, Python 3.11+ and `uv`.

```bash
git clone git@github.com:wpf002/enigma.git && cd enigma
pnpm install
cp .env.example .env          # change ENIGMA_PG_PORT / AACT_PG_PORT / WEB_PORT here if the defaults are taken
cd apps/engine && uv sync && cd ../..
```

Cold start in one command. It starts both Postgres containers, applies migrations, restores AACT and writes the immutable raw layer:

```bash
pnpm cold-start infra/aact/dumps/<snapshot>.dmp   # full AACT dump (free CTTI account)
pnpm cold-start --subset                          # no dump: same ctgov tables, filled from the public ClinicalTrials.gov API
```

Then run the services and the pipeline:

```bash
pnpm dev               # web, api and engine
pnpm ingest pipeline   # normalize -> harmonize -> gate -> contradict -> rank -> dossier -> alerts
```

| Service | Port |
|---|---|
| web | 3000 |
| api | 4000 |
| engine | 8100 |
| postgres (enigma) | 5432 |
| postgres (aact) | 5433 |

### Commands

| Command | What it does |
|---|---|
| `pnpm ingest <step>` | One pipeline step: `snapshot`, `normalize`, `harmonize`, `gate`, `contradict`, `rank`, `dossier`, `alerts` |
| `pnpm ingest gate-eval` | Phase 3 gate: recovery of a published review's included pairs |
| `pnpm ingest controversy-eval` | Phase 4 gate: documented controversies surfaced |
| `pnpm ingest audit-sample` | Phase 2 gate: 200 harmonization decisions as a CSV for clinician review |
| `pnpm ingest export-dossiers --top 5` | Phase 5 gate: top dossiers as Markdown for an expert read |
| `pnpm test` | Unit tests: TypeScript packages, API, and the engine (`pytest`) |
| `pnpm test:e2e` | Snapshot delta and watchlist alerts, end to end, in scratch databases |

Every step clears and rebuilds its own derived rows. The raw layer is never modified: its tables reject UPDATE, DELETE and TRUNCATE.

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

v1 (roadmap Phases 0 to 6) is built. Most exit gates are not met or not run yet. The app reports them live under **Validation**.

| Phase | Exit gate | Status on the first corpus (1,793 type 2 diabetes trials) |
|---|---|---|
| 0 Ingestion | Cold start in one command | Partial. `pnpm cold-start --subset` reproduces the same checksum from empty volumes. Not yet run against a CTTI dump. |
| 1 Normalization | 95% of trials yield an effect record; conversions round-trip | Not met. 58% of all trials, 73% of parallel multi-arm trials. Round-trip passes on the 500-record fixture. |
| 2 Harmonization | Clinician audit of 200 decisions | Not run. All 45 rules are marked `PENDING_HUMAN_REVIEW`. |
| 3 Gate | Recover 85% of a review's included pairs | Not met. The two review fixtures pool across agents of a class, which the gate rejects by design. |
| 4 Contradictions | Surface 12 of 20 documented controversies | Not met. 0 of the 9 listed. |
| 5 Dossiers | Expert rates 4 of 5 "would investigate" | Not run. |
| 6 Web | Search to dossier in under 60 seconds | Not timed with a user. |

Known limits:

- The first snapshot is an API subset in AACT's table shape, labelled `CTGOV_API_SUBSET`. The loader has not been run against a real AACT dump.
- Harmonization rules, the review registry (`fixtures/reviews`) and the controversy list were drafted with LLM help and are unreviewed.
- A placebo arm that switches to active treatment in an extension period is not detected, so late-visit comparisons from such trials can appear as contradictions.
- C3 requires `|z| > 1.96` on the difference, which is stricter than roadmap §5. Pairwise tests are held to a 5% false discovery rate.

See `ENIGMA_ROADMAP.md` for phase gates and exit criteria.

---

## License

Private.
