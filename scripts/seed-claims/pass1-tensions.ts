/** Pass 1: Tension Analysis.
 *
 *  Input:  full card corpus (title, blurb, category, fact).
 *  Output: structured map of themes / contradictions / ambiguities across
 *          categories — raw material for Pass 2.
 *
 *  Model:  claude-sonnet-4-6
 */

import { clientFor } from './clients';
import { formatCardCorpus } from './cards';
import { config } from './config';
import type { CardRow, TensionMap } from './types';

const SYSTEM_PROMPT = `You are analyzing a corpus of career-evidence cards for a narrative game called Architect of Suspicion. Your job is to surface fault lines — places where the same evidence can reasonably be read two contradictory ways, or where themes across categories conflict with each other.

You are NOT writing claims yet. You are producing raw material: the tensions a later pass will weaponize into provocative claims.`;

const SCHEMA = {
  type: 'object',
  properties: {
    tensions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          description: { type: 'string' },
          categories: { type: 'array', items: { type: 'string' } },
        },
        required: ['theme', 'description', 'categories'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['tensions', 'notes'],
  additionalProperties: false,
} as const;

function buildPrompt(cards: CardRow[]): string {
  return `CORPUS (${cards.length} cards):

${formatCardCorpus(cards)}

TASK:
Identify 8-15 distinct tensions in this corpus. A tension is a place where:
- The same evidence supports contradictory readings (e.g. "takes initiative" vs "ignores input")
- Themes clash across categories (e.g. awards celebrate boldness, constraints flag risk-aversion)
- A philosophy card could be read as virtue OR as cope
- Career decisions contain inherent trade-offs the subject had to make

Good tensions are specific and grounded in multiple cards. Bad tensions are generic ("ambition vs humility") or single-card.`;
}

export async function runPass1(cards: CardRow[]): Promise<TensionMap> {
  const client = clientFor(config.models.pass1);
  console.log(`[pass1] model=${client.model} cards=${cards.length}`);

  const raw = await client.complete(buildPrompt(cards), {
    system: SYSTEM_PROMPT,
    maxTokens: 6000,
    schema: SCHEMA,
  });

  let parsed: TensionMap;
  try {
    parsed = JSON.parse(raw) as TensionMap;
  } catch (err) {
    throw new Error(
      `[pass1] JSON.parse failed.\nRaw (first 500 chars): ${raw.slice(0, 500)}`,
      { cause: err },
    );
  }
  if (!Array.isArray(parsed.tensions) || parsed.tensions.length === 0) {
    throw new TypeError('Pass 1 produced no tensions');
  }

  console.log(`[pass1] ${parsed.tensions.length} tensions:`);
  for (const t of parsed.tensions) {
    console.log(`  • ${t.theme} [${t.categories.join(', ')}]: ${t.description}`);
  }
  if (parsed.notes) console.log(`[pass1] notes: ${parsed.notes}`);

  return parsed;
}
