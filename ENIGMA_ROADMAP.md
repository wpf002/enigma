# ENIGMA — Roadmap

**A contradiction engine for structured clinical evidence.**

Enigma finds pairs of trials whose measured results cannot both be true — and proves the pair was comparable before it makes the claim.

---

## 0. The Thesis

The scientific literature is full of apparent contradictions. Almost all of them are artifacts: different populations, different endpoints, different dosing, different follow-up windows, different analysis populations (ITT vs. per-protocol). The genuine contradictions — where two comparable trials measured the same thing in the same kind of people and got statistically incompatible answers — are rare, high-value, and currently invisible.

Existing tools classify *rhetorical* disagreement: they read the sentence in which paper B cites paper A and decide whether it sounds like disagreement. That measures what authors wrote about each other. It does not measure whether the numbers conflict.

Enigma measures the numbers, and refuses to compare anything that fails a comparability gate.

### Why this is defensible

The moat is not the contradiction detector. Statistical incompatibility testing is textbook. The moat is **the comparability gate and its provenance record** — the normalization layer that decides two results are commensurable, and can show its work line by line. That layer is:

- Expensive to build (endpoint harmonization, population encoding, effect-size unification)
- Boring to build (no demo appeal, months of ontology work)
- Compounding (every harmonization rule added makes every future comparison better)
- Verifiable (you can red-team it against Cochrane reviews with known conclusions)

Competitors are optimizing for coverage and recall. Enigma optimizes for *the right to make a claim*.

### Who pays

In order of proximity:

1. **Evidence synthesis teams** — HTA bodies, guideline committees, Cochrane groups. They do this work manually at ~6–18 months per review.
2. **Pharma medical affairs / HEOR** — need to know where their asset's evidence base conflicts before a regulator or a competitor finds it.
3. **Payers and formulary committees** — comparative effectiveness decisions where the evidence is contested.
4. **Med-legal / regulatory consultancies** — contradiction dossiers as an artifact.

Not researchers. Researchers do not pay.

---

## 1. Locked v1 Scope

**IN:**

- Ingest AACT (Aggregate Analysis of ClinicalTrials.gov) Postgres snapshot
- Interventional trials, `COMPLETED` or `TERMINATED`, with posted summary results
- Extract normalized effect records from structured `outcome_measures` + `outcome_analyses`
- Harmonize endpoints, populations, interventions, and dosing into a comparability schema
- Comparability gate: pairwise commensurability scoring with explicit failure reasons
- Contradiction engine: statistical incompatibility across comparable pairs
- Diagnostic value ranking
- Contradiction dossier output with full provenance chain
- Read-only web UI: contradiction map, evidence timeline, dossier viewer

**OUT of v1 (explicitly deferred):**

- PubMed / abstract-level LLM extraction (Phase 7)
- Bridge Finder / interdisciplinary connections (Phase 8)
- Paradigm shift detection (probably never — unfalsifiable at current scale)
- Funding recommendations (never — no authority to make them)
- Hypothesis generation (Phase 9, gated on contradiction engine precision)
- Experiment design suggestions (Phase 9)
- Expert annotation panels / governance boards (requires users; premature)
- Anything that "generates important questions" as a list

**The v1 deliverable is not a question list. It is a contradiction with citations, a comparability proof, and a named discriminating variable.**

---

## 2. Locked Invariants

These are architectural commitments. Never "fix" them.

1. **No contradiction is emitted without passing the comparability gate.** Gate first, always. A pair that fails the gate produces a `ComparabilityFailure` record, not silence.
2. **Comparability failure is a product, not an error.** "These 40 trials look like they disagree but are measuring four different endpoints" is a valuable output. Surface it.
3. **Every emitted contradiction carries a `Factor[]` provenance chain** — same pattern as Fray. Every score, every normalization step, every threshold that fired, in order, with its input values.
4. **Effect sizes are structs, never floats.** `{ measure, value, ci_low, ci_high, n, dispersion_type, direction_convention }`. A bare number is never stored or passed.
5. **Direction convention is explicit and normalized at ingest.** Half of all false contradictions come from sign errors on outcomes where lower-is-better.
6. **Enigma never says a result is wrong.** It says: *"A and B cannot both hold under conditions C. The discriminating variable is D."* Output grammar is enforced at the type level.
7. **Null and terminated trials are first-class.** Terminated-for-futility is signal, not missing data.
8. **Statistical tests are computed in Python, never reimplemented in TypeScript.** One source of truth for the math.
9. **Snapshot-versioned.** Every dossier records the AACT snapshot ID it was computed against. Results must be reproducible against a frozen corpus.
10. **No LLM output enters the claim store in v1.** LLMs assist harmonization rule *authoring*, reviewed by a human, and never write records directly.

