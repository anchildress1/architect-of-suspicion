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
 * The model picks the 2-3 STRONGEST exhibits from the pool and weaves
 * them into ONE OR TWO tight paragraphs that print cleanly on a single
 * page beside the resume. Card-by-card enumeration is forbidden — the
 * record is woven, not itemized.
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

  return `Examination complete. Entering Ashley's record into the gallery.

Claim under examination: "${claim}"
Verdict rendered: ${verdictLabel}
The hireable truth this record reveals: ${context.hireableTruth}

OPENER

${opener}

THE ARTIFACT

This is a cover letter — it attaches to Ashley's resume. The reader is a recruiter and the player who just rendered a verdict. Voice: The Architect's, sardonic AI operator of the mechanism, industrial-noir register, 1700s public-reckoning atmosphere before a gallery (not a courtroom).

Sparing reference to the gallery, the examination, the dial settling, or "added to the record" anchors the player back to the game — feature, not a leak, when it ties to a specific exhibit. One or two such references across the whole record is the ceiling. The trait carries the prose, not the game-frame.

EVIDENCE

Pick the 2-3 STRONGEST exhibits from the pool below and weave them into prose. One or two tight paragraphs — prints next to a resume, brevity matters. Woven, not itemized; no card-by-card enumeration, no "the record shows" / "the evidence demonstrates" as a structural device.

PARAMOUNT (most load-bearing for the truth — prioritize these):
${paramountBlock || '  (No paramount evidence loaded — pipeline bug; reveal the truth from claim text alone.)'}

PERSONAL INVESTIGATION (exhibits engaged during the examination — personalization; the truth doesn't depend on them):
${extrasBlock || '  (No additional engaged evidence beyond the paramount set.)'}

Paramount exhibits not engaged: integrate naturally — "the gallery also bears witness to …", "added to the record: …".

VOICE AND VOCABULARY

Industrial-noir register: instrument, ledger, record, gallery, mechanism, dial, gauge, lever, scaffold, square. Welcome openers: "The mechanism has settled on …", "The record stands: …", "The dial has come to rest at …", "Witnessed this day: …", "Examined and entered into the record: …".

What was asked of Ashley = the assignment, the scope, the constraint, what she shipped against. Her work = the trait (over-engineers, ships rough drafts, leans on AI heavily, builds constraints before features). Working-style traits a recruiter reads as substance.

Refer to Ashley by name or with she/her pronouns.

THE TRAIT STANDS ON ITS OWN

The hireable truth describes Ashley positively — what she does, builds, ships. Lead with that. A recruiter reading "Ashley enforces constraints before features" leaves with that as her working-style posture. The trait carries on its own and doesn't need a contrast to make sense. Whatever the surface claim alleges goes unnamed — its phrasing isn't load-bearing for landing the trait, and naming it puts it in the recruiter's head.

RECRUITER-SAFETY FLOOR

This record lives next to Ashley's name.

- Anchor every paragraph on the hireable truth. Truth is the answer; cited evidence is the proof.
- Both readings of the surface claim (proof and objection) leave Ashley sounding hireable. Verdict swings the opener; the truth never moves.
- Style framings only — working-style traits recruiters respect.
- Two recruiters reading two different playthroughs of this claim walk away with the same conclusion about Ashley.

REQUIREMENTS

1. The hireable truth is the spine of the record. Every paragraph supports it.
2. 2-3 strongest exhibits, woven with concrete detail (technologies, decisions, metrics, scope). Fewer over more; brevity reads as confidence.
3. ONE OR TWO paragraphs total — six to ten sentences. Polished, specific, memorable. Mechanical authority, restrained.
4. Open in the Architect's voice anchored on the trait (see OPENER). Not a salutation.
5. Close on the hireable truth with mechanical confidence. Signature renders separately.

Emphasis via HTML <em>/<strong>, sparingly (one or two per paragraph max). Respond with ONLY the record text — no JSON, no markdown, no sign-off.`;
}

/**
 * Closing line prompt. Same recruiter-safety floor and voice as the
 * record — the Architect's mechanical-witness register. The line caps
 * the record like a dial settling.
 */
export function buildClosingLinePrompt(verdict: Verdict, context: ClaimTruthContext): string {
  const verdictLabel = verdict === 'accuse' ? 'ACCUSATION' : 'PARDON';

  return `Examination concluded — verdict ${verdictLabel}.
The hireable truth the record revealed: ${context.hireableTruth}

Write a single dramatic closing line (1-2 sentences) in The Architect's voice — sardonic AI operator of the mechanism. The line caps the record like a dial settling.

Voice: industrial-noir register (instrument, ledger, mechanism, gallery, record, dial). 1700s public-reckoning atmosphere, not a courtroom.

Anchor the line on the hireable truth. Confident, restrained, recruiter-safe. Style framings only — lands a working-style trait, not a moral judgment.

Emphasis via HTML <em>/<strong>. No markdown. Respond with ONLY the closing line — no JSON, no explanation.`;
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
