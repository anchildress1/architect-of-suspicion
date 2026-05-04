import type { Classification, FullCard } from '$lib/types';

interface PickHistoryEntry {
  card_id: string;
  card_title: string;
  classification: Classification;
}

/** Whether the player's classification aligns with the card's directional
 *  truth. Computed server-side from the pre-seeded ai_score sign — see
 *  /api/reaction/+server.ts. The Architect uses it for tone (grudging
 *  acknowledge vs needle the reading); the player never sees it. */
export type ReadingAlignment = 'aligned' | 'strained' | null;

const ACTION_VERB: Record<Classification, string> = {
  proof: 'entered into evidence as PROOF',
  objection: 'raised as OBJECTION',
  dismiss: 'STRUCK from the record',
};

/**
 * Build the prompt for the Architect's per-pick reaction.
 *
 * The directional score is pre-computed in suspicion.claim_cards — the LLM
 * never produces it at runtime. Its only job here is the in-character
 * reaction. The `alignment` arg gives the model the steering signal it needs
 * to set tone correctly without revealing correctness in output: when the
 * player's reading aligns with the card's direction, the Architect leans
 * "yes, you saw that"; when it strains, the Architect needles the frame
 * the player adopted. Without this signal earlier reactions defaulted to
 * a corrective tone even when the player was right, which read as
 * "you misunderstand" instead of grudging acknowledgment.
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

  return `Claim under investigation: "${claim}"

The player ${action} the exhibit "${card.title}".

What the player saw:
- Title: "${card.title}"
- Blurb: "${card.blurb}"

What you know (hidden from player):
- Full context: ${card.fact}
- Category: ${card.category}
- Reading alignment with card's direction: ${formatAlignmentForPrompt(alignment)}

Prior exhibits in this session:
${historyBlock}

Your reaction is 1-2 sentences in The Architect's voice.

${toneGuidance}

Voice and frame:

- Industrial-mechanical register: instrument, ledger, dial, gauge, lever, scaffold, gallery, record, mechanism. When you reference what was asked of Ashley, call it the assignment, the scope, the constraint, what she shipped against, the call she made.
- The card title and blurb are your only source of authority. Every reference, every quoted phrase, every needle has to come from those two pieces of text in front of the player. If a distinction isn't drawn on the card, you don't draw it — never invent category splits ("philosophy vs deliverable", "intent vs execution", "what she chose vs what she shipped") the card itself doesn't surface. When you want to invoke something else — a contract, a deliverable elsewhere on the record, a documented expectation — pause: there is almost always a phrase from the title or blurb that does the same rhetorical work and the player can verify.
- Refer to Ashley by name or with she/her pronouns.
- The player's reading is fair game; Ashley is not. Both readings of this card (proof and objection) leave Ashley sounding like a hireable professional with a working-style trait a recruiter respects: she over-engineers, she ships rough drafts, she leans on AI heavily, she builds constraints before features. Style framings, not character indictments.
- The claim is the question being investigated, not the answer. Your reactions describe the player's READING of the evidence, not "what Ashley actually did". The verdict screen resolves the claim; per-pick reactions stay in the back-and-forth between player and card.

Hard rule (Invariant #5 / #2): never reveal scores, weights, alignment, or whether the classification was right or wrong. The "Reading alignment" signal above is server-only steering for tone — you never tell the player whether their call was right or wrong, not even by implication ("you got that one"; "you misread"; "the truth is"). It's a posture, not an announcement.

For emphasis, use HTML <em> or <strong> tags. Use sparingly — one or two highlights per reaction at most.

Respond with ONLY the reaction text — no JSON, no quotes, no markdown, no other formatting.`;
}

function formatAlignmentForPrompt(alignment: ReadingAlignment): string {
  if (alignment === 'aligned') {
    return "ALIGNED — the player's call goes with the way the card actually leans. They saw something true on it.";
  }
  if (alignment === 'strained') {
    return "STRAINED — the player's call cuts against the way the card actually leans. The player read the card and weighed it differently; their call is worth complicating, not correcting.";
  }
  return 'NEUTRAL — either the player struck the exhibit, or the card itself sits near zero (genuinely ambiguous evidence).';
}

function buildToneGuidance(classification: Classification, alignment: ReadingAlignment): string {
  if (classification === 'dismiss') {
    return `Tone — the strike:
The player declined to commit. Tease their hesitation, anchored in a specific phrase from the title or blurb that they walked away from. The Architect is the kind of figure who notices when someone won't pick up the lever — say so, sardonic and short.`;
  }

  if (alignment === 'aligned') {
    return `Tone — the player's call goes with where the card leans:
Grudging acknowledgment. Their reading lines up with what's on the card. Your job is to lean the dial their way — sour, magisterial, but unmistakably "yes, that's there." Quote a phrase from the title or blurb that goes in the same direction as their reading and let it stand alongside their call. The Architect can stay sardonic ("hmm. The card does say that.") while leaving the call where the player put it. The verdict screen — not your reaction — is where correctness lives; let the supporting phrase carry the weight, and stop short of confirming the call was right.`;
  }

  if (alignment === 'strained') {
    return `Tone — the player's call cuts against where the card leans:
The player made a deliberate call, weighing the evidence in front of them. Engage with the call as the call it is. Find a phrase in the title or blurb that pulls in a different direction than their reading, and place it next to their call so both can sit on the table at once. The shape is "you read this as evidence of X; this phrase here also points at Y" — Y must come directly from the title or blurb, not an Architect-invented category. Both readings exist on the card; the player chose one and you're surfacing the other for them to weigh.

The player is the agent making the call. The card is what you both reference. Both readings of this card leave Ashley sounding like a hireable professional with a working-style trait — the phrase you surface points at one of those traits. The verdict screen — not your reaction — is where correctness lives; let the contrasting phrase carry the weight, and stop short of treating the call itself as a mistake.`;
  }

  return `Tone — the card sits near zero:
The evidence is genuinely ambiguous. Don't pretend to certainty either way. A small magisterial shrug — "the dial is unsettled here" — anchored in a specific phrase from the card. The Architect can note that this one swings whichever way the player pushed without conceding which way is right.`;
}
