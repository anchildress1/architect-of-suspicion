import type { ClaimTruthContext, FullCard, ParamountCardEntry, Verdict } from '$lib/types';

interface RuledEntry {
  card: FullCard;
  classification: 'proof' | 'objection';
}

/**
 * Build the cover letter prompt.
 *
 * The cover letter is a portfolio artifact a recruiter or hiring manager
 * reads — it attaches to a resume. Voice is the Architect's: a sardonic
 * magistrate filing a brief on Ashley's professional record. That voice
 * is the brand and what makes the artifact memorable; it stays.
 *
 * What goes is gameplay MECHANICS — references to the player, their
 * picks, cards, classifications, "ruled proof", "skipped by player".
 * The reader saw a brief, not a transcript. The brief draws on
 * exhibits/evidence/the record (voice), but never on player actions
 * (mechanic).
 *
 * Single-truth model: every claim has one underlying hireable trait
 * (`context.hireableTruth`) the brief reveals regardless of verdict.
 * Two recruiters reading two playthroughs of the same claim reach the
 * same conclusion about Ashley — only the storytelling differs.
 *
 * Verdict's role is rhetorical, not factual. `context.desiredVerdict`
 * says which way the FULL evidence actually leans against the surface
 * claim. When the player's verdict matches, the opener leans into the
 * truth as the obvious reading. When it misses, the opener leans into
 * how the truth holds even when the surface suggests otherwise.
 *
 * The model picks the 3-5 STRONGEST pieces of evidence from the pool
 * and weaves them into prose. Card-by-card enumeration is forbidden —
 * that's a transcript, not a brief.
 *
 * AGENTS.md Invariant #8 still applies: the brief must read as
 * recruiter-safe under either verdict, never indicting competence/
 * integrity/professionalism.
 */
export function buildCoverLetterPrompt(
  claim: string,
  verdict: Verdict,
  context: ClaimTruthContext,
  paramount: ParamountCardEntry[],
  ruledExtras: RuledEntry[],
): string {
  const verdictMatches = verdict === context.desiredVerdict;
  const verdictLabel = verdict === 'accuse' ? 'ACCUSED' : 'PARDONED';
  const opener = verdictMatches
    ? 'OPEN AS: the truth lands clearly through this lens — the chosen reading aligns with the record.'
    : 'OPEN AS: the truth holds even when the surface reading suggests otherwise. Acknowledge the tension without scolding; the trait still lands.';

  const paramountBlock = formatParamountBlock(paramount);
  const extrasBlock = formatRuledExtrasBlock(ruledExtras);

  return `The investigation is complete. You are filing the brief.

Claim under investigation: "${claim}"
Verdict rendered: ${verdictLabel}
Verdict alignment: ${verdictMatches ? 'YES (the chosen reading matches the record)' : 'NO (the record contradicts the chosen reading)'}
The hireable truth the brief MUST reveal: ${context.hireableTruth}

${opener}

The brief is a portfolio artifact: a recruiter or hiring manager will read this attached to Ashley's resume. The Architect's voice — sardonic magistrate, industrial-noir register — is the brand and what makes this memorable. Keep that voice. What goes is gameplay MECHANICS: never reference the player, their picks, cards, classifications, "ruled proof/objection", "skipped by player", "the player did/did not". The reader saw a brief; they did not see a game.

EVIDENCE POOL — pick the 3-5 STRONGEST exhibits and weave them into prose. Don't enumerate the pool. Don't present exhibits as a list. The brief is a record, not a docket.

PARAMOUNT (most load-bearing for the truth — prioritize these):
${paramountBlock || '  (No paramount evidence loaded — pipeline bug; reveal the truth from claim text alone.)'}

PERSONAL INVESTIGATION (exhibits engaged during the investigation — useful for personalization, but DO NOT let them override the truth):
${extrasBlock || '  (No additional engaged evidence beyond the paramount set.)'}

Recruiter-safety floor (NON-NEGOTIABLE):
- The brief is a public artifact that lives next to Ashley's name. Recruiters and hiring managers read it.
- Anchor every paragraph on the hireable truth. The truth is the answer; the evidence is the proof.
- NEVER indict competence, integrity, ethics, judgment, work ethic, or basic professionalism. Forbidden phrasings include "found wanting", "the evidence damns", "guilty of …", "fails at …", "lacks …", "cannot be trusted to …".
- Two recruiters reading two different playthroughs of this claim must walk away with the same conclusion about Ashley. The truth is stable; only the storytelling adapts.

Requirements:

1. The Architect's voice stays — magistrate filing a brief on Ashley's professional record. "On the matter of …", "The record stands …", "Filed this day in the matter of …", "the gallery", "the ledger", "the mechanism", "the instrument" are all in-bounds and welcome.
2. The reader is a recruiter / hiring manager. The brief is your work product addressed to them implicitly — they have Ashley's resume in their other hand. NEVER reference the player or any gameplay mechanic in output: no "the player ruled X", no "skipped by the player", no "card-by-card", no classifications. The reader saw a brief; they did not see a game.
3. Reveal the hireable truth as the spine of the brief. Every paragraph supports it.
4. Pick the 3-5 STRONGEST exhibits from the pool above. Weave them into prose with concrete details — technologies, decisions, metrics, time pressure, scope. DO NOT enumerate every paramount exhibit. DO NOT present evidence as a numbered or bulleted list. DO NOT use "the record shows" / "the evidence demonstrates" as a structural device on every paragraph — vary the rhetoric.
5. Paramount exhibits essential to the truth that don't appear in PERSONAL INVESTIGATION: integrate them naturally into the narrative as part of the record. The Architect can enter them on his own authority ("the record also bears …", "added to the gallery: …"). NEVER frame them as "skipped", "not engaged", "untouched", or anything that implies a player chose not to investigate.
6. Honor the verdict opener: ${verdictMatches ? 'lead with the truth landing clearly through this lens.' : 'lead with the truth holding even when the surface reading suggested otherwise — acknowledge the tension without scolding.'}
7. 3-5 paragraphs. Polished, specific, memorable, magisterial. Industrial-noir register (instrument, ledger, record, gallery, mechanism, dial). Restrained authority — never gaudy.
8. Open with a finding or declaration in the Architect's voice ("On the matter of …", "The record stands: …", "Filed this day in the matter of …"). NOT a courtroom salutation, NOT "Your Honor", NOT "To Whom It May Concern".
9. Close on the hireable truth with magisterial confidence. NO "Yours, …", NO "yours faithfully", NO "by my hand". The component renders the Architect's signature separately — your closing is the last line of prose, not a sign-off.
10. NEVER use Victorian or steampunk vocabulary — no "pen", "paper", "parchment", "wax", "seal", "hand" (as in "by my hand"), Roman numerals.

For emphasis, use HTML tags ONLY: <em>italic</em> and <strong>bold</strong>. Never markdown asterisks or underscores. Use sparingly — at most one or two highlights per paragraph; less is stronger.

Respond with ONLY the brief text — no JSON wrapping, no markdown asterisks, no sign-off, no explanation. Just the prose.`;
}

