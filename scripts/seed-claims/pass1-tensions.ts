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

const SYSTEM_PROMPT = `You analyze a corpus of career-evidence cards for a narrative game called Architect of Suspicion. Surface fault lines: places where the same evidence supports contradictory readings, or where themes across categories conflict.

Produce raw material only — tensions that a later pass will use to generate claims. Do not write claims yourself.

A strong tension is grounded in 3+ cards across 2+ categories and supports two mutually exclusive interpretations of the subject's behavior. A weak tension is generic (e.g. "ambition vs humility"), single-card, or unfalsifiable.`;

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
  required: ['tensions'],
  additionalProperties: false,
} as const;

function buildPrompt(cards: CardRow[]): string {
  return `CORPUS (${cards.length} cards):

${formatCardCorpus(cards)}

TASK:
Identify 8-15 distinct tensions in this corpus.

Tension types (find at least one of each):
1. Dual-read evidence — the same card supports contradictory readings (e.g. "takes initiative" vs "ignores input")
2. Cross-category clash — themes conflict across categories (e.g. Awards celebrate boldness while Constraints flag risk-aversion)
3. Virtue-or-cope — a Philosophy or Work Style card reads as genuine principle OR as rationalization
4. Trade-off fault line — career Decisions that required sacrificing one value for another

Each tension must reference 3+ specific cards by title and span 2+ categories. Use the notes field for meta-observations about the corpus that did not rise to the level of a full tension.`;
}

export async function runPass1(cards: CardRow[]): Promise<TensionMap> {
  const client = clientFor(config.models.pass1);
  console.log(`[pass1] model=${client.model} cards=${cards.length}`);

  const raw = await client.complete(buildPrompt(cards), {
    system: SYSTEM_PROMPT,
    maxTokens: 12000,
    schema: SCHEMA,
    reasoning: 'high',
  });

  let parsed: TensionMap;
  try {
    parsed = JSON.parse(raw) as TensionMap;
  } catch (err) {
    throw new Error(`[pass1] JSON.parse failed.\nRaw (first 500 chars): ${raw.slice(0, 500)}`, {
      cause: err,
    });
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
