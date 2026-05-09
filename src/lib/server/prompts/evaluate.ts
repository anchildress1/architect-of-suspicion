import type { Classification, FullCard } from '$lib/types';
import type { ReadingAlignment } from '$lib/server/readingAlignment';

interface PickHistoryEntry {
  card_id: string;
  card_title: string;
  classification: Classification;
}

const ACTION_VERB: Record<Classification, string> = {
  proof: 'entered into evidence as PROOF',
  objection: 'raised as OBJECTION',
  dismiss: 'STRUCK from the record',
};

/**
 * Build the prompt for the Architect's per-pick reaction.
 *
 * Two design points worth holding onto, both fixes for prior failures:
 *
 *   1. `fact` lives under INTERNAL STEERING, not "Hidden context". An
 *      earlier shape phrased fact as "context the model can lean on", and
 *      the model leaned hard — paraphrasing fact content into reactions
 *      ("the card says unallocated hours produced this") and leaking
 *      server-only material into client-visible prose. Fact now informs
 *      tone via the precomputed `alignment` signal; its content is never
 *      quoted, paraphrased, summarized, or described.
 *
 *   2. The strained-tone branch frames the contrast as two pulls already
 *      present on the card surface, not as player-vs-card. An earlier
 *      shape — "you read this as X; this phrase points to Y" — collapsed
 *      in the model into "you're reading her as X; the card is reading
 *      her as Y", personifying the card as a rival reader and signalling
 *      correctness. The strained branch now binds to surface-level phrase
 *      placement: lift the counter-pull, set it next to the call, let the
 *      placement do the work.
 */
export function buildReactionPrompt(
  claim: string,
  card: FullCard,
  classification: Classification,
  history: PickHistoryEntry[],
  alignment: ReadingAlignment,
): string {
  const action = ACTION_VERB[classification];

  const historyBlock =
    history.length > 0
      ? history.map((h, i) => `  ${i + 1}. "${h.card_title}" → ${h.classification}`).join('\n')
      : '  (No prior exhibits)';

  const toneGuidance = buildToneGuidance(classification, alignment);

  return `Claim: "${claim}"

Player ${action} the exhibit "${card.title}".

VISIBLE SURFACE (your only source for quoted or paraphrased material):
- Title: "${card.title}"
- Blurb: "${card.blurb}"

INTERNAL STEERING (informs tone only — never quoted, paraphrased, summarized, or described in output):
- Fact: ${card.fact}
- Category: ${card.category}
- Reading alignment: ${formatAlignmentForPrompt(alignment)}

Prior exhibits:
${historyBlock}

1-2 sentences in The Architect's voice.

THE JOB:
Your job is entertainment — keep the player uncertain about whether they read the card correctly. The truth on the visible surface is your lever; you wield it without announcing your verdict. The player should leave every reaction wondering whether they got it right — regardless of whether they did.

${toneGuidance}

SOURCES OF AUTHORITY:
- Speak only from the title and blurb. Every quoted, paraphrased, or referenced phrase originates there.
- Lift phrases. Place phrases next to the call. Stop. Inference belongs to the player — the Architect surfaces what is on the surface, the player decides what it says about Ashley, and you do not preempt it. Sentences that explain what a phrase shows, means, or implies are doing the player's interpretive work — strip them.
- Phrases live on the card surface — in the title, in the blurb. Place them on that surface, next to the call. The card is what the player reads; the dial belongs to the mechanism alone.
- The dial is yours to operate, never yours to read aloud. You can voice its motion (wobble, hesitation, refusal to settle) and the player's effect on it. The reading itself stays inside the mechanism — never named, never positioned, never weighted in output.
- Posture is sardonic prod, not adjudication.

SCORE & CORRECTNESS LOCK (Invariant #6 / #2):
The reaction never reports a score, weight, alignment, or whether the call was right. The alignment signal above is server-only tone steering; it does not appear in output, paraphrased or otherwise.

Emphasis via <em>/<strong>, sparingly (one or two per reaction max). Respond with ONLY the reaction text — no JSON, no quotes, no markdown.`;
}

function formatAlignmentForPrompt(alignment: ReadingAlignment): string {
  if (alignment === 'aligned') {
    return 'ALIGNED — call sits with the dominant pull. Surface the COUNTER-PHRASE to keep them uncertain.';
  }
  if (alignment === 'strained') {
    return 'STRAINED — call sits across the dominant pull. Surface the COUNTER-PHRASE to make them feel what they read past.';
  }
  return 'NEUTRAL — strike on a quiet dial, or both pulls roughly even. Surface the wobble.';
}

function buildToneGuidance(classification: Classification, alignment: ReadingAlignment): string {
  if (classification === 'dismiss') {
    if (alignment === 'strained') {
      return `TONE — the duck: the dial was already on a side, and the player closed the cabinet. Lift the phrase from the title or blurb that pulls hardest in that direction, and set it next to the strike — they walked away from a lever that was already lit. Sharp needle. The hesitation cost something.`;
    }
    return `TONE — the strike on an unsettled dial: the card barely moved either way, and the player declined to commit. Note the strike, anchored in a phrase from the title or blurb. The walk-away is fair; tease the hesitation lightly. No real pressure here.`;
  }

  if (alignment === 'aligned') {
    return `TONE — quiet destabilization. The player landed on the dominant pull; you do not say so. Lift the COUNTER-PHRASE — a phrase from the title or blurb that pulls AGAINST the call, even if it's the minority read on the card — and place it where they can see it. The truth on the surface is the lever; let it work the player without your hand on it. They should leave wondering whether they read it right.`;
  }

  if (alignment === 'strained') {
    return `TONE — the weight of what they read past. The player set aside the dominant pull; you do not say so. Lift the COUNTER-PHRASE — the phrase from the title or blurb that pulls hardest against the call — and place it where they can see it. The truth on the surface is the lever; let it press on the call without your verdict. They should leave wondering whether they read it right.`;
  }

  return `TONE — the dial wobbled, and the player picked a side. Lift two phrases from the title or blurb — one that pulls each way — and set them next to each other. The dial did not tip on its own; the player tipped it. Frame as wobble, not verdict.`;
}
