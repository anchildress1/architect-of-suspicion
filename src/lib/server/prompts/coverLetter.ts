import type { FullCard, Verdict } from '$lib/types';

interface EvidenceEntry {
  card: FullCard;
  classification: 'proof' | 'objection';
}

export function buildCoverLetterPrompt(
  claim: string,
  verdict: Verdict,
  evidence: EvidenceEntry[],
): string {
  const verdictLabel = verdict === 'accuse' ? 'ACCUSED (found wanting)' : 'PARDONED (vindicated)';

  const evidenceBlock = evidence
    .map(
      (e, i) =>
        `  ${i + 1}. "${e.card.title}" (${e.card.category}) — classified as ${e.classification}
     Summary: ${e.card.blurb}
     Full context: ${e.card.fact}`,
    )
    .join('\n\n');

  const proofCount = evidence.filter((e) => e.classification === 'proof').length;
  const objectionCount = evidence.filter((e) => e.classification === 'objection').length;

  return `The investigation is complete. The player has rendered their verdict. Dismissed exhibits have been struck from the record and are not listed here.

Claim investigated: "${claim}"
Verdict: ${verdictLabel}
Ruled evidence: ${evidence.length} total (${proofCount} proof, ${objectionCount} objection)

All ruled evidence from this investigation:
${evidenceBlock || '  (No evidence was ruled on — the player judged without investigation)'}

Your task: Write a verdict brief — a character assessment dictated by The Architect, a presiding magistrate who has reviewed this investigation.

Requirements:
1. This is an assessment of the subject of the claim (Ashley Childress), filed by The Architect as presiding magistrate. It is NOT a letter, NOT a job application, NOT correspondence. There is no recipient, no company, no role, no hiring manager. Write it as a record being entered into the case file.
2. Reference ONLY the ruled evidence cards listed above. Do not invent evidence, and do not mention dismissed exhibits. Weave the actual card titles and facts into your prose.
3. Identify themes across the evidence — patterns the investigation revealed.
4. ${verdict === 'accuse' ? 'The subject has been found WANTING. The tone should convey that the investigation confirmed the suspicion. The evidence damns, though you may acknowledge complexity.' : 'The subject has been VINDICATED. The tone should convey that the investigation dispelled the suspicion. The evidence redeems, though you may acknowledge what gave rise to doubt.'}
5. Write 3-5 paragraphs. Industrial-noir register: instrument, ledger, record, gallery, mechanism, dial. Restrained authority. NEVER use Victorian or steampunk vocabulary — no "pen", no "paper", no "parchment", no "wax", no "seal", no "hand" (as in "by my hand"), no "yours faithfully" / "yours truly" sign-offs, no Roman numerals, no "To Whom It May Concern".
6. This should be unlike any character assessment the reader has ever seen — memorable, specific, dripping with magisterial authority.
7. Open with a declaration of finding, not a salutation. (e.g. "On the matter of …", "The record stands: …", "Filed this day against …".)
8. Close with a flourish and sign as "The Architect, Presiding Magistrate of the Court of Suspicion." No "Yours, …" closing.

Respond with ONLY the brief text — no JSON wrapping, no markdown formatting, no explanation. Just the brief itself.`;
}

export function buildClosingLinePrompt(verdict: Verdict): string {
  return `The investigation has concluded with a verdict of ${verdict === 'accuse' ? 'ACCUSATION' : 'PARDON'}.

Write a single dramatic closing line (1-2 sentences) as The Architect, commenting on the verdict. This is your final word — make it memorable. Industrial-noir register: instrument, ledger, record, gallery, mechanism — restrained, never gaudy, never Victorian/steampunk.

Respond with ONLY the closing line — no JSON, no formatting, no explanation.`;
}
