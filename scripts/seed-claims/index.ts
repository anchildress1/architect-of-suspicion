/** Claim Engine entry point.
 *
 *  Runs the 4-pass pipeline end-to-end and writes the results to Supabase.
 *  See docs/CLAIM-ENGINE-PRD.md for the design.
 *
 *  Usage:
 *    pnpm tsx scripts/seed-claims/index.ts            # full run
 *    CLAIM_ENGINE_DRY_RUN=true pnpm tsx scripts/seed-claims/index.ts
 */

import { loadEligibleCards } from './cards';
import { config } from './config';
import { runPass1 } from './pass1-tensions';
import { runPass2 } from './pass2-claims';
import { runPass3 } from './pass3-score';
import { runPass4 } from './pass4-validate';
import { persistSeed, type PersistInput } from './persist';

async function main(): Promise<void> {
  console.log('[seed-claims] starting pipeline');
  console.log('[seed-claims] config:', JSON.stringify(config, null, 2));

  const cards = await loadEligibleCards(config.thresholds.cardSignal);
  console.log(`[seed-claims] loaded ${cards.length} eligible cards`);
  if (cards.length === 0) throw new Error('No eligible cards found');

  const tensions = await runPass1(cards);
  const claims = await runPass2(cards, tensions);
  const scoredByClaim = await runPass3(cards, claims);
  const validations = await runPass4(claims, scoredByClaim, cards);

  const inputs: PersistInput[] = claims.map((claim) => {
    const validation = validations.find((v) => v.claim_text === claim.claim_text);
    if (!validation) throw new Error(`No validation for claim: ${claim.claim_text}`);
    return {
      claim,
      validation,
      scores: scoredByClaim.get(claim.claim_text) ?? [],
    };
  });

  const survivors = inputs.filter((i) => i.validation.survived);
  console.log(
    `[seed-claims] ${survivors.length}/${inputs.length} claims survived validation`,
  );

  if (config.dryRun) {
    console.log('[seed-claims] DRY RUN — skipping persistence');
    console.log(JSON.stringify(inputs, null, 2));
    return;
  }

  if (survivors.length === 0) {
    throw new Error('No claims survived validation — refusing to wipe existing seed');
  }

  await persistSeed(inputs);
  console.log('[seed-claims] done');
}

main().catch((err) => {
  console.error('[seed-claims] FAILED:', err);
  process.exitCode = 1;
});
