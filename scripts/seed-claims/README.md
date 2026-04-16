# Claim Engine

Implementation of the pipeline described in [docs/CLAIM-ENGINE-PRD.md](../../docs/CLAIM-ENGINE-PRD.md).

## What it does

Reads every eligible card from `public.cards`, runs a 4-pass AI pipeline to generate provocative claims and score each card against each claim, then writes the results to `suspicion.claims` + `suspicion.claim_cards`. The game reads those tables at runtime.

## Passes

| Pass | Role | Default model | Provider |
|---|---|---|---|
| 1. Tensions | Find fault lines in the corpus | `gpt-5.2` | OpenAI |
| 2. Claims | Generate provocative claims from tensions | `gemini-3.1-pro-preview` | Google |
| 3. Score | Rate ambiguity + surprise per card/claim pair | `claude-haiku-4-5` | Anthropic |
| 4. Validate | Adversarial cross-check from a different vendor than Pass 2 | `gpt-5-mini` | OpenAI |

Pass 4 must be a different vendor from Pass 2 — the point is cross-model pressure. Anything other combination undermines the validation.

Override any model with `CLAIM_ENGINE_PASS{1,2,3,4}_MODEL` env vars.

## Run locally

```bash
cp .env.example .env   # fill in SUPABASE_*, ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
make seed-claims-dry   # dry run, prints results without writing
make seed-claims       # real run, wipes and replaces suspicion.claims
```

## Run on CI

Trigger `.github/workflows/seed-claims.yml` with `workflow_dispatch`. The workflow reads secrets from repo settings and supports a `dry_run` flag.

## Idempotency

Every real run truncates `suspicion.claim_cards` then `suspicion.claims` (FK order) and inserts fresh rows. Only claims that survive Pass 4 validation are written. If zero claims survive, the script aborts rather than wiping the existing seed.

## Tuning

See `config.ts` for thresholds:

- `CLAIM_ENGINE_TARGET_CLAIMS` — how many claims to generate (default 5)
- `CLAIM_ENGINE_AMBIGUITY_THRESHOLD` — Pass 3 cutoff (default 2)
- `CLAIM_ENGINE_SURPRISE_THRESHOLD` — Pass 3 cutoff (default 3)
- `CLAIM_ENGINE_MIN_CARDS_PER_ROOM` — Pass 4 coverage minimum (default 4)
- `CLAIM_ENGINE_MIN_TOTAL_CARDS` — Pass 4 total minimum (default 30)

A card is eligible for a claim if `ambiguity ≥ threshold OR surprise ≥ threshold`. A claim survives validation if every gameplay room has at least `MIN_CARDS_PER_ROOM` surviving cards AND the total is at least `MIN_TOTAL_CARDS`.
