import type { ClaimTruthContext, FullCard, ParamountCardEntry, Verdict } from '$lib/types';

interface RuledEntry {
  card: FullCard;
  classification: 'proof' | 'objection';
}

/**
 * Build the cover letter prompt.
 *
 * The cover letter is a portfolio artifact a recruiter or hiring manager
 * reads — it attaches to a resume. The reader has no idea a game preceded
 * it; the prompt must NEVER reference players, verdicts, courts, juries,
 * cases, or filings.
 *
 * Single-truth model: every claim has one underlying hireable trait
 * (`context.hireableTruth`) the cover letter reveals regardless of verdict.
 * Two recruiters reading two playthroughs of the same claim reach the same
 * conclusion about Ashley — only the storytelling differs.
 *
 * Verdict's role is rhetorical, not factual. `context.desiredVerdict` says
 * which way the FULL evidence actually leans against the surface claim.
 * When the player's verdict matches, the opener leans into the truth as
 * the obvious reading. When it misses, the opener leans into how the truth
 * holds even when the surface suggests otherwise.
 *
 * The model picks the 3-5 STRONGEST pieces of evidence from the pool and
 * weaves them into prose. Card-by-card enumeration is forbidden — that's
 * a transcript, not a portfolio piece.
 *
 * AGENTS.md Invariant #8 still applies: the cover letter must read as
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
  const opener = verdictMatches
    ? 'OPEN AS: the truth lands clearly through this lens — the chosen reading aligns with the record.'
    : 'OPEN AS: the truth holds even when the surface reading suggests otherwise. Acknowledge the tension without scolding; the trait still lands.';

  const paramountBlock = formatParamountBlock(paramount);
  const extrasBlock = formatRuledExtrasBlock(ruledExtras);

  return `You are writing a portfolio cover letter for Ashley Childress, a software engineer. The reader is a recruiter or hiring manager — this artifact attaches to a resume.

Claim under examination: "${claim}"
Verdict alignment: ${verdictMatches ? 'YES (the chosen reading matches the record)' : 'NO (the record contradicts the chosen reading)'}
The hireable truth the cover letter MUST reveal: ${context.hireableTruth}

${opener}

EVIDENCE POOL — pick the 3-5 STRONGEST pieces and weave them into prose. Don't enumerate the pool. Don't present cards as a list. The reader is a recruiter, not a juror.

PARAMOUNT (most load-bearing for the truth — prioritize these):
${paramountBlock || '  (No paramount evidence loaded — pipeline bug; reveal the truth from claim text alone.)'}

PERSONAL INVESTIGATION (cards engaged during evaluation — useful for personalization, but DO NOT let them override the truth):
${extrasBlock || '  (No additional engaged evidence beyond the paramount set.)'}

Recruiter-safety floor (NON-NEGOTIABLE):
- The cover letter is a public artifact that lives next to Ashley's name. Recruiters and hiring managers read it.
- Anchor every paragraph on the hireable truth. The truth is the answer; the evidence is the proof.
- NEVER indict competence, integrity, ethics, judgment, work ethic, or basic professionalism. Forbidden phrasings include "found wanting", "the evidence damns", "guilty of …", "fails at …", "lacks …", "cannot be trusted to …".
- Two recruiters reading two different playthroughs of this claim must walk away with the same conclusion about Ashley. The truth is stable; only the storytelling adapts.

Requirements:

1. Audience: a hiring manager or recruiter. NEVER reference players, verdicts, courts, juries, cases, filings, magistrates, "the gallery", "the brief", "Your Honor", or any courtroom framing. The reader has no idea a game preceded this — write as if the cover letter stands alone.
2. Reveal the hireable truth as the spine of the cover letter. Every paragraph supports it.
3. Pick the 3-5 STRONGEST pieces of evidence from the pool above. Weave them into prose with concrete details — technologies, decisions, metrics, time pressure, scope. DO NOT enumerate every paramount card. DO NOT present evidence as a numbered or bulleted list. DO NOT say "the record shows" / "the evidence demonstrates" as a structural device — that's transcript voice, not portfolio voice.
4. Paramount cards essential to the truth that don't appear in PERSONAL INVESTIGATION: integrate them naturally into the narrative. NEVER frame an absent card as "skipped", "not engaged", "untouched", or "the player did not …". The reader doesn't know there was a player.
5. Honor the verdict opener: ${verdictMatches ? 'lead with the truth landing clearly through this lens.' : 'lead with the truth holding even when the surface reading suggested otherwise — acknowledge the tension without scolding.'}
6. 3-5 paragraphs. Polished, professional, specific, memorable. Industrial-noir flavor is OK as restrained register (instrument, ledger, mechanism, dial) but NEVER as gameplay LARP. NO case numbers. NO "Filed this day". NO verdict pronouncements. NO "On the matter of …". NO sign-off in the body — the surrounding component renders the signature separately.
7. Open with a hook anchored on the hireable truth — a sentence that names the trait or its consequence. NOT a salutation, NOT a finding, NOT a courtroom opener.
8. Close with a confident pitch landing on the hireable truth. NO sign-off line, NO "Yours, …", NO Architect signature. Just end on the trait.
9. Never use Victorian or steampunk vocabulary — no "pen", "paper", "parchment", "wax", "seal", "hand" (as in "by my hand"), "yours faithfully", "yours truly", Roman numerals, "To Whom It May Concern".

For emphasis, use HTML tags ONLY: <em>italic</em> and <strong>bold</strong>. Never markdown asterisks or underscores. Use sparingly — at most one or two highlights per paragraph; less is stronger.

Respond with ONLY the cover letter text — no JSON wrapping, no markdown asterisks, no signature line, no explanation. Just the prose.`;
}

/**
 * Closing line prompt. Same recruiter-safety floor as the cover letter —
 * anchored on the same hireable truth so the closing can't cancel the
 * cover letter's trait-based framing with a damning final flourish.
 *
 * The closing renders as a separate flourish next to the cover letter
 * body — it should land like a tagline, not a courtroom verdict.
 */
