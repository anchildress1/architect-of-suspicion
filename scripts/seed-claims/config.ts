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
    // Pass 3: bulk structured scoring (OpenAI per PRD). gpt-5.5 — first
    // fully-retrained base model since GPT-4.5, with stronger instruction
    // adherence than 5.4 and the verbosity knob that lets structured-only
    // output stay terse. Prompt tuned per OpenAI's GPT-5.2/5.5 cookbook:
    // CTCO layout, reasoning_effort='low' (GPT-5.5 dropped 'minimal' — so
    // 'low' is the lowest tier with real deliberation for the theory-of-
    // mind scoring step), verbosity='low'. See pass3-score.ts.
    pass3: str('CLAIM_ENGINE_PASS3_MODEL', 'gpt-5.5'),
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
    // Cards per Pass 4 rewrite batch. 10 keeps each call around ~3k output
    // tokens of actual rewrite + notes, leaving headroom for Gemini 3.1
    // Pro's non-trivial default thinking budget under maxOutputTokens.
    // A flaky batch only costs its own retry — not the whole claim's spend.
    pass4Batch: num('CLAIM_ENGINE_PASS4_BATCH', 10),
  },
  dryRun: bool('CLAIM_ENGINE_DRY_RUN', false),
} as const;

export type Config = typeof config;
