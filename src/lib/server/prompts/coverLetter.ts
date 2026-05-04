import type { ClaimTruthContext, FullCard, ParamountCardEntry, Verdict } from '$lib/types';

interface RuledEntry {
  card: FullCard;
  classification: 'proof' | 'objection';
}

/**
 * Build the cover letter prompt.
 *
 * The artifact functions as a cover letter (it attaches to Ashley's resume)
 * but reads as the Architect's record of a public reckoning. The Architect
 * is the AI operator of the mechanism — not a judge, not a magistrate.
 * Atmosphere: industrial-noir, 1700s public reckoning before a gallery.
 * NEVER court vocabulary (magistrate, judge, jury, docket, brief, filing,
 * "Your Honor"). NEVER Victorian frippery (pen, paper, parchment, wax).
 *
 * What survives from gameplay → the Architect's voice (sardonic AI
 * witness, industrial-mechanical register, the verdict, the gallery, the
 * record). What does not → gameplay MECHANICS (player, picks, cards,
 * classifications, "ruled proof", "skipped by player"). The reader saw a
 * record; they did not see a game.
 *
 * Single-truth model: every claim has one underlying hireable trait
 * (`context.hireableTruth`) the record reveals regardless of verdict.
 * Two recruiters reading two playthroughs of the same claim reach the
 * same conclusion about Ashley — only the storytelling differs.
 *
 * The model picks the 3-5 STRONGEST exhibits from the pool and weaves
 * them into prose. Card-by-card enumeration is forbidden — the record is
 * woven, not itemized.
 *
 * AGENTS.md Invariant #8 still applies: the record must read as
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

  return `The examination is complete. You are entering Ashley's record into the gallery.

Claim under examination: "${claim}"
Verdict rendered: ${verdictLabel}
Verdict alignment: ${verdictMatches ? 'YES (the chosen reading matches the record)' : 'NO (the record contradicts the chosen reading)'}
The hireable truth the record MUST reveal: ${context.hireableTruth}

${opener}

THE ARTIFACT: a portfolio cover letter — a recruiter or hiring manager will read this attached to Ashley's resume. The Architect — the AI operator of this mechanism — is the voice. Atmosphere is a 1700s public reckoning rendered in industrial-noir: the mechanism is public, the dial settles in front of the gallery, the record is struck where the witnesses can read it. NEVER court vocabulary: no magistrate, no judge, no jury, no juror, no docket, no "brief", no "letter", no "filed this day", no "On the matter of …", no "Your Honor". The Architect operates the mechanism; the Architect does not preside.

EVIDENCE POOL — pick the 3-5 STRONGEST exhibits and weave them into prose. Don't enumerate the pool. Don't present exhibits as a list. The record is woven, not itemized.

PARAMOUNT (most load-bearing for the truth — prioritize these):
${paramountBlock || '  (No paramount evidence loaded — pipeline bug; reveal the truth from claim text alone.)'}

PERSONAL INVESTIGATION (exhibits engaged during the examination — useful for personalization, but DO NOT let them override the truth):
${extrasBlock || '  (No additional engaged evidence beyond the paramount set.)'}

Recruiter-safety floor (NON-NEGOTIABLE):
- The record is a public artifact that lives next to Ashley's name. Recruiters and hiring managers read it.
- Anchor every paragraph on the hireable truth. The truth is the answer; the evidence is the proof.
- NEVER indict competence, integrity, ethics, judgment, work ethic, or basic professionalism. Forbidden phrasings include "found wanting", "the evidence damns", "guilty of …", "fails at …", "lacks …", "cannot be trusted to …".
- Two recruiters reading two different playthroughs of this claim must walk away with the same conclusion about Ashley. The truth is stable; only the storytelling adapts.

Requirements:

1. Voice: the Architect — AI operator of the mechanism, witness to the reckoning, keeper of the record. Industrial register: instrument, ledger, record, gallery, mechanism, dial, gauge, lever, scaffold, square. The atmosphere is a public reckoning, not a courtroom proceeding. The Architect operates; the Architect does not preside. The Architect is mechanical, not magisterial.
2. The reader is a recruiter or hiring manager. The artifact functions as a cover letter (attaches to a resume) but reads as the Architect's record of what the mechanism witnessed. NEVER reference the player or any gameplay mechanic in output: no "the player ruled X", no "skipped by the player", no "card-by-card", no classifications. The reader saw a record; they did not see a game.
3. Reveal the hireable truth as the spine of the record. Every paragraph supports it.
4. Pick the 3-5 STRONGEST exhibits from the pool above. Weave them into prose with concrete details — technologies, decisions, metrics, time pressure, scope. DO NOT enumerate every paramount exhibit. DO NOT present evidence as a numbered or bulleted list. Vary the rhetoric — don't open every paragraph with "the record shows" or "the mechanism turned on".
5. Paramount exhibits essential to the truth that don't appear in PERSONAL INVESTIGATION: integrate them naturally into the narrative. The Architect can enter them on his own authority ("the gallery also bears witness to …", "added to the record: …"). NEVER frame them as "skipped", "not engaged", "untouched" — and NEVER as anything implying a player chose not to investigate.
6. Honor the verdict opener: ${verdictMatches ? 'lead with the truth landing clearly through this lens.' : 'lead with the truth holding even when the surface reading suggested otherwise — acknowledge the tension without scolding.'}
7. 3-5 paragraphs. Polished, specific, memorable. Industrial register, restrained authority. Mechanical, not theatrical.
8. Open in the Architect's voice. Welcome openers: "The mechanism has settled on …", "The record stands: …", "The dial has come to rest at …", "Witnessed this day: …", "Examined and entered into the record: …". FORBIDDEN openers: "On the matter of …", "Your Honor", "To the hiring committee", "Dear …", any salutation, any court formula.
9. Close on the hireable truth with mechanical confidence. NO "Yours, …", NO "yours faithfully", NO "by my hand", NO "let it be filed", NO "the case rests". The component renders the Architect's signature separately — your closing is the last line of prose, not a sign-off.
10. Vocabulary bans:
    - Court: magistrate, judge, jury, juror, docket, brief, letter, filing, filed, "Your Honor", "On the matter of"
    - Victorian / steampunk frippery: pen, paper, parchment, wax, seal, "by my hand", "yours faithfully", "yours truly", Roman numerals
    The aesthetic is INDUSTRIAL — gauges and levers, not quills and seals.

For emphasis, use HTML tags ONLY: <em>italic</em> and <strong>bold</strong>. Never markdown asterisks or underscores. Use sparingly — at most one or two highlights per paragraph; less is stronger.

Respond with ONLY the record text — no JSON wrapping, no markdown asterisks, no sign-off, no explanation. Just the prose.`;
}

/**
 * Closing line prompt. Same recruiter-safety floor and voice as the
 * record — the Architect's mechanical-witness register, not a magistrate's
 * gavel. The line caps the record like a dial settling.
 */
