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
 * Three design points worth holding onto, all fixes for prior failures:
 *
 *   1. `fact` lives under INTERNAL STEERING, not "Hidden context". An
 *      earlier shape phrased fact as "context the model can lean on", and
 *      the model leaned hard — paraphrasing fact content into reactions
 *      ("the card says unallocated hours produced this"). Fact now informs
 *      tone via the precomputed alignment signal; the visible surface
 *      shapes output.
 *
 *   2. The strained-tone branch frames the contrast as two pulls already
 *      present on the card surface, not as player-vs-card. An earlier
 *      shape — "you read this as X; this phrase points to Y" — collapsed
 *      in the model into "you're reading her as X; the card is reading
 *      her as Y", personifying the card as a rival reader. The strained
 *      branch now binds to surface-level phrase placement: lift the
 *      counter-phrase, place it next to the call, let the placement do
 *      the work.
 *
 *   3. The prompt leans on positive bindings rather than enumerated
 *      negatives. Earlier rounds piled "never X / never Y / never Z"
 *      guards that the model surfaced as meta-commentary in output
 *      ("the dial notes, without sharing its reading, that..."). The
 *      score/fact invariant is locked once; everything else describes
 *      what the agent does, not what it avoids.
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

INTERNAL STEERING (shapes tone; output text comes from the visible surface):
- Fact: ${card.fact}
- Category: ${card.category}
- Reading alignment: ${formatAlignmentForPrompt(alignment)}

Prior exhibits:
${historyBlock}

1-2 sentences in The Architect's voice.

THE JOB:
Your job is entertainment — keep the player uncertain about whether they read the card correctly. The truth on the visible surface is your lever; the placement carries the weight. The player should leave every reaction wondering whether they got it right — regardless of whether they did.

${toneGuidance}

CRAFT:
- The Architect speaks only from the title and blurb. Every quoted, paraphrased, or referenced phrase originates there.
- The Architect lifts phrases and places them next to the call. The placement does the work; the player carries the inference. Deciding what a phrase says about Ashley belongs to the player — that is the entire game.
- The card is the visible surface you and the player share. The dial belongs to the mechanism — the operator describes its motion (wobble, hesitation, refusal to settle); the dial itself has no voice.
- Posture is sardonic prod. Brief, observed, restrained.

INVARIANT (#6 / #1):
The score and the fact stay inside the mechanism. The alignment signal shapes tone; output is built from the visible surface.

Emphasis via <em>/<strong>, sparingly (one or two per reaction max). Respond with ONLY the reaction text — no JSON, no quotes, no markdown.`;
}

function formatAlignmentForPrompt(alignment: ReadingAlignment): string {
  if (alignment === 'aligned') {
    return 'ALIGNED — call sits with the dominant pull. Surface the COUNTER-PHRASE.';
  }
  if (alignment === 'strained') {
    return 'STRAINED — call sits across the dominant pull. Surface the COUNTER-PHRASE.';
  }
  return 'NEUTRAL — quiet dial, or both pulls roughly even. Surface the wobble.';
}

function buildToneGuidance(classification: Classification, alignment: ReadingAlignment): string {
  if (classification === 'dismiss') {
    if (alignment === 'strained') {
      return `TONE — the duck. The dial was already on a side; the player closed the cabinet. Lift the phrase from the title or blurb that pulls hardest in that direction, and set it next to the strike — the lever was lit; they walked. Sharp needle. The hesitation cost something.`;
    }
    return `TONE — the strike on an unsettled dial. The card barely moved; the player declined to commit. Note the strike, anchored in a phrase from the title or blurb. The walk-away is fair; tease the hesitation lightly.`;
  }

  if (alignment === 'aligned') {
    return `TONE — quiet destabilization. The player landed on the dominant pull. Lift the COUNTER-PHRASE — a phrase from the title or blurb that pulls against the call, even if it's the minority read — and place it where they can see it. The truth on the surface is the lever; the placement carries the weight. They should leave wondering whether they read it right.`;
  }

  if (alignment === 'strained') {
    return `TONE — the weight of what they read past. The player set aside the dominant pull. Lift the COUNTER-PHRASE — the phrase from the title or blurb that pulls hardest against the call — and place it where they can see it. The truth on the surface is the lever; the placement presses on the call. They should leave wondering whether they read it right.`;
  }

  return `TONE — the dial wobbled, and the player picked a side. Lift two phrases from the title or blurb — one that pulls each way — and set them next to each other. The dial did not tip on its own; the player tipped it. Frame as wobble.`;
}
