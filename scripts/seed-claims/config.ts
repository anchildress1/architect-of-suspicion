/** Runtime config for the claim engine. All values come from environment
 *  variables with reasonable defaults. Edit .env or override at invocation.
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Env ${name} is not a number: ${raw}`);
  }
  return parsed;
}

function str(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

export const config = {
  models: {
    // Pass 1: strong reasoning for tension analysis (Anthropic per PRD).
    // Opus 4.7 over Sonnet 4.6 — tensions shape every downstream pass, so
    // the flagship model earns its ~1.7x cost on one call per seed run.
    pass1: str('CLAIM_ENGINE_PASS1_MODEL', 'claude-opus-4-7'),
    // Pass 2: creative claim generation. Must differ from Pass 4 vendor
    // (enforced in index.ts) to keep the adversarial cross-check honest.
    // Claude Opus 4.7 over gpt-5.4 — Opus's adaptive thinking produces
    // better-shaped provocative claims in our tests. Prompt is tuned for
    // Claude's XML-ish section tags; see pass2-claims.ts.
    pass2: str('CLAIM_ENGINE_PASS2_MODEL', 'claude-opus-4-7'),
    // Pass 3: bulk structured scoring (OpenAI per PRD). gpt-5.4 — gpt-5.5
    // is the better instruction-follower and verbosity-tuner, but its
    // tier-1 rate limits trip during full-corpus runs (~50-card batches
    // x 15 candidate claims = many parallel calls). 5.4 has the headroom
    // and produces sufficient scoring quality for this pass. The prompt
    // remains tuned per OpenAI's GPT-5.2 cookbook: CTCO layout,
    // reasoning_effort='low', verbosity unset (5.4 honors the verbosity
    // knob too if present). See pass3-score.ts.
    pass3: str('CLAIM_ENGINE_PASS3_MODEL', 'gpt-5.4'),
    // Pass 4: adversarial — MUST be a different vendor than Pass 2 (Google
    // per PRD). Pro over Flash-Lite-Preview — Pass 4 does the heaviest
    // per-claim work (validate + rewrite 30-50 blurbs + assign ai_score per
    // claim) and only runs on the top-N selected claims, so the spend is
    // proportionate to the stakes.
    pass4: str('CLAIM_ENGINE_PASS4_MODEL', 'gemini-3.1-pro-preview'),
  },
  targets: {
    // Pass 2 generates this many candidate claims. More = better odds of finding
    // ones with cross-room coverage, at the cost of extra Pass 3 scoring calls.
    generate: num('CLAIM_ENGINE_GENERATE_CLAIMS', 15),
    // Pass 3 selects this many top-ranked claims to send to Pass 4.
    select: num('CLAIM_ENGINE_SELECT_CLAIMS', 7),
    // Pass 3 keeps this many top-scoring cards per claim (sorted by
    // ambiguity+surprise descending). Keeps pools claim-specific and bounded.
    topCards: num('CLAIM_ENGINE_TOP_CARDS', 50),
    // Pass 4 survival floor: rewritten cards per claim.
    minTotalCards: num('CLAIM_ENGINE_MIN_TOTAL_CARDS', 30),
    // Pass 4 survival floor: distinct gameplay rooms that must be covered.
    minRooms: num('CLAIM_ENGINE_MIN_ROOMS', 5),
  },
  thresholds: {
    // Combined ambiguity+surprise minimum for a card to count toward claim quality.
    // Lower = more inclusive; a card scoring 2+1 just barely qualifies.
    cardFloor: num('CLAIM_ENGINE_CARD_FLOOR', 3),
    cardSignal: 2,
    // Cards per scoring batch. Smaller = fewer output tokens per call.
    // 50 cards × ~48 tokens/entry ≈ 2,400 tokens output — well within any limit.
    scoreBatch: num('CLAIM_ENGINE_SCORE_BATCH', 50),
    // Cards per Pass 4 rewrite batch. 20 cards × ~300 tokens/rewrite ≈ 6k
    // output, well under maxTokens=24k after Gemini's default thinking
    // budget (~15k typical). Halving the batch count vs the prior default
    // of 10 cuts per-batch system-prompt overhead in half. If a model
    // hits the truncation throw on a 20-card batch, override
    // CLAIM_ENGINE_PASS4_BATCH=10 to fall back to the conservative size.
    pass4Batch: num('CLAIM_ENGINE_PASS4_BATCH', 20),
  },
  dryRun: bool('CLAIM_ENGINE_DRY_RUN', false),
  // Disable the Pass 4 rewrite cache. Set to true (or `1`) when iterating on
  // the Pass 4 prompt itself and you need every (card, claim) pair to
  // re-run, even though the prompt-version hash should normally invalidate
  // automatically. Leaving the cache enabled is the cost-reduction default.
  cacheDisabled: bool('CLAIM_ENGINE_CACHE_DISABLED', false),
} as const;

export type Config = typeof config;