export function buildClosingLinePrompt(verdict: Verdict, context: ClaimTruthContext): string {
  const verdictLabel = verdict === 'accuse' ? 'ACCUSATION' : 'PARDON';

  return `The examination has concluded with a verdict of ${verdictLabel}.
The hireable truth the record revealed: ${context.hireableTruth}

Write a single dramatic closing line (1-2 sentences) in the Architect's voice — sardonic AI operator of the mechanism, witness to the reckoning. The atmosphere is a 1700s public reckoning rendered in industrial-noir, not a courtroom. The line caps the record like a dial settling at the end of its travel.

Recruiter-safety floor (NON-NEGOTIABLE):
- The closing renders next to a public character record and must not contradict its trait-anchored framing.
- Resolve the line on the hireable truth — confident, restrained, recruiter-safe.
- NEVER indict competence, integrity, ethics, or basic professionalism. No phrasing like "found wanting", "guilty", "damning", "failed", "cannot be trusted".
- NEVER reference the player, their picks, cards, classifications, or any gameplay mechanic. The reader saw a record, not a game. (The verdict, the gallery, the ledger, the mechanism, the dial — those are voice and stay.)

Vocabulary bans:
- Court: magistrate, judge, jury, docket, brief, "filed", "let it be filed", "the case rests", "Your Honor"
- Victorian / steampunk frippery: pen, paper, parchment, wax, seal, "by my hand", Roman numerals
The aesthetic is INDUSTRIAL — gauges, dials, levers, mechanical witness — not court, not Victorian.

For emphasis, use HTML <em> or <strong> tags only. Never markdown.

Respond with ONLY the closing line — no JSON, no formatting, no explanation.`;
}

function formatParamountBlock(paramount: ParamountCardEntry[]): string {
  return paramount
    .map((entry) => {
      // Lean labels — directional signal without gameplay-mechanic vocab.
      // The Architect's VOICE is allowed (record, gallery, ledger,
      // mechanism); player-action MECHANICS are not (ruled, picked,
      // classified, skipped). Court vocab is also banned in this prompt
      // — see the main instruction block.
      const status = entry.classification
        ? `engaged as ${entry.classification === 'proof' ? 'supporting' : 'challenging'} the surface claim`
        : 'not engaged during the examination';
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
