# Claim Engine — Product Specification

**Status:** Draft v1
**Date:** 2026-04-15
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

The solution: don't change the cards. Change which cards appear for which claims, and score how well each pairing creates gameplay tension.

## Pipeline Design

### Principles

1. **Cards are never modified.** The pipeline reads `public.cards`, never writes to it.
2. **Claims are generated from card data, not invented.** Every claim must be grounded in tensions that actually exist in the corpus.
3. **Different AI models for different passes.** Each pass has different cognitive demands — creative generation, structured evaluation, adversarial validation. Using different models per pass avoids self-confirmation bias and optimizes for cost.
4. **Output is deterministic once written.** The game reads static crossref data at runtime. No AI calls for card dealing or claim selection.
5. **Run frequency: monthly or on card corpus changes.** Not per-session, not per-deploy.

### Pass 1: Tension Analysis

**Input:** Full card corpus from `public.cards` (all fields including `fact`).

**Task:** Identify fault lines in the portfolio — places where the same evidence can be read two contradictory ways, where career decisions contain inherent tension, where themes across categories conflict with each other.

**Output:** A tension map — not claims yet, but raw material. Themes, contradictions, ambiguities. Examples:

- "Speed vs. quality appears across Experimentation (fast iteration) and Constraints (testing gaps)"
- "Leadership recognition in Awards contradicts independence signals in Work Style"
- "Philosophy cards about restraint could read as strategic thinking OR risk aversion"

**Model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`)

### Pass 2: Claim Generation

**Input:** Tension map from Pass 1 + full card corpus.

**Task:** Generate 3-5 claims that maximize the number of cards sitting on a fault line. A good claim:

- Creates genuine ambiguity for cards across **multiple rooms** (not just one category)
- Is specific enough to evaluate against individual cards
- Is framed as an accusation that a reasonable person could argue either way
- Doesn't require domain expertise to understand

**Quality metric:** A claim's strength is measured by how many cards across how many rooms produce ambiguity scores ≥ 3 (scored in Pass 3). A claim that only lights up one or two rooms is cut.

**Output:** 3-5 claim strings, each with a brief rationale explaining which tensions it targets.

**Model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`)

### Pass 3: Card-Claim Scoring

**Input:** Claims from Pass 2 + full card corpus.

**Task:** For each claim × card pair (where signal > 2 and category ≠ 'About'), score on two axes:

- **Ambiguity (1-5):** How genuinely torn would a player be when classifying this card against this claim? A 5 means proof and objection are equally defensible from the player's visible information (title + blurb). A 1 means the classification is obvious.
- **Surprise (1-5):** How likely is the AI evaluation (which sees the hidden `fact` field) to disagree with the player's gut instinct? A 5 means the player will almost certainly be wrong. A 1 means the evaluation will confirm what the player expected.

Cards scoring below threshold on both axes for a given claim are excluded from that claim's pool.

**Inclusion threshold:** ambiguity ≥ 2 OR surprise ≥ 3. Cards that are neither ambiguous nor surprising add nothing to gameplay.

**Output:** Scored card-claim pairs, filtered by threshold.

**Model:** GPT 5.4

### Pass 4: Claim Validation

**Input:** Claims from Pass 2 + scored pairs from Pass 3.

**Task:** Adversarial validation. For each claim, the model plays both sides:

1. Classify every eligible card as **proof** and write a one-sentence justification
2. Classify every eligible card as **objection** and write a one-sentence justification
3. Flag cards where one side's justification is significantly weaker than the other's — these are false ambiguity (high ambiguity score in Pass 3 but actually one-sided when argued)

Additionally, validate claim coverage:

- Every gameplay room (8 rooms, excluding Entry Hall and Attic) must have ≥ 4 eligible cards for the claim
- Total eligible cards per claim should be ≥ 30 (enough for multiple room visits without exhaustion)
- If a claim fails coverage, it's cut or flagged for manual review

**Output:** Validated claims with final card pools. Claims that fail validation are excluded from the seed output.

**Model:** Gemini Flash Lite. Cheap and fast for adversarial validation. Different provider than Passes 1-3 — avoids self-confirmation bias.

## Data Model

### New Tables (in `suspicion` schema)

```sql
CREATE TABLE suspicion.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_text text NOT NULL,
  rationale text,
  room_coverage smallint NOT NULL,
  total_eligible_cards smallint NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE suspicion.claim_cards (
  claim_id uuid NOT NULL REFERENCES suspicion.claims(id),
  card_id uuid NOT NULL,
  ambiguity smallint NOT NULL CHECK (ambiguity BETWEEN 1 AND 5),
  surprise smallint NOT NULL CHECK (surprise BETWEEN 1 AND 5),
  PRIMARY KEY (claim_id, card_id)
);
```

### Impact on Game Runtime

The game PRD's `/api/cards` endpoint changes from:

```sql
SELECT "objectID", title, blurb, category, signal
FROM public.cards
WHERE category = :category AND signal > 2
  AND "objectID" NOT IN (:exclude)
ORDER BY random() LIMIT 6
```

To:

```sql
SELECT c."objectID", c.title, c.blurb, c.category, c.signal
FROM public.cards c
JOIN suspicion.claim_cards cc ON c."objectID" = cc.card_id
WHERE c.category = :category
  AND cc.claim_id = :claim_id
  AND c."objectID" NOT IN (:exclude)
ORDER BY random() LIMIT 6
```

