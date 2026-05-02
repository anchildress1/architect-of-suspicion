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
import {
  corpusSignature,
  loadCheckpoint,
  pruneStaleCheckpoints,
  saveCheckpoint,
} from './checkpoint';
import { config, type Config } from './config';
import { runPass1 } from './pass1-tensions';
import { runPass2 } from './pass2-claims';
import { runPass3 } from './pass3-score';
import { runPass4 } from './pass4-validate';
import { persistSeed, type PersistInput } from './persist';
import type { CardClaimScore, GeneratedClaim, TensionMap } from './types';
import { pathToFileURL } from 'node:url';

type Provider = 'anthropic' | 'openai' | 'gemini';

function providerForModel(model: string): Provider {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('gemini-')) return 'gemini';
  throw new TypeError(`Unrecognized model provider for "${model}"`);
}

export function requiredEnvVarsForModels(models: Config['models']): string[] {
  const required = new Set<string>(['SUPABASE_URL', 'SUPABASE_SECRET_KEY']);
  for (const model of Object.values(models)) {
    const provider = providerForModel(model);
    if (provider === 'anthropic') required.add('ANTHROPIC_API_KEY');
    if (provider === 'openai') required.add('OPENAI_API_KEY');
    if (provider === 'gemini') required.add('GEMINI_API_KEY');
  }
  return [...required];
}

export function validateEnv(
  models: Config['models'] = config.models,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const missing = requiredEnvVarsForModels(models).filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (providerForModel(models.pass2) === providerForModel(models.pass4)) {
    throw new Error(
      `Pass 4 model provider must differ from Pass 2 for adversarial validation (pass2=${models.pass2}, pass4=${models.pass4})`,
    );
  }
}

export async function main(): Promise<void> {
  validateEnv(config.models, process.env);

  console.log('[seed-claims] starting pipeline');
  console.log('[seed-claims] config:', JSON.stringify(config, null, 2));

  const cards = await loadEligibleCards(config.thresholds.cardSignal);
  console.log(`[seed-claims] loaded ${cards.length} eligible cards`);
  if (cards.length === 0) throw new Error('No eligible cards found');

  const sig = corpusSignature(cards);
  await pruneStaleCheckpoints(sig);

  // Each pass consults its checkpoint first; if present and the corpus
  // signature matches, we resume without a paid re-run. Maps serialize via
  // Object.fromEntries and are rehydrated on load.

  const tensions =
    (await loadCheckpoint<TensionMap>('pass1-tensions', sig)) ??
    (await (async () => {
      const result = await runPass1(cards);
      await saveCheckpoint('pass1-tensions', sig, result);
      return result;
    })());

  // pass2-claims-v2: cache key bumped when GeneratedClaim grew the
  // guilty_reading / not_guilty_reading fields. Stale v1 files lack those
  // fields and would silently feed empty strings into persist; pruning by
  // signature alone wouldn't catch a same-corpus re-run after the upgrade.
  const candidates =
    (await loadCheckpoint<GeneratedClaim[]>('pass2-claims-v2', sig)) ??
    (await (async () => {
      const result = await runPass2(cards, tensions);
      await saveCheckpoint('pass2-claims-v2', sig, result);
      return result;
    })());

  // pass3-score-v2: bumped alongside pass2-claims-v2. The cached `selected`
  // array is GeneratedClaim[]; the v1 shape predates the dual-hireability
  // readings and would re-introduce them as undefined on resume.
  const pass3Cache = await loadCheckpoint<{
    scored: Array<[string, CardClaimScore[]]>;
    selected: GeneratedClaim[];
  }>('pass3-score-v2', sig);
  const { scored, selected } = pass3Cache
    ? { scored: new Map(pass3Cache.scored), selected: pass3Cache.selected }
    : await (async () => {
        const result = await runPass3(cards, candidates);
        await saveCheckpoint('pass3-score-v2', sig, {
          scored: Array.from(result.scored.entries()),
          selected: result.selected,
        });
        return result;
      })();

  // Pass 4 is intentionally NOT cached — its output includes claim-specific
  // rewrites that should regenerate cleanly on any retry. Pass 1-3 cache is
  // the big cost saver.
  const { validations, arguments: claimArguments } = await runPass4(selected, scored, cards);

  const inputs: PersistInput[] = selected.map((claim) => {
    const validation = validations.find((v) => v.claim_id === claim.id);
    if (!validation) throw new Error(`No validation for claim: ${claim.claim_text}`);

    const claimScores = scored.get(claim.id);
    if (!claimScores) {
      throw new Error(
        `No scores for claim "${claim.claim_text}" (claim_id=${claim.id}) — pipeline bug`,
      );
    }

    const args = claimArguments.get(claim.id);
    if (!args) {
      throw new Error(
        `No arguments for claim "${claim.claim_text}" (claim_id=${claim.id}) — pipeline bug`,
      );
    }

    return { claim, validation, scores: claimScores, arguments: args };
  });

  const survivors = inputs.filter((i) => i.validation.survived);
  console.log(`[seed-claims] ${survivors.length}/${inputs.length} claims survived validation`);

  if (config.dryRun) {
    console.log('[seed-claims] DRY RUN — skipping persistence');
    // Maps serialize as {} with JSON.stringify — use a replacer to show rewrite content.
    console.log(
      JSON.stringify(inputs, (_, v) => (v instanceof Map ? Object.fromEntries(v) : v), 2),
    );
    return;
  }

  if (survivors.length === 0) {
    throw new Error('No claims survived validation — refusing to wipe existing seed');
  }

  await persistSeed(inputs);
  console.log('[seed-claims] done');
}

function isExecutedDirectly(): boolean {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isExecutedDirectly()) {
  main().catch((err) => {
    console.error('[seed-claims] FAILED:', err);
    process.exit(1);
  });
}
