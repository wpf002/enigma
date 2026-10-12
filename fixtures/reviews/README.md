# Review fixtures

Published reviews used for two things:

1. `pnpm ingest gate-eval` — the Phase 3 exit gate. Checks how many pairs among
   a review's included studies the comparability gate recovers.
2. `already_resolved` in the diagnostic value ranking. A contradiction a
   published review already covers is ranked down.

Every entry is `PENDING_HUMAN_REVIEW`. The NCT IDs were checked against the
registry on 2026-10-11. Citations and conclusions were written from memory of
the papers and need to be checked against the source before anyone relies on
them. None of the three lists excluded studies, so the "rejects >= 90% of
excluded pairs" half of the gate cannot be evaluated yet. To evaluate it, add a
Cochrane review with both `includedNctIds` and `excludedNctIds`.

`pooling` says what the review pooled across: `AGENT` (one drug) or
`AGENT_CLASS` (a drug class). Enigma's gate requires the same agent, so a
class-level review's pairs fail the intervention dimension by design. The
evaluation reports recovery both ways.
