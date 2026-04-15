import type { Classification, FullCard, Verdict } from '$lib/types';

interface EvidenceEntry {
  card: FullCard;
  classification: Classification;
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

  return `The investigation is complete. The player has rendered their verdict.

Claim investigated: "${claim}"
Verdict: ${verdictLabel}
Evidence collected: ${evidence.length} total (${proofCount} proof, ${objectionCount} objection)

All evidence examined during this investigation:
${evidenceBlock || '  (No evidence was collected — the player judged without investigation)'}

Your task: Write a character reference letter — NOT a job application cover letter — as The Architect, a theatrical magistrate who has presided over this investigation.

Requirements:
1. This is a character reference for the subject of the claim (Ashley Childress), written by The Architect as presiding magistrate. It is NOT a job application letter — there is no company, no role, no hiring manager.
2. Reference ONLY the specific evidence cards listed above. Do not invent evidence. Weave the actual card titles and facts into your prose.
3. Identify themes across the evidence — patterns the investigation revealed.
4. ${verdict === 'accuse' ? 'The subject has been found WANTING. The tone should convey that the investigation confirmed the suspicion. The evidence damns, though you may acknowledge complexity.' : 'The subject has been VINDICATED. The tone should convey that the investigation dispelled the suspicion. The evidence redeems, though you may acknowledge what gave rise to doubt.'}
5. Write 3-5 paragraphs. Be vivid, dramatic, and theatrical — worthy of a stage production. Use industrial/steampunk metaphors (gears, forges, iron, steam, mechanisms).
6. This should be unlike any character reference the reader has ever seen — memorable, specific, and dripping with theatrical authority.
7. Open with a dramatic salutation (not "To Whom It May Concern" — something theatrical).
8. Close with a dramatic flourish and sign as "The Architect, Presiding Magistrate of the Court of Suspicion."

Respond with ONLY the letter text — no JSON wrapping, no markdown formatting, no explanation. Just the letter itself.`;
}

export function buildClosingLinePrompt(verdict: Verdict): string {
  return `The investigation has concluded with a verdict of ${verdict === 'accuse' ? 'ACCUSATION' : 'PARDON'}.

Write a single dramatic closing line (1-2 sentences) as The Architect, commenting on the verdict. This is your final word — make it memorable. Use industrial/steampunk imagery.

Respond with ONLY the closing line — no JSON, no formatting, no explanation.`;
}
