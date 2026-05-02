# Claim Engine

Implementation of the pipeline described in [docs/CLAIM-ENGINE-PRD.md](../../docs/CLAIM-ENGINE-PRD.md).

## What it does

Reads every eligible card from `public.cards`, runs a 4-pass AI pipeline to generate working-style claims and score each card against each claim, then writes the results to `suspicion.claims` + `suspicion.claim_cards`. The game reads those tables at runtime.

Every claim is filtered through a **dual-hireability** test in Pass 2: both the "guilty" reading (the claim is true of Ashley) and the "not guilty" reading (the claim is false) must describe a hireable working-style trait a recruiter would respect. Character indictments — competence, integrity, ethics, basic professionalism — are rejected before they reach scoring. The game's surface text lives publicly next to Ashley's name; the seed must never produce text that paints her badly even when the player's verdict goes the other way.

## Passes

| Pass        | Role                                                        | Default model                   | Provider  | Reasoning                      |
| ----------- | ----------------------------------------------------------- | ------------------------------- | --------- | ------------------------------ |
| 1. Tensions | Find fault lines in the corpus                              | `claude-sonnet-4-6`             | Anthropic | adaptive thinking, effort=high |
| 2. Claims   | Generate dual-hireable working-style claims from tensions   | `gpt-5.4`                       | OpenAI    | reasoning_effort=medium        |
| 3. Score    | Rate ambiguity + surprise per card/claim pair               | `gpt-5.4-mini`                  | OpenAI    | reasoning_effort=low           |
| 4. Validate | Adversarial cross-check from a different vendor than Pass 2 | `gemini-3.1-flash-lite-preview` | Google    | thinkingLevel=low              |

Pass 4 must be a different vendor from Pass 2 — the point is cross-model pressure. Any other combination undermines the validation.

Any pass can use any provider. The client is resolved from the model name prefix (`claude-` → Anthropic, `gpt-` → OpenAI, `gemini-` → Google). Override defaults with `CLAIM_ENGINE_PASS{1,2,3,4}_MODEL` env vars.

## Run locally

```bash
cp .env.example .env   # fill in SUPABASE_*, ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
make seed-claims-dry   # dry run, prints results without writing
make seed-claims       # real run, wipes and replaces suspicion.claims
```

## Run on CI

Trigger `.github/workflows/seed-claims.yml` with `workflow_dispatch`. The workflow reads secrets from repo settings and supports a `dry_run` flag.

## Idempotency

Every real run calls `suspicion.replace_claim_seed(payload)`, a DB-side RPC that atomically deletes all existing claim data and inserts the new seed in a single transaction. Only claims that survive Pass 4 validation are included. If zero claims survive, the script aborts rather than wiping the existing seed.

## Tuning

See `config.ts` for thresholds:

- `CLAIM_ENGINE_GENERATE_CLAIMS` — how many candidate claims Pass 2 generates (default 15)
- `CLAIM_ENGINE_SELECT_CLAIMS` — how many Pass 3 selects for Pass 4 (default 5)
- `CLAIM_ENGINE_TOP_CARDS` — max cards kept per claim pool after Pass 3 scoring (default 50)
- `CLAIM_ENGINE_CARD_FLOOR` — combined `ambiguity+surprise` minimum for a card to count toward claim quality (default 3)
- `CLAIM_ENGINE_SCORE_BATCH` — cards per Pass 3 scoring API call (default 50)
- `CLAIM_ENGINE_MIN_TOTAL_CARDS` — Pass 4 survival floor: rewritten cards per claim (default 30)
- `CLAIM_ENGINE_MIN_ROOMS` — Pass 4 survival floor: distinct gameplay rooms that must be covered (default 5)

Pass 3 ranks claims by `rooms² × cardCount × avgScore`, where rooms is the count of gameplay rooms with at least one floor-cleared card. The quadratic room factor heavily rewards cross-category claims. The top `SELECT_CLAIMS` are sent to Pass 4.

A claim survives Pass 4 if it has at least `CLAIM_ENGINE_MIN_ROOMS` rooms covered (default 5) AND at least `CLAIM_ENGINE_MIN_TOTAL_CARDS` rewritten cards (default 30).
