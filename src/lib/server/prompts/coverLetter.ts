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
    ? `Open with confidence — the dial settled where the evidence pointed. Lead with the working-style trait the record surfaces and let the verdict sit alongside it as the obvious read. The opener celebrates the trait; the verdict is the validation, not the subject.`
    : `Open by naming the working-style trait directly. Lead with what Ashley does — her trait carries the paragraph. The verdict the player rendered is rhetorical context, not the subject of the opener; the trait holds either way and the prose treats the verdict as a settled outcome that the trait now follows.`;

  const paramountBlock = formatParamountBlock(paramount);
  const extrasBlock = formatRuledExtrasBlock(ruledExtras);

  return `The examination is complete. You are entering Ashley's record into the gallery.

Claim under examination: "${claim}"
Verdict rendered: ${verdictLabel}
The hireable truth this record reveals: ${context.hireableTruth}

OPENER

${opener}

THE ARTIFACT

This is a cover letter — it attaches to Ashley's resume. In the moment a player reaches it, the reader is both a recruiter (in the long run, when the record sits next to her resume) and the player who just rendered a verdict (right now). The voice is The Architect's: sardonic AI operator of the mechanism, industrial-noir register, atmosphere of a 1700s public reckoning before a gallery rather than a courtroom proceeding. The Architect operates the mechanism; the Architect does not preside.

A sparing reference to the gallery, the examination, the dial settling, or "added to the record" anchors the player back to the game they just played — that's a feature, not a leak, when it ties to a specific exhibit or moment they engaged. One or two such references across the whole record is the ceiling. The trait, not the game-frame, carries the prose.

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

THE TRAIT STANDS ON ITS OWN

The hireable truth describes Ashley positively — what she does, what she builds, what she ships. Lead with that. A recruiter who reads "Ashley enforces constraints before features" leaves with that as her working-style posture; that's the takeaway. The trait carries on its own and doesn't need a contrast to make sense.

Describe what the evidence shows Ashley doing in her own terms. The hireable truth is a positive working-style trait; the words you use to describe her are the ones the recruiter walks away with. Lead with those words. Whatever the surface claim alleges goes unnamed — its phrasing isn't load-bearing for landing the trait, and naming it puts it in the recruiter's head where you don't want it.

THE RECRUITER-SAFETY FLOOR

This record lives next to Ashley's name. Recruiters read it.

- Anchor every paragraph on the hireable truth. The truth is the answer; the cited evidence is the proof.
- Both readings of the surface claim (proof and objection) leave Ashley sounding hireable. The verdict swings the rhetorical opener; the truth never moves.
- Style framings only. Recruiters respect "she over-engineers" or "she ships rough drafts" as professional traits.
- Two recruiters reading two different playthroughs of this claim must walk away with the same conclusion about Ashley.

REQUIREMENTS

1. Reveal the hireable truth as the spine of the record. Every paragraph supports it.
2. Pick the 3-5 strongest exhibits from the pool. Weave them into prose with concrete details — technologies, decisions, metrics, time pressure, scope.
3. 3-5 paragraphs. Polished, specific, memorable. Mechanical authority, restrained.
4. Open in the Architect's voice, anchored on the trait (see OPENER above). Not a salutation.
5. Close on the hireable truth with mechanical confidence. The component renders the Architect's signature separately; your closing is the last line of prose.

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