export function buildClosingLinePrompt(verdict: Verdict, context: ClaimTruthContext): string {
  const verdictLabel = verdict === 'accuse' ? 'ACCUSATION' : 'PARDON';

  return `The investigation has concluded with a verdict of ${verdictLabel}.
The hireable truth the cover letter revealed: ${context.hireableTruth}

Write a single dramatic closing line (1-2 sentences) that caps the cover letter. The reader is a recruiter — this is portfolio output, not a courtroom flourish.

Recruiter-safety floor (NON-NEGOTIABLE):
- The closing renders next to a public character cover letter and must not contradict its trait-anchored framing.
- Resolve the line on the hireable truth — confident, restrained, recruiter-safe.
- NEVER indict competence, integrity, ethics, or basic professionalism. No phrasing like "found wanting", "guilty", "damning", "failed", "cannot be trusted".
- NEVER reference players, verdicts, courts, juries, cases, magistrates, or any gameplay framing. The reader doesn't know a game preceded this.

Make it memorable. Industrial-noir flavor OK as restrained register — instrument, ledger, mechanism — but NOT as gameplay LARP. NO case numbers. NO "let it be filed". NO Victorian/steampunk vocabulary.

For emphasis, use HTML <em> or <strong> tags only. Never markdown.

Respond with ONLY the closing line — no JSON, no formatting, no explanation.`;
}

function formatParamountBlock(paramount: ParamountCardEntry[]): string {
  return paramount
    .map((entry) => {
      // Lean labels — the model gets the directional signal without the
      // gameplay vocab leaking into output. "engaged supporting" /
      // "engaged challenging" / "not engaged" instead of
      // "RULED PROOF" / "RULED OBJECTION" / "SKIPPED by player".
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
