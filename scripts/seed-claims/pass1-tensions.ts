/** Pass 1: Tension Analysis.
 *
 *  Input:  full card corpus (title, blurb, category, fact).
 *  Output: structured map of themes / contradictions / ambiguities across
 *          categories — raw material for Pass 2.
 *
 *  Model:  strong reasoning model (default: gpt-5.2).
 */

import { clientFor, extractJson } from './clients';
import { formatCardCorpus } from './cards';
import { config } from './config';
import type { CardRow, TensionMap } from './types';

const SYSTEM_PROMPT = `You are analyzing a corpus of career-evidence cards for a narrative game called Architect of Suspicion. Your job is to surface fault lines — places where the same evidence can reasonably be read two contradictory ways, or where themes across categories conflict with each other.

You are NOT writing claims yet. You are producing raw material: the tensions a later pass will weaponize into provocative claims.

Return valid JSON only. No prose preamble.`;

function buildPrompt(cards: CardRow[]): string {
  const corpus = formatCardCorpus(cards);
  return `CORPUS (${cards.length} cards):

${corpus}

TASK:
Identify 8-15 distinct tensions in this corpus. A tension is a place where:
- The same evidence supports contradictory readings (e.g. "takes initiative" vs "ignores input")
- Themes clash across categories (e.g. awards celebrate boldness, constraints flag risk-aversion)
- A philosophy card could be read as virtue OR as cope
- Career decisions contain inherent trade-offs the subject had to make

Good tensions are specific and grounded in multiple cards. Bad tensions are generic ("ambition vs humility") or single-card.

Output JSON matching this shape exactly:
{
  "tensions": [
    {
      "theme": "short label — e.g. 'Speed vs Quality'",
      "description": "1-2 sentences. Name the specific cards or categories where the tension appears.",
      "categories": ["Experimentation", "Constraints"]
    }
  ],
  "notes": "optional free-text observations about the corpus as a whole"
}`;
}

export async function runPass1(cards: CardRow[]): Promise<TensionMap> {
  const client = clientFor(config.models.pass1);
  console.log(`[pass1] model=${client.model} cards=${cards.length}`);

  const raw = await client.complete(buildPrompt(cards), {
    system: SYSTEM_PROMPT,
    maxTokens: 6000,
    jsonMode: true,
  });

  const parsed = extractJson<TensionMap>(raw);
  if (!Array.isArray(parsed.tensions) || parsed.tensions.length === 0) {
    throw new Error('Pass 1 produced no tensions');
  }

  console.log(`[pass1] extracted ${parsed.tensions.length} tensions`);
  return parsed;
}
