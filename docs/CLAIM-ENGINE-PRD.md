# Claim Engine — Product Specification

**Status:** Draft v2
**Date:** 2026-04-23
**Author:** Ashley Childress + Claude (spec collaboration)
**Parent:** [PRD.md](PRD.md) (Architect of Suspicion game spec)

---

## Overview

The Claim Engine is a batch pipeline that generates claims and curates card-claim pairings for Architect of Suspicion. It runs outside the game runtime — triggered manually or via GitHub Actions — and writes its output to Supabase tables that the game reads at runtime.

The game PRD defines claims as static and hand-curated (v1) with AI-generated claims deferred to v2. The Claim Engine replaces both versions with a single system: AI analyzes the full card corpus, generates claims that maximize gameplay tension, and scores every card-claim pairing for ambiguity and surprise potential.

This is not a runtime service. It produces data. The game consumes it.

## Problem

The cards in `public.cards` are written in documentary voice — factual titles, neutral blurbs. They describe real career decisions accurately but don't naturally provoke the "proof or objection?" instinct the game needs. A card titled "BiT nomination for Lucille" with a blurb about cross-functional leadership doesn't create tension against a claim like "Ashley depends on AI too much." The connection is too abstract for a player to feel conflict.

Hand-curating claims (game PRD v1) doesn't scale and can't guarantee coverage across all 8 gameplay rooms. The cards themselves can't be rewritten — `public.cards` is read-only and serves other systems.

The solution: don't change the cards in `public.cards`. Instead, generate claim-specific rewrites of the player-facing blurbs and store them alongside scored card-claim pairings. The game reads these rewrites at runtime — not the original blurbs.

## Pipeline Design

### Principles

1. **`public.cards` is read-only.** The pipeline reads from it, never writes to it. Claim-specific rewrites live in `suspicion.claim_cards.rewritten_blurb`.
2. **`fact` never reaches the client at runtime.** The seed pipeline uses `fact` as raw material to craft rewrites; the runtime API returns only `rewritten_blurb`. The invariant is preserved at the API boundary, not the pipeline boundary.
3. **Claims are generated from card data, not invented.** Every claim must be grounded in tensions that actually exist in the corpus.
4. **Different AI models for different passes.** Each pass has different cognitive demands — creative generation, structured scoring, claim-specific rewriting. Using different models per pass avoids self-confirmation bias.
5. **Scores are pre-graded at seed time.** Ambiguity and surprise scores are computed in Pass 3 and stored in `claim_cards`. The runtime uses them for card dealing weights — no AI calls at runtime.
6. **Output is deterministic once written.** The game reads static crossref data. No AI calls for card dealing or claim selection.
7. **Run frequency: monthly or on card corpus changes.** Not per-session, not per-deploy.

### Pass 1: Tension Analysis

**Input:** Full card corpus from `public.cards` (all fields including `fact`).

**Task:** Identify fault lines in the portfolio — places where the same evidence can be read two contradictory ways, where career decisions contain inherent tension, where themes across categories conflict with each other.

**Output:** A tension map — not claims yet, but raw material. Themes, contradictions, ambiguities. Examples:

- "Speed vs. quality appears across Experimentation (fast iteration) and Constraints (testing gaps)"
- "Leadership recognition in Awards contradicts independence signals in Work Style"
- "Philosophy cards about restraint could read as strategic thinking OR risk aversion"