The `signal > 2` filter moves to seed time (Pass 3 input filter) — if a card made it into `claim_cards`, it's already been vetted.

### Card Dealing Strategy

The `claim_cards` ambiguity and surprise scores enable smarter dealing than pure random. The dealing algorithm can weight card selection based on gameplay progression:

- **Early in session (0-3 picks):** Favor high-ambiguity cards. Ease the player in — both classifications should feel valid. Builds confidence that the game is fair.
- **Mid session (4-7 picks):** Mix ambiguity and surprise. Some cards confirm the player's instincts, some don't.
- **Late session (8+ picks):** Favor high-surprise cards. The Architect's reactions increasingly challenge the player's assumptions. Drives toward a verdict decision.

This curve is implemented in the `/api/cards` query (ORDER BY weighting), not in the seed pipeline. The pipeline just provides the scores.

## Execution

### Where It Runs

The seed pipeline is a standalone script in the game repo (`scripts/seed-claims.ts`). It is not a deployed service. Execution options:

1. **Local:** `npx tsx scripts/seed-claims.ts` from developer machine
2. **GitHub Actions:** Manual `workflow_dispatch` trigger, runs the same script on a GHA runner

Both paths write directly to Supabase via service role key.

### Configuration

```
# Required
SUPABASE_URL=<supascribe-notes project url>
SUPABASE_SERVICE_ROLE_KEY=<key>

# Model keys (at least one required per pass)
ANTHROPIC_API_KEY=<key>
OPENAI_API_KEY=<key>
GOOGLE_AI_API_KEY=<key>

# Pipeline config
SEED_TARGET_CLAIMS=5
SEED_AMBIGUITY_THRESHOLD=2
SEED_SURPRISE_THRESHOLD=3
SEED_MIN_CARDS_PER_ROOM=4
SEED_MIN_TOTAL_CARDS=30
```

### Model Assignment

The script accepts model configuration per pass:

```
SEED_PASS1_MODEL=claude-sonnet-4-6        # Tension analysis
SEED_PASS2_MODEL=claude-sonnet-4-6        # Claim generation
SEED_PASS3_MODEL=gpt-5.4                  # Card-claim scoring
SEED_PASS4_MODEL=gemini-flash-lite        # Validation
```

These are the current defaults. Any model from any supported provider can be reassigned to any pass after playtesting.

### GitHub Actions Workflow

```yaml
# .github/workflows/seed-claims.yml
name: seed-claims

on:
  workflow_dispatch:
    inputs:
      target_claims:
        description: 'Number of claims to generate'
        default: '5'
        type: string
      dry_run:
        description: 'Log output without writing to Supabase'
        default: false
        type: boolean

jobs:
  seed:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx tsx scripts/seed-claims.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GOOGLE_AI_API_KEY: ${{ secrets.GOOGLE_AI_API_KEY }}
          SEED_TARGET_CLAIMS: ${{ inputs.target_claims }}
          SEED_DRY_RUN: ${{ inputs.dry_run }}
```

### Run Cadence

- **On card corpus changes:** When new cards are added to `public.cards` or existing cards are materially updated
- **Monthly (approximate):** As part of project maintenance, re-evaluate whether current claims still produce good gameplay
- **Not automated on a schedule.** This is a deliberate, human-triggered process.

### Idempotency

Each run produces a fresh set of claims and crossref data. The script:

1. Reads all current cards from `public.cards`
2. Runs the 4-pass pipeline
3. Truncates `suspicion.claim_cards` and `suspicion.claims` (in that order, FK constraint)
4. Inserts new claims and crossref data

Previous claims are not preserved. The game always uses whatever the latest seed produced.

## Cost Estimate

For a corpus of ~200 eligible cards and 5 target claims:

| Pass | Calls | Tokens (est.) | Cost (est.) |
|---|---|---|---|
| Pass 1: Tension analysis | 1 | ~50K in, ~5K out | $0.50-1.00 |
| Pass 2: Claim generation | 1 | ~55K in, ~2K out | $0.50-1.00 |
| Pass 3: Scoring | 5 (1 per claim) | ~50K in, ~10K out each | $2.00-5.00 |
| Pass 4: Validation | 5 (1 per claim) | ~30K in, ~15K out each | $3.00-7.00 |
| **Total** | **~12** | | **$6-14 per run** |

Actual cost depends on model selection. Using cheaper models for Pass 3 (Gemini Flash, Haiku) significantly reduces the scoring cost.

## Relationship to Game PRD

This PRD supersedes the following sections of the game PRD:

- **Claims System > V1: Static Claims** — replaced by AI-generated claims from this pipeline
- **Claims System > V2: AI-Generated Claims** — this IS the implementation, no longer deferred

The game PRD's card retrieval strategy, `/api/cards` endpoint, and data model sections should be updated to reference `suspicion.claims` and `suspicion.claim_cards` once this pipeline is implemented.

All other game PRD sections (Architect persona, room map, scoring, verdict, cover letter, resume) are unaffected.

## Open Questions

1. **Claim expiry:** Should claims have a version or generation number so the game can detect stale data? No
2. **Partial re-seed:** Should the pipeline support adding claims to an existing set without regenerating all, or is full replacement always correct? Always full.
3. **Card dealing weights:** Exact weighting formula for the ambiguity/surprise curve needs playtesting to tune. Should the PRD prescribe starting values or leave to implementation? We'll test.
