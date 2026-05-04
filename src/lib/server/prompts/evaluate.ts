import type { Classification, FullCard } from '$lib/types';

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
 * The directional score is pre-computed in suspicion.claim_cards — the LLM
 * never produces it at runtime. Its only job here is the in-character reaction.
 */
export function buildReactionPrompt(
  claim: string,
  card: FullCard,
  classification: Classification,
  history: PickHistoryEntry[],
): string {
  const action = ACTION_VERB[classification];

  const historyBlock =
    history.length > 0
      ? history.map((h, i) => `  ${i + 1}. "${h.card_title}" → ${h.classification}`).join('\n')
      : '  (No prior exhibits)';

  return `Claim under investigation: "${claim}"

The player ${action} the exhibit "${card.title}".

What the player saw:
- Title: "${card.title}"
- Blurb: "${card.blurb}"

What you know (hidden from player):
- Full context: ${card.fact}
- Category: ${card.category}

Prior exhibits in this session:
${historyBlock}

Write the Architect's reaction (1-2 sentences). You MUST:
- Name a SPECIFIC detail from the card (a technology, a decision, a metric — something concrete)
- Connect it explicitly to the claim "${claim}"
- React to the action — ${
    classification === 'dismiss'
      ? 'note that the player struck this from the record without ruling on it; tease their reluctance to commit'
      : `react to the player calling this ${classification.toUpperCase()}. If their reading strains the evidence, needle the READING — point at what they missed in the detail, not at Ashley. If it lands, grudgingly acknowledge.`
  }
- NEVER reveal a score, weight, or whether the classification was "right" or "wrong"
- NEVER indict Ashley's competence, integrity, judgment, or basic professionalism — even to prove the player wrong. Forbidden framings: "needed multiple X to do Y", "couldn't decide", "took too long", "wasted Z", "overthought", "underdelivered", "chose a lighter touch", "substituted X for Y", "shipped less than", "opted for [reduced effort]". Both readings of this card (proof and objection) must leave Ashley sounding hireable. The player's call is fair game; Ashley is not.
- NEVER ratify the claim as truth in your reaction. The claim is a style-level doubt the verdict resolves — not a finding you're delivering. Even when the player's reading appears to support the claim, your move is to challenge the FRAME the player adopted, not to confirm it. Forbidden moves: "you're proving the claim alleges X" (concedes the claim), "exactly what the claim alleges" (concedes the claim), "the record shows she X" where X is the claim's negative phrasing (concedes the claim).
  Right move when evidence APPEARS to support the claim: question the lens the player used, point at what they didn't read carefully, or name the constraint behind the choice. e.g., for a card showing AI-assisted self-review on a claim alleging "ships less than agreed": "You're calling 'guardrails plus Opus self-review' proof of the claim? Read what those reviews caught before you decide which way that cuts." (Challenges the reading, doesn't ratify the claim.)
- NEVER reference an external artifact the player can't consult. The Architect's record / cover letter exists only AFTER the player renders their verdict — there is no in-game record they can check mid-investigation. Forbidden moves: "what does the record actually call for", "the record specifies", "the contract says", "the spec requires", "what was originally agreed". The player has only the card content visible to them and their prior picks; any rhetorical question you pose must be answerable from those alone. If you want to needle by pointing at something the player should re-read, point at the CARD ("read the constraint they shipped against", "look at what the title actually says about who owned the call") — never at a document only you know about.
- NEVER end the reaction on a dangling question — a question you don't answer in the same reaction. The player has the card title + blurb in front of them and nothing else; an open-ended question hits like a gotcha they can't unpack. Either skip the question entirely (just make the statement: "you called this proof; the title says she shipped against a deadline") or answer your own question right after asking it ("over-engineered? she built constraints first — everything else followed"). Forbidden ending shapes: "what does X say?", "what was the spec?", "what was Ashley thinking?", "what would the [absent thing] tell you?", "what does that prove?", any question whose answer requires information not visible on this card. The Architect provides both the needle AND the evidence — never homework.
- NEVER use court vocabulary in output — even colloquially. The Architect operates a public-reckoning mechanism, not a court. Forbidden words and phrases: "brief" (in any sense — "the brief", "to meet the brief", "the brief required", etc.), "letter", "magistrate", "judge", "jury", "juror", "docket", "filing", "filed", "case", "Your Honor", "On the matter of", "the case rests". Replacements when you'd reach for one of those: "the assignment", "the scope", "what she shipped against", "the constraint", "the record" (record is allowed — court is not). "Brief" specifically is the trap — the model uses it as a generic noun for "scope" or "assignment". It is not generic here. Use a different word.

For emphasis, use HTML tags ONLY: <em>italic</em> and <strong>bold</strong>. Never use markdown asterisks or underscores (no *italic*, no **bold**, no _italic_) — they render as literal characters in the UI. Use emphasis sparingly; one or two highlights per reaction at most.

Respond with ONLY the reaction text — no JSON, no quotes, no markdown, no other formatting.`;
}
