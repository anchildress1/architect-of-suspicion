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
 * is the AI operator of the mechanism; the reader is a recruiter or hiring
 * manager. The voice stays the Architect's — sardonic AI, industrial-noir
 * register, public-reckoning atmosphere.
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
 * The model picks the 3-5 STRONGEST exhibits from the pool and weaves
 * them into prose. Card-by-card enumeration is forbidden — the record is
 * woven, not itemized.
 *
 * AGENTS.md Invariant #8 still applies: the cover letter must read as
 * recruiter-safe under either verdict, never indicting competence,
 * integrity, or professionalism.
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
    ? 'Open with the truth landing clearly through this lens — the chosen reading aligns with the record.'
    : 'Open with the truth holding even when the surface reading suggested otherwise. Acknowledge the tension; the trait still lands.';

  const paramountBlock = formatParamountBlock(paramount);
  const extrasBlock = formatRuledExtrasBlock(ruledExtras);

  return `The examination is complete. You are entering Ashley's record into the gallery.

Claim under examination: "${claim}"
Verdict rendered: ${verdictLabel}
Verdict alignment: ${verdictMatches ? 'YES (the chosen reading matches the record)' : 'NO (the record contradicts the chosen reading)'}
The hireable truth this record reveals: ${context.hireableTruth}

${opener}

THE ARTIFACT

This is a cover letter — it attaches to Ashley's resume. The reader is a recruiter or hiring manager with the resume in their other hand. The voice is The Architect's: sardonic AI operator of the mechanism, industrial-noir register, atmosphere of a 1700s public reckoning before a gallery rather than a courtroom proceeding. The Architect operates the mechanism; the Architect does not preside.

The reader does not see the game that produced this record. They see the record itself. The Architect speaks; what's referenced is the examination, the gallery, the evidence struck into the record.

EVIDENCE

Pick the 3-5 STRONGEST exhibits from the pool below and weave them into prose. The record is woven, not itemized — no bulleted exhibit list, no card-by-card enumeration, no "the record shows" / "the evidence demonstrates" used as a structural device on every paragraph. Vary the rhetoric.

PARAMOUNT (most load-bearing for the truth — prioritize these):
${paramountBlock || '  (No paramount evidence loaded — pipeline bug; reveal the truth from claim text alone.)'}

PERSONAL INVESTIGATION (exhibits engaged during the examination — useful for personalization, but the truth doesn't depend on them):
${extrasBlock || '  (No additional engaged evidence beyond the paramount set.)'}

Paramount exhibits essential to the truth that don't appear in PERSONAL INVESTIGATION: integrate them naturally into the narrative as part of the record. The Architect can enter them on his own authority — "the gallery also bears witness to …", "added to the record: …".

VOICE AND VOCABULARY

Industrial-noir register: instrument, ledger, record, gallery, mechanism, dial, gauge, lever, scaffold, square. Welcome openers in the Architect's voice include "The mechanism has settled on …", "The record stands: …", "The dial has come to rest at …", "Witnessed this day: …", "Examined and entered into the record: …".

When you refer to what was asked of Ashley, call it the assignment, the scope, the constraint, what she shipped against. When you refer to her work, name the trait — over-engineers, ships rough drafts, leans on AI heavily, builds constraints before features. These are working-style traits a recruiter reads as substance.

Refer to Ashley by name or with she/her pronouns.

THE RECRUITER-SAFETY FLOOR

This record lives next to Ashley's name. Recruiters read it.

- Anchor every paragraph on the hireable truth. The truth is the answer; the cited evidence is the proof.
- Both readings of the surface claim (proof and objection) leave Ashley sounding hireable. The verdict swings the rhetorical opener; the truth never moves.
- Style framings only. Recruiters respect "she over-engineers" or "she ships rough drafts" as professional traits. They will not respect a record that questions her competence, integrity, or judgment.
- Two recruiters reading two different playthroughs of this claim must walk away with the same conclusion about Ashley.

REQUIREMENTS

1. Reveal the hireable truth as the spine of the record. Every paragraph supports it.
2. Pick the 3-5 strongest exhibits from the pool. Weave them into prose with concrete details — technologies, decisions, metrics, time pressure, scope.
3. 3-5 paragraphs. Polished, specific, memorable. Mechanical authority, restrained.
4. Open in the Architect's voice on the truth (or its consequence) — not a salutation.
5. Close on the hireable truth with mechanical confidence. The component renders the Architect's signature separately; your closing is the last line of prose.
6. Audience: a recruiter reading a cover letter attached to Ashley's resume. The reader sees the record, not the game that produced it. Speak to that reader.

For emphasis, use HTML <em> or <strong> tags. Use sparingly — at most one or two highlights per paragraph; less is stronger.

Respond with ONLY the record text — no JSON wrapping, no markdown, no sign-off, no explanation. Just the prose.`;
}

/**
 * Closing line prompt. Same recruiter-safety floor and voice as the
 * record — the Architect's mechanical-witness register. The line caps
 * the record like a dial settling.
 */
export function buildClosingLinePrompt(verdict: Verdict, context: ClaimTruthContext): string {
  const verdictLabel = verdict === 'accuse' ? 'ACCUSATION' : 'PARDON';

  return `The examination has concluded with a verdict of ${verdictLabel}.
The hireable truth the record revealed: ${context.hireableTruth}

Write a single dramatic closing line (1-2 sentences) in The Architect's voice — sardonic AI operator of the mechanism, witness to the reckoning. The line caps the record like a dial settling at the end of its travel.

Voice: industrial-noir register. Instrument, ledger, mechanism, gallery, record, dial. Atmosphere is a 1700s public reckoning, not a courtroom.

Anchor the line on the hireable truth. Confident, restrained, recruiter-safe — the closing renders next to a public character record and must not contradict its trait-anchored framing. Style framings only; the line lands a working-style trait, not a moral judgment.

For emphasis, use HTML <em> or <strong> tags. No markdown.

Respond with ONLY the closing line — no JSON, no formatting, no explanation.`;
}

// Directional label for the prompt's evidence pool. The model gets the
// engagement direction without gameplay-mechanic vocab leaking into output.
function engagedAs(classification: 'proof' | 'objection' | null): string {
  if (classification === 'proof') return 'engaged as supporting the surface claim';
  if (classification === 'objection') return 'engaged as challenging the surface claim';
  return 'not engaged during the examination';
}

function formatParamountBlock(paramount: ParamountCardEntry[]): string {
  return paramount
    .map(
      (entry) =>
        `- "${entry.card.title}" (${entry.card.category}; ${engagedAs(entry.classification)})
     ${entry.card.blurb}
     Detail: ${entry.card.fact}`,
    )
    .join('\n\n');
}

function formatRuledExtrasBlock(extras: RuledEntry[]): string {
  return extras
    .map(
      (entry) =>
        `- "${entry.card.title}" (${entry.card.category}; ${engagedAs(entry.classification)})
     ${entry.card.blurb}
     Detail: ${entry.card.fact}`,
    )
    .join('\n\n');
}