**Model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`) with adaptive thinking (effort=high).

### Pass 2: Claim Generation

**Input:** Tension map from Pass 1 + full card corpus.

**Task:** Generate 15 candidate claims that maximize the number of cards sitting on a fault line. A good claim:

- Creates genuine ambiguity for cards across **multiple rooms** (not just one category)
- Is specific enough to evaluate against individual cards
- Is framed as an accusation that a reasonable person could argue either way
- Doesn't require domain expertise to understand

Casting wide here is intentional — Pass 3 will rank and select the best 5.

**Output:** 15 candidate claims. For each: the claim text, a rationale citing
the tensions targeted, and **two hireable readings** — `guilty_reading` and
`not_guilty_reading` — each one sentence describing the working-style trait a
hiring manager would respect under that verdict. Both readings are persisted
to `suspicion.claims` so the runtime cover letter prompt can anchor on the
verdict-matching trait instead of inventing one from claim text alone.

**Model:** GPT 5.4 (`gpt-5.4`) with reasoning_effort=medium. Different provider than Pass 1 (Anthropic) — broadens model diversity across the pipeline.

### Pass 3: Card-Claim Scoring + Claim Ranking

**Input:** 15 candidate claims from Pass 2 + full card corpus (signal > 2, category ≠ 'About').

**Task:** For each claim × card pair, score on two axes:

- **Ambiguity (1-5):** How genuinely torn would a player be when classifying this card against this claim from title + blurb alone? A 5 means both classifications are equally defensible. A 1 means the answer is obvious.
- **Surprise (1-5):** How likely is the full `fact` to contradict the player's gut read? A 5 means the player will almost certainly be wrong. A 1 means the fact confirms the surface impression.

Cards are scored in batches (50 cards/call). Cards below the combined floor (ambiguity + surprise < 3) are dropped. The remaining cards are sorted by combined score and the top 50 are kept as the claim's pool. This makes pools claim-specific — the same card may rank in the top 50 for one claim and not another.

**Claim ranking:** Claims are ranked by `rooms² × cardCount × avgScore`. The quadratic room factor rewards claims whose top-50 pool spans all 7 gameplay rooms. The top 5 ranked claims advance to Pass 4.

**Output:** Scored card pools (keyed by claim) + top 5 claims selected for rewriting.

**Model:** GPT 5.4 Mini — cheap and fast for bulk structured scoring.

### Pass 4: Claim-Specific Card Rewriting

**Input:** Top 5 claims from Pass 3 + their claim-specific card pools + full card data (title, blurb, fact).

**Task:** For each claim × card pair, write a player-facing blurb that creates genuine tension against the specific claim. The model has access to title, blurb, and fact — it synthesizes all three to craft a richer description that a player cannot clearly classify as proof or objection.

Rewriting rules:

- Draw from title, blurb, and fact freely as raw material
- Do not fabricate anything not present in those fields
- Do not make the classification obvious — both readings must remain defensible
- Tension must be specific to this claim, not generic
- Match original blurb length and register

The model also produces a one-sentence proof and one-sentence objection per card (grounded in fact) to inform the rewrite framing. These are not stored.

**Survival floor:** A claim survives if its pool has ≥ 30 rewritten cards (`CLAIM_ENGINE_MIN_TOTAL_CARDS`) covering ≥ 5 gameplay rooms (`CLAIM_ENGINE_MIN_ROOMS`). This is a playability minimum — Pass 3 ranking handles quality selection. Claims that pass are written to Supabase; claims that fail are dropped for this run.

**Output:** For each surviving claim: `rewritten_blurb` for every card in its pool. Stored in `suspicion.claim_cards.rewritten_blurb` — this is the text the player sees at runtime, not `public.cards.blurb`.

**Model:** Gemini Flash Lite. Different provider than Passes 1-2 (Anthropic) — avoids self-confirmation bias on rewrite framing.

## Data Model

### New Tables (in `suspicion` schema)

```sql
CREATE TABLE suspicion.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_text text NOT NULL,
  rationale text,
  -- Hireable working-style trait the verdict surfaces. Both required so the
  -- runtime cover letter prompt always has a verdict-matching anchor.
  guilty_reading text NOT NULL CHECK (length(btrim(guilty_reading)) > 0),
  not_guilty_reading text NOT NULL CHECK (length(btrim(not_guilty_reading)) > 0),
  room_coverage smallint NOT NULL,
  total_eligible_cards smallint NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE suspicion.claim_cards (
  claim_id uuid NOT NULL REFERENCES suspicion.claims(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.cards("objectID") ON DELETE RESTRICT,
  ambiguity smallint NOT NULL CHECK (ambiguity BETWEEN 1 AND 5),
  surprise smallint NOT NULL CHECK (surprise BETWEEN 1 AND 5),
  rewritten_blurb text NOT NULL,  -- claim-specific player-facing text; replaces public.cards.blurb at runtime
  PRIMARY KEY (claim_id, card_id)
);
```

The two reading columns are populated by Pass 2 (the model already produces
them as part of the dual-hireability self-check) and consumed by the runtime
cover letter prompt — see PRD.md §"Cover Letter" and AGENTS.md Invariant #12.
The `replace_claim_seed` RPC enforces non-empty values on every insert.

### Impact on Game Runtime

The game PRD's `/api/cards` endpoint changes from querying `public.cards` directly to joining through `suspicion.claim_cards`. The key change: `rewritten_blurb` replaces `blurb` in the response — `fact` is never included.

```sql
SELECT c."objectID", c.title, cc.rewritten_blurb AS blurb, c.category,
       cc.ambiguity, cc.surprise
FROM public.cards c
JOIN suspicion.claim_cards cc ON c."objectID" = cc.card_id
WHERE cc.claim_id = :claim_id
  AND c."objectID" NOT IN (:exclude)
ORDER BY <dealing_weight(cc.ambiguity, cc.surprise, :pick_count)> LIMIT 6
```

The `signal > 2` filter and `category ≠ 'About'` filter move to seed time (Pass 3 input filter) — if a card made it into `claim_cards`, it's already been vetted. The runtime query needs no signal filter.

### Card Dealing Strategy

The `claim_cards` ambiguity and surprise scores enable smarter dealing than pure random. The dealing algorithm can weight card selection based on gameplay progression:

- **Early in session (0-3 picks):** Favor high-ambiguity cards. Ease the player in — both classifications should feel valid. Builds confidence that the game is fair.
- **Mid session (4-7 picks):** Mix ambiguity and surprise. Some cards confirm the player's instincts, some don't.
- **Late session (8+ picks):** Favor high-surprise cards. The Architect's reactions increasingly challenge the player's assumptions. Drives toward a verdict decision.

This curve is implemented in the `/api/cards` query (ORDER BY weighting), not in the seed pipeline. The pipeline just provides the scores.

## Execution

### Where It Runs

The seed pipeline is a standalone script directory in the game repo (`scripts/seed-claims/`), entry point `index.ts`. It is not a deployed service. Execution options:

1. **Local:** `make seed-claims` or `pnpm tsx scripts/seed-claims/index.ts` from developer machine
2. **GitHub Actions:** Manual `workflow_dispatch` trigger, runs the same script on a GHA runner

Both paths write directly to Supabase via service role key.

### Configuration

```
# Required
SUPABASE_URL=<project url>
SUPABASE_SECRET_KEY=<service role key>

# Model API keys (all required when using default model assignments)
ANTHROPIC_API_KEY=<key>
OPENAI_API_KEY=<key>
GEMINI_API_KEY=<key>

# Model assignment per pass (defaults shown)
CLAIM_ENGINE_PASS1_MODEL=claude-sonnet-4-6      # Tension analysis
CLAIM_ENGINE_PASS2_MODEL=gpt-5.4                # Claim generation
CLAIM_ENGINE_PASS3_MODEL=gpt-5.4-mini          # Card-claim scoring + ranking
CLAIM_ENGINE_PASS4_MODEL=gemini-3.1-flash-lite-preview  # Claim-specific rewriting

# Pipeline tuning (defaults shown)
CLAIM_ENGINE_GENERATE_CLAIMS=15      # Pass 2 candidate count
CLAIM_ENGINE_SELECT_CLAIMS=5         # Pass 3 top-N to rewrite
CLAIM_ENGINE_TOP_CARDS=50            # Max cards per claim pool (Pass 3)
CLAIM_ENGINE_CARD_FLOOR=3            # Min ambiguity+surprise to stay in pool
CLAIM_ENGINE_SCORE_BATCH=50          # Cards per Pass 3 scoring call
CLAIM_ENGINE_MIN_TOTAL_CARDS=30      # Survival floor: rewritten cards per claim
CLAIM_ENGINE_MIN_ROOMS=5             # Survival floor: distinct rooms per claim
CLAIM_ENGINE_DRY_RUN=false           # Log output without writing to Supabase
```

### GitHub Actions Workflow

The canonical workflow is `.github/workflows/seed-claims.yml`. Trigger it manually via `workflow_dispatch` with optional inputs:

- `target_claims` — number of candidate claims Pass 2 generates (maps to `CLAIM_ENGINE_GENERATE_CLAIMS`, default 5 in the workflow)
- `dry_run` — when true, logs output without writing to Supabase

### Run Cadence

- **On card corpus changes:** When new cards are added to `public.cards` or existing cards are materially updated
- **Monthly (approximate):** As part of project maintenance, re-evaluate whether current claims still produce good gameplay
- **Not automated on a schedule.** This is a deliberate, human-triggered process.

### Idempotency

Each run produces a fresh set of claims and crossref data. The script:

1. Reads all current cards from `public.cards`
2. Runs the 4-pass pipeline
3. Calls `suspicion.replace_claim_seed(payload)` — a DB-side RPC that atomically deletes all existing claim data and inserts the new seed in a single transaction

Previous claims are not preserved. The game always uses whatever the latest seed produced.

## Cost Estimate

For a corpus of ~258 eligible cards, 15 candidate claims, 5 selected for rewriting:

| Pass                      | Model             | Calls                  | Cost (est.)             |
| ------------------------- | ----------------- | ---------------------- | ----------------------- |
| Pass 1: Tension analysis  | Claude Sonnet     | 1                      | ~$0.50                  |
| Pass 2: Claim generation  | GPT 5.4           | 1                      | ~$0.50                  |
| Pass 3: Scoring (batched) | GPT 5.4 Mini      | 15 claims × ~6 batches | ~$1.00-2.00             |
| Pass 4: Rewriting         | Gemini Flash Lite | 5 claims × 50 cards    | ~$0.50-1.00             |
| **Total**                 |                   | **~100**               | **~$2.50-4.00 per run** |

Pass 3 dominates call count (batched scoring) but uses the cheapest model. Pass 4 output is large (~16K tokens per claim) but Gemini Flash Lite is inexpensive.

## Relationship to Game PRD

This PRD supersedes the following sections of the game PRD:

- **Claims System > V1: Static Claims** — replaced by AI-generated claims from this pipeline
- **Claims System > V2: AI-Generated Claims** — this IS the implementation, no longer deferred

The game PRD's card retrieval strategy, `/api/cards` endpoint, and data model sections should be updated to reference `suspicion.claims` and `suspicion.claim_cards` once this pipeline is implemented.

All other game PRD sections (Architect persona, room map, scoring, verdict, cover letter, resume) are unaffected.

## Decided

1. **Claim expiry:** No version/generation number on claims — stale detection not needed given manual trigger cadence.
2. **Partial re-seed:** Full replacement always. Pipeline overwrites all claims each run.
3. **Card dealing weights:** Starting values left to implementation; tune via playtesting.
