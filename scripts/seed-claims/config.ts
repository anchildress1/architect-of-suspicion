/** Runtime config for the claim engine. All values come from environment
 *  variables with reasonable defaults. Edit .env or override at invocation.
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Env ${name} is not a number: ${raw}`);
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
    pass1: str('CLAIM_ENGINE_PASS1_MODEL', 'gpt-5.2'),
    pass2: str('CLAIM_ENGINE_PASS2_MODEL', 'gemini-3.1-pro-preview'),
    pass3: str('CLAIM_ENGINE_PASS3_MODEL', 'claude-haiku-4-5'),
    pass4: str('CLAIM_ENGINE_PASS4_MODEL', 'gpt-5-mini'),
  },
  targets: {
    claims: num('CLAIM_ENGINE_TARGET_CLAIMS', 5),
    minCardsPerRoom: num('CLAIM_ENGINE_MIN_CARDS_PER_ROOM', 4),
    minTotalCards: num('CLAIM_ENGINE_MIN_TOTAL_CARDS', 30),
  },
  thresholds: {
    ambiguity: num('CLAIM_ENGINE_AMBIGUITY_THRESHOLD', 2),
    surprise: num('CLAIM_ENGINE_SURPRISE_THRESHOLD', 3),
    cardSignal: 2,
  },
  dryRun: bool('CLAIM_ENGINE_DRY_RUN', false),
} as const;

export type Config = typeof config;
