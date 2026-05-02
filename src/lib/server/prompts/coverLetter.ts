import type { ClaimVerdictReadings, FullCard, Verdict } from '$lib/types';

interface EvidenceEntry {
  card: FullCard;
  classification: 'proof' | 'objection';
}

/**
 * Build the cover letter prompt.
 *
 * The verdict ("accuse" / "pardon") is gameplay framing — internal to the
 * investigation. The letter itself is a public artifact a recruiter or hiring
 * manager will read; both verdicts must resolve to a hireable working-style
 * trait recorded in `readings`. Pass 2 of the claim engine produces those
 * readings; the runtime never invents them. See AGENTS.md Invariants #8, #12.
 *
 * Ruled evidence (Proof + Objection — Dismiss is excluded upstream) is the
 * raw material. Proof readings reinforce the surfaced trait directly;
 * Objection readings nuance it — both shaped by the same verdict-anchored
 * trait. The letter never indicts competence, integrity, or professionalism.
 */
export function buildCoverLetterPrompt(
  claim: string,
  verdict: Verdict,
  evidence: EvidenceEntry[],
  readings: ClaimVerdictReadings,
): string {
  const verdictLabel = verdict === 'accuse' ? 'ACCUSED' : 'PARDONED';
  const surfacedReading = verdict === 'accuse' ? readings.guilty : readings.notGuilty;
  const counterReading = verdict === 'accuse' ? readings.notGuilty : readings.guilty;

  const evidenceBlock = evidence
    .map(
      (entry, index) =>
        `  ${index + 1}. "${entry.card.title}" (${entry.card.category}) — classified as ${entry.classification}
     Summary: ${entry.card.blurb}
     Full context: ${entry.card.fact}`,
    )
    .join('\n\n');

  const proofCount = evidence.filter((entry) => entry.classification === 'proof').length;
  const objectionCount = evidence.filter((entry) => entry.classification === 'objection').length;

  return `The investigation is complete. The player has rendered their verdict. Dismissed exhibits have been struck from the record and are not listed here.

Claim investigated: "${claim}"
Verdict: ${verdictLabel}
Trait surfaced by this verdict (anchor for the brief): ${surfacedReading}
Trait the opposite verdict would have surfaced (do NOT pivot to this — it is here only so you understand the dual reading): ${counterReading}
Ruled evidence: ${evidence.length} total (${proofCount} proof, ${objectionCount} objection)

All ruled evidence from this investigation:
${evidenceBlock || '  (No evidence was ruled on — the player judged without investigation)'}

Your task: Write a verdict brief — a character assessment dictated by The Architect, a presiding magistrate who has reviewed this investigation.

Recruiter-safety floor (NON-NEGOTIABLE):
- This brief is a public artifact that lives next to Ashley's name. Recruiters and hiring managers will read it.
- The verdict is gameplay framing, not a moral judgment. The brief MUST land as a recruiter-safe character assessment.
- Anchor the brief on the surfaced trait above. Frame the investigation as having confirmed that hireable working-style trait — not as condemning Ashley.
- NEVER write text that indicts competence, integrity, ethics, judgment, work ethic, or basic professionalism. No phrasing like "found wanting", "the evidence damns", "guilty of …", "fails at …", "lacks …", "cannot be trusted to …".
- Both Proof and Objection rulings reveal the same trait from different angles. Proof reinforces it directly; Objection nuances it (the trait shows up even where the surface evidence read the other way). Treat them as one coherent professional pattern, not as a tally of wins and losses.

Requirements:
1. This is an assessment of the subject of the claim (Ashley Childress), filed by The Architect as presiding magistrate. It is NOT a letter, NOT a job application, NOT correspondence. There is no recipient, no company, no role, no hiring manager. Write it as a record being entered into the case file.
2. Reference ONLY the ruled evidence cards listed above. Do not invent evidence, and do not mention dismissed exhibits. Weave the actual card titles and facts into your prose.
3. Make the surfaced trait the spine of the brief. Show — through the specific card titles and facts — how the ruled evidence demonstrates that trait. The trait is the answer; the evidence is the proof.
4. Identify themes across the evidence — patterns the investigation revealed that all point at the same hireable trait.
5. Write 3-5 paragraphs. Industrial-noir register: instrument, ledger, record, gallery, mechanism, dial. Restrained authority. NEVER use Victorian or steampunk vocabulary — no "pen", no "paper", no "parchment", no "wax", no "seal", no "hand" (as in "by my hand"), no "yours faithfully" / "yours truly" sign-offs, no Roman numerals, no "To Whom It May Concern".
6. This should be unlike any character assessment the reader has ever seen — memorable, specific, dripping with magisterial authority. Tension and intrigue stay; condemnation does not.
7. Open with a declaration of finding, not a salutation. (e.g. "On the matter of …", "The record stands: …", "Filed this day in the matter of …".)
8. Close with a flourish and sign as "The Architect, Presiding Magistrate of the Court of Suspicion." No "Yours, …" closing.

Respond with ONLY the brief text — no JSON wrapping, no markdown formatting, no explanation. Just the brief itself.`;
}

/**
 * Closing line prompt. Same recruiter-safety floor as the brief — the closing
 * is rendered next to the brief and must not cancel its trait-anchored
 * framing with a damning final flourish.
 */
export function buildClosingLinePrompt(verdict: Verdict, readings: ClaimVerdictReadings): string {
  const surfacedReading = verdict === 'accuse' ? readings.guilty : readings.notGuilty;
  const verdictLabel = verdict === 'accuse' ? 'ACCUSATION' : 'PARDON';

  return `The investigation has concluded with a verdict of ${verdictLabel}.
Trait the verdict surfaced (anchor for the closing): ${surfacedReading}

Write a single dramatic closing line (1-2 sentences) as The Architect, commenting on the verdict.

Recruiter-safety floor (NON-NEGOTIABLE):
- The closing is rendered next to a public character brief and must not contradict its trait-anchored framing.
- Resolve the line on the surfaced trait — confident, magisterial, recruiter-safe.
- NEVER indict competence, integrity, ethics, or basic professionalism. No phrasing like "found wanting", "guilty", "damning", "failed", "cannot be trusted".

This is your final word — make it memorable. Industrial-noir register: instrument, ledger, record, gallery, mechanism — restrained, never gaudy, never Victorian/steampunk.

Respond with ONLY the closing line — no JSON, no formatting, no explanation.`;
}