---

## 3. Architecture

```
apps/
  web/          Next.js 14 — dossier viewer, contradiction map, evidence timeline
  api/          Fastify 4 — REST/tRPC over the claim store
  ingest/       Node worker — AACT snapshot sync, normalization pipeline
  engine/       Python FastAPI — comparability scoring + statistical incompatibility
packages/
  db/           Prisma schema + client (Postgres 16)
  core/         Effect-size types, direction conventions, unit algebra
  harmonize/    Endpoint/population/intervention ontology + rule registry
  provenance/   Factor[] chain builder and serializer
  shared/       Cross-cutting types, config, errors
```

**Why the Python service:** effect-size conversion, heterogeneity statistics (I², Q, τ²), and incompatibility testing need `scipy` / `statsmodels`. Same convention as Prophet. TypeScript orchestrates; Python computes.

### Data flow

```
AACT snapshot
  → raw_study / raw_outcome_measure / raw_outcome_analysis  (verbatim, immutable)
  → EffectRecord         (normalized, unit-resolved, direction-corrected)
  → HarmonizedEndpoint   (mapped to endpoint ontology)
  → PopulationProfile    (encoded eligibility + baseline characteristics)
  → ComparabilityEdge    (pairwise, scored, with failure reasons)
  → Contradiction        (only for edges above gate threshold)
  → Dossier              (ranked, provenance-complete, human-readable)
```

Raw tables are never mutated. Every downstream layer is derivable from raw + rule version. Rebuild is always possible.

---

## 4. The Comparability Gate

The core of the system. A pair of effect records is comparable only if all dimensions clear their threshold:

| Dimension | Check | Failure mode it catches |
|---|---|---|
| Endpoint | Same harmonized endpoint node, or ancestor within N hops | "Mortality" vs "cardiovascular mortality" |
| Measure type | Same effect measure class after conversion | Hazard ratio vs risk difference |
| Population | Encoded eligibility overlap ≥ threshold | Treatment-naive vs refractory |
| Intervention | Same agent, dose within equivalence band | 5mg vs 40mg |
| Comparator | Same comparator class | Placebo vs active control |
| Timepoint | Follow-up window overlap | 12-week vs 5-year outcomes |
| Analysis population | ITT vs per-protocol vs mITT | Silent attrition differences |
| Direction | Normalized convention resolved | Sign inversion |

Gate score is the **minimum** across dimensions, not the mean. One hard failure kills the comparison. Averaging is how you get confident nonsense.

Each dimension emits a `Factor` with its input values, the rule that fired, and the resulting score.

---

## 5. Contradiction Classification

Only computed on pairs that pass the gate.

- **C1 — Direction conflict.** Effects point opposite directions, both CIs exclude null.
- **C2 — Magnitude incompatibility.** Same direction, non-overlapping CIs, difference exceeds pooled uncertainty.
- **C3 — Null/effect conflict.** One trial's CI excludes null, the other's excludes the first's point estimate.
- **C4 — Heterogeneity anomaly.** Within a comparable cluster, I² exceeds threshold with no identifiable moderator.
- **C5 — Temporal reversal.** A comparable cluster's pooled estimate crosses null over calendar time.

Each type gets a distinct severity function. C1 and C3 are the high-value ones. C4 is the one that finds things humans miss.

---

## 6. Diagnostic Value Ranking

Contradictions are ranked by how much resolving them would change something, not by how dramatic they look.

```
diagnostic_value =
    0.30 * gate_confidence          # how sure are we they're comparable
  + 0.25 * severity                 # statistical magnitude of the conflict
  + 0.20 * cluster_weight           # patients affected across the cluster
  + 0.15 * unexplained_residual     # remaining after known moderators
  + 0.10 * discriminability         # is there a named variable that would resolve it
  - 0.30 * already_resolved         # does a published review already explain this
```

`already_resolved` is a heavy negative and must be built early. The fastest way to lose credibility is to breathlessly surface a contradiction that Cochrane settled in 2019.

---

## 7. Phases

