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
    // Pass 1 & 2: strong reasoning for tension analysis and claim generation (per PRD)
    pass1: str('CLAIM_ENGINE_PASS1_MODEL', 'claude-sonnet-4-6'),
    pass2: str('CLAIM_ENGINE_PASS2_MODEL', 'claude-sonnet-4-6'),
    // Pass 3: cheap/fast for bulk structured scoring (OpenAI per PRD)
    pass3: str('CLAIM_ENGINE_PASS3_MODEL', 'gpt-5.4-mini'),
    // Pass 4: adversarial — MUST be a different vendor than Pass 2 (Google per PRD)
    pass4: str('CLAIM_ENGINE_PASS4_MODEL', 'gemini-3.1-flash-lite-preview'),
  },
  targets: {
    // Pass 2 generates this many candidate claims. More = better odds of finding
    // ones with cross-room coverage, at the cost of extra Pass 3 scoring calls.
    generate: num('CLAIM_ENGINE_GENERATE_CLAIMS', 15),
    // Pass 3 selects this many top-ranked claims to send to Pass 4.
    select: num('CLAIM_ENGINE_SELECT_CLAIMS', 5),
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
  },
  dryRun: bool('CLAIM_ENGINE_DRY_RUN', false),
} as const;

export type Config = typeof config;