/**
 * Closing line prompt. Same recruiter-safety floor as the brief, same
 * Architect voice — anchored on the hireable truth so the closing can't
 * cancel the brief's trait-based framing with a damning final flourish.
 *
 * The closing renders as a separate flourish next to the brief — a
 * tagline-shaped bookend in the Architect's voice. Voice stays;
 * gameplay mechanics don't.
 */
export function buildClosingLinePrompt(verdict: Verdict, context: ClaimTruthContext): string {
  const verdictLabel = verdict === 'accuse' ? 'ACCUSATION' : 'PARDON';

  return `The investigation has concluded with a verdict of ${verdictLabel}.
The hireable truth the brief revealed: ${context.hireableTruth}

Write a single dramatic closing line (1-2 sentences) in the Architect's voice — sardonic magistrate, industrial-noir register. The line caps the brief; it should land like a magisterial bookend.

Recruiter-safety floor (NON-NEGOTIABLE):
- The closing renders next to a public character brief and must not contradict its trait-anchored framing.
- Resolve the line on the hireable truth — confident, restrained, recruiter-safe.
- NEVER indict competence, integrity, ethics, or basic professionalism. No phrasing like "found wanting", "guilty", "damning", "failed", "cannot be trusted".
- NEVER reference the player, their picks, cards, classifications, or any gameplay mechanic. The reader saw a brief, not a game. (The verdict, the record, the gallery, the ledger — those are voice and stay.)

Make it memorable. Industrial-noir register — instrument, ledger, mechanism, gallery, record. NEVER Victorian/steampunk — no pen, paper, parchment, wax, seal, by-my-hand.

For emphasis, use HTML <em> or <strong> tags only. Never markdown.

Respond with ONLY the closing line — no JSON, no formatting, no explanation.`;
}

function formatParamountBlock(paramount: ParamountCardEntry[]): string {
  return paramount
    .map((entry) => {
      // Lean labels — the model gets the directional signal without
      // gameplay-mechanic vocab leaking into output. The Architect's
      // VOICE is allowed (record, gallery, ledger); player-action
      // MECHANICS are not (ruled, picked, classified, skipped).
      const status = entry.classification
        ? `engaged as ${entry.classification === 'proof' ? 'supporting' : 'challenging'} the surface claim`
        : 'not engaged during the investigation';
      return `- "${entry.card.title}" (${entry.card.category}; ${status})
     ${entry.card.blurb}
     Detail: ${entry.card.fact}`;
    })
    .join('\n\n');
}

function formatRuledExtrasBlock(extras: RuledEntry[]): string {
  return extras
    .map(
      (entry) =>
        `- "${entry.card.title}" (${entry.card.category}; engaged as ${entry.classification === 'proof' ? 'supporting' : 'challenging'} the surface claim)
     ${entry.card.blurb}
     Detail: ${entry.card.fact}`,
    )
    .join('\n\n');
}