### Phase 0 — Bootstrap & Ingestion
- Monorepo scaffold, Prisma schema, Railway services
- AACT snapshot loader (full Postgres restore + delta sync)
- Raw table population, immutable, snapshot-versioned
- **Gate:** full AACT restore reproducible from a cold start in one command

### Phase 1 — Effect Normalization
- `@enigma/core` effect-size types and unit algebra
- Direction convention resolution
- Effect measure conversion (OR ↔ RR ↔ RD, HR handling, SMD)
- Parse `outcome_analyses` into `EffectRecord`
- **Gate:** ≥95% of results-posted trials yield at least one valid `EffectRecord`; conversion round-trips within tolerance on a 500-record fixture

### Phase 2 — Harmonization Ontology
- Endpoint ontology, seeded from MeSH + trial outcome text clustering
- Population encoder from eligibility criteria + baseline characteristics
- Intervention/dose equivalence bands
- Rule registry with versioning
- **Gate:** manual audit of 200 harmonization decisions at ≥90% agreement with a clinician reviewer

### Phase 3 — Comparability Gate
- Pairwise scoring across all eight dimensions
- `ComparabilityEdge` materialization with candidate blocking (never all-pairs)
- Failure reason taxonomy
- **Gate:** on a Cochrane review with a known included-studies list, the gate recovers ≥85% of the included pairs and rejects ≥90% of excluded ones

### Phase 4 — Contradiction Engine
- Python service: C1–C5 classification
- Severity functions, heterogeneity statistics
- `already_resolved` detection against published reviews
- **Gate:** on 20 documented literature controversies, Enigma independently surfaces ≥12 without seeding

### Phase 5 — Ranking & Dossiers
- Diagnostic value scoring
- Dossier generation: contradiction, comparability proof, provenance chain, discriminating variable, cluster context
- Export to PDF/Markdown
- **Gate:** a domain expert reads five dossiers cold and rates ≥4 as "would investigate"

### Phase 6 — Web Surface
- Contradiction map (cluster graph, gate-pass edges only)
- Evidence timeline per harmonized endpoint
- Dossier viewer with expandable provenance
- Watchlists + alerts on new AACT deltas
- **Gate:** end-to-end from search to dossier in under 60 seconds

### Phase 7 — Literature Layer *(post-v1)*
- PubMed/PMC open-access ingestion
- LLM-assisted effect extraction from abstracts, human-gated before entering the claim store
- Reconciliation against registered results (publication bias detection is a *free byproduct* here — registered-but-unpublished and published-differently-than-registered both fall out of this layer)

### Phase 8 — Bridge Finder *(post-v1)*
- OpenAlex citation graph
- Structural isomorphism + low co-citation search
- Only after Phase 4 precision is established. Novelty search without a precision baseline produces infinite plausible garbage.

### Phase 9 — Hypothesis & Experiment Layer *(gated)*
- Discriminating experiment design from unresolved contradictions
- Gated on: contradiction engine precision ≥0.8 measured against expert review

---

## 8. What Kills This

Named up front so they're monitored, not discovered.

| Risk | Mitigation |
|---|---|
| Harmonization is a bottomless pit | Single therapeutic area for v1. Depth before breadth. |
| Gate too strict → nothing comparable, zero output | Tune against Cochrane included-study sets, not intuition |
| Gate too loose → confident nonsense, credibility gone | Min-across-dimensions, never mean. Ship strict. |
| Surfacing already-known contradictions | `already_resolved` is a Phase 4 requirement, not a nice-to-have |
| Only ~1/3 of trials post results | Accept it. v1 is a high-precision tool on a bounded corpus, not a census. |
| Clinical liability framing | Output grammar is enforced: never "X is wrong," always "A and B cannot both hold." No clinical recommendations, ever. |
| Building for researchers who don't pay | Design the dossier for HTA/medical affairs from Phase 5 forward |

---

## 9. First Therapeutic Area

Pick one for v1. Criteria: dense trial coverage, structured endpoints, active controversy, paying audience.

Recommended: **type 2 diabetes cardiovascular outcomes** — hundreds of results-posted trials, standardized MACE endpoints, well-documented historical controversies (rosiglitazone) that provide a ground-truth validation set, and an audience that already funds evidence synthesis.

Alternates: heart failure with preserved ejection fraction; major depressive disorder (endpoint chaos makes the comparability gate shine, but the ground truth is muddier).
