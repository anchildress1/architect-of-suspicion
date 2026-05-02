import type { ClaimTruthContext, FullCard, ParamountCardEntry, Verdict } from '$lib/types';

interface RuledEntry {
  card: FullCard;
  classification: 'proof' | 'objection';
}

/**
 * Build the cover letter prompt.
 *
 * Single-truth model: every claim has ONE underlying hireable trait
 * (`context.hireableTruth`) the brief reveals regardless of verdict. Two
 * recruiters investigating the same claim reach the same conclusion about
 * Ashley — only the storytelling differs.
 *
 * Verdict's role is rhetorical, not factual. `context.desiredVerdict` says
 * which way the FULL evidence actually leans against the surface claim.
 * When the player's verdict matches, the brief opens "you saw it clearly."
 * When it misses, the brief opens "the record corrects you." Either way
 * the trait lands.
 *
 * Paramount cards are surfaced regardless of whether the player ruled them.
 * Paramount-but-skipped become explicit gap call-outs ("the player did not
 * call X to the stand") so the brief reads as a record, not a remix of
 * whatever the player happened to engage with.
 *
 * Ruled non-paramount cards add personalization — they're cited as the
 * player's investigation, but the underlying truth doesn't depend on which
 * subset got picked.
 *
 * AGENTS.md Invariant #8 still applies: the brief must read as recruiter-
 * safe under either verdict, never indicting competence/integrity/
 * professionalism.
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
    ? 'OPEN AS: the player saw the truth clearly. Their verdict aligns with the record.'
    : 'OPEN AS: the player misread the evidence. The record corrects them — without scolding, with magisterial authority. The truth still lands.';

  const paramountBlock = formatParamountBlock(paramount);
  const extrasBlock = formatRuledExtrasBlock(ruledExtras);

  return `The investigation is complete. The player has rendered their verdict.

Claim investigated: "${claim}"
Verdict the player rendered: ${verdictLabel}
The hireable truth the brief MUST reveal: ${context.hireableTruth}
Whether the player's verdict aligns with the truth: ${verdictMatches ? 'YES (their reading matches the record)' : 'NO (the record contradicts their reading)'}

${opener}

PARAMOUNT EVIDENCE — the cards essential to landing the truth. Surface every one of these. Cards the player did NOT rule must be called out as gaps — frame them as evidence the magistrate enters into the record because the investigation skipped them. Cards the player ruled get cited with their classification.

${paramountBlock || '  (No paramount evidence loaded — pipeline bug; reveal the truth from claim text alone.)'}

PLAYER'S OTHER RULINGS — non-paramount cards the player chose to investigate. Cite them as the player's personal investigation, but do NOT let them shift the truth: the truth is fixed.

${extrasBlock || '  (No additional ruled evidence beyond the paramount set.)'}

Your task: Write a verdict brief — a character assessment dictated by The Architect, a presiding magistrate who has reviewed this investigation.

Recruiter-safety floor (NON-NEGOTIABLE):
- This brief is a public artifact that lives next to Ashley's name. Recruiters and hiring managers will read it.
- Anchor every paragraph on the hireable truth. The truth is the answer; the evidence is the proof.
- NEVER indict competence, integrity, ethics, judgment, work ethic, or basic professionalism. Forbidden phrasings include "found wanting", "the evidence damns", "guilty of …", "fails at …", "lacks …", "cannot be trusted to …".
- Two recruiters reading two different playthroughs of this claim must walk away with the same conclusion about Ashley. The truth is stable; only the storytelling adapts.

Requirements:
1. This is an assessment of Ashley Childress, filed by The Architect as presiding magistrate. It is NOT a letter, NOT a job application, NOT correspondence. There is no recipient, no company, no role, no hiring manager. Write it as a record being entered into the case file.
2. Reveal the hireable truth as the spine of the brief. Treat all cited evidence as proof of that truth.
3. Surface every paramount card. For paramount cards the player skipped, name them and enter them into the record on the player's behalf — magisterial authority, not blame.
4. Cite the player's other rulings as personalization. Match their classifications, but never let a Proof or Objection ruling deflect from the truth — the rulings shape the rhetoric, not the conclusion.
5. Honor the verdict opener: ${verdictMatches ? 'lead with the player having seen it clearly.' : 'lead with the record correcting the player. No scolding; the brief still lands the truth.'}
6. 3-5 paragraphs. Industrial-noir register: instrument, ledger, record, gallery, mechanism, dial. Restrained authority. NEVER use Victorian or steampunk vocabulary — no "pen", no "paper", no "parchment", no "wax", no "seal", no "hand" (as in "by my hand"), no "yours faithfully" / "yours truly" sign-offs, no Roman numerals, no "To Whom It May Concern".
7. Memorable, specific, dripping with magisterial authority. Tension stays in the storytelling; condemnation does not.
8. Open with a declaration of finding, not a salutation. (e.g. "On the matter of …", "The record stands: …", "Filed this day in the matter of …".)
9. Close with a flourish and sign as "The Architect, Presiding Magistrate of the Court of Suspicion." No "Yours, …" closing.

Respond with ONLY the brief text — no JSON wrapping, no markdown formatting, no explanation. Just the brief itself.`;
}

/**
 * Closing line prompt. Same recruiter-safety floor as the brief — anchored
 * on the same hireable truth so the closing can't cancel the brief's
 * trait-based framing with a damning final flourish.
 */
export function buildClosingLinePrompt(verdict: Verdict, context: ClaimTruthContext): string {
  const verdictLabel = verdict === 'accuse' ? 'ACCUSATION' : 'PARDON';

  return `The investigation has concluded with a verdict of ${verdictLabel}.
The hireable truth the brief revealed: ${context.hireableTruth}

Write a single dramatic closing line (1-2 sentences) as The Architect, commenting on the verdict.

Recruiter-safety floor (NON-NEGOTIABLE):
- The closing is rendered next to a public character brief and must not contradict its trait-anchored framing.
- Resolve the line on the hireable truth — confident, magisterial, recruiter-safe.
- NEVER indict competence, integrity, ethics, or basic professionalism. No phrasing like "found wanting", "guilty", "damning", "failed", "cannot be trusted".

Make it memorable. Industrial-noir register: instrument, ledger, record, gallery, mechanism — restrained, never gaudy, never Victorian/steampunk.

Respond with ONLY the closing line — no JSON, no formatting, no explanation.`;
}

function formatParamountBlock(paramount: ParamountCardEntry[]): string {
  return paramount
    .map((entry, index) => {
      const status = entry.classification
        ? `RULED ${entry.classification.toUpperCase()} by player`
        : 'SKIPPED by player — surface as a gap';
      return `  ${index + 1}. "${entry.card.title}" (${entry.card.category}) — ${status}
     Summary: ${entry.card.blurb}
     Full context: ${entry.card.fact}`;
    })
    .join('\n\n');
}

function formatRuledExtrasBlock(extras: RuledEntry[]): string {
  return extras
    .map(
      (entry, index) =>
        `  ${index + 1}. "${entry.card.title}" (${entry.card.category}) — RULED ${entry.classification.toUpperCase()} by player
     Summary: ${entry.card.blurb}
     Full context: ${entry.card.fact}`,
    )
    .join('\n\n');
}
