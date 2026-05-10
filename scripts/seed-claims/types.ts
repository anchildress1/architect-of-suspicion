/** Types shared across the claim engine pipeline. */

/** jsonb tags are stored as { lvl0: string[]; lvl1: string[]? } — lvl1
 *  entries look like "DEV Challenge > DEV April Fools 2026" and carry more
 *  signal than lvl0 alone. Optional because not every card has lvl1. */
export interface CardTags {
  lvl0?: string[];
  lvl1?: string[];
}

export interface CardRow {
  objectID: string;
  title: string;
  blurb: string;
  category: string;
  signal: number;
  fact: string | null;
  /** ISO 8601 timestamp from public.cards.created_at — used for temporal reasoning
   *  in Pass 4 (did this pattern evolve over time, or is it genuinely contradictory?). */
  created_at: string | null;
  /** Hierarchical tags — carry work/play + deadline signals the seed passes
   *  need to calibrate ambiguity/surprise and shape the Architect's framing.
   *  Examples: "DEV Challenge > WeCoded 2026", "THD > …". */
  tags: CardTags | null;
  /** Project labels — rough work/play bucketing. Personal-brand projects
   *  (e.g. "CheckMark", "System Notes") are play; employer/client project
   *  names are work. */
  projects: string[] | null;
}

/** Room slugs gameplay uses; matches src/lib/rooms.ts. Entry Hall & Attic
 *  are excluded from coverage checks per the PRD. 7 playable rooms total. */
export const GAMEPLAY_ROOMS = [
  'gallery',
  'control-room',
  'parlor',
  'library',
  'workshop',
  'cellar',
  'back-hall',
] as const;

export type RoomSlug = (typeof GAMEPLAY_ROOMS)[number];

/** Maps card category → playable room slug. Categories omitted here
 *  (About) have no playable room — About cards are excluded from gameplay per Invariant #9. */
export const CATEGORY_TO_ROOM: Record<string, RoomSlug> = {
  Awards: 'gallery',
  Constraints: 'control-room',
  Decisions: 'parlor',
  Philosophy: 'library',
  Experimentation: 'workshop',
  'Work Style': 'cellar',
  Experience: 'back-hall',
};

/** A candidate hireable truth Pass 1 surfaces. The truth is the underlying
 *  positive professional trait the brief always reveals. The reasonable_doubt
 *  framing is how the trait can be questioned in good faith — Pass 2 turns
 *  that into the surface claim. */
export interface HireableTruth {
  /** The underlying positive trait, one sentence. ("Ashley weaponizes AI",
   *  not "Ashley uses AI a lot".) */
  truth: string;
  /** How a reasonable observer could doubt the truth from limited evidence —
   *  the seed of a claim. */
  reasonable_doubt: string;
  /** Card categories that carry the strongest signal for this truth. Used by
   *  Pass 2 to ground the claim and by Pass 3 to bias scoring. */
  categories: string[];
}

/** Raw output of Pass 1 — candidate truths to feed claim generation. */
export interface TruthMap {
  truths: HireableTruth[];
  notes?: string;
}

/** Raw output of Pass 2. */
export interface GeneratedClaim {
  /** Stable pipeline-local key; assigned after Pass 2 parsing. */
  id: string;
  /** The surface accusation — reasonable-doubt framing of the underlying
   *  truth. ("Ashley uses AI too much" — claim_text. "Ashley weaponizes AI"
   *  — hireable_truth.) */
  claim_text: string;
  /** Brief rationale for which evidence the claim hangs on. */
  rationale: string;
  /** Pass 1 truths the claim derives from — quoted truth strings, used for
   *  audit/debug logs only. Not persisted to the DB. */
  truths_targeted: string[];
  /** The single positive professional trait the brief reveals regardless of
   *  verdict. Pass 2 carries this from Pass 1; persist writes it to
   *  `suspicion.claims.hireable_truth`. */
  hireable_truth: string;
  /** Whether the surface claim is actually TRUE of Ashley:
   *  - `accuse` — the surface accusation aligns with the truth (player
   *    Accuses to be right)
   *  - `pardon` — the surface accusation is false; the truth contradicts it
   *    (player Pardons to be right)
   *  Persisted to `suspicion.claims.desired_verdict`. Drives the rhetorical
   *  opener of the brief — match means the player saw the truth clearly,
   *  miss means the record corrects them. */
  desired_verdict: 'accuse' | 'pardon';
}

/** Per-card score for a given claim (Pass 3 output). */
export interface CardClaimScore {
  card_id: string;
  ambiguity: number;
  surprise: number;
}

/** Validation result for a single claim (Pass 4 output). */
export interface ClaimValidation {
  claim_id: string;
  claim_text: string;
  room_coverage: number;
  total_eligible_cards: number;
  survived: boolean;
  cut_reason?: string;
  eligible_card_ids: string[];
}

/** Output of Pass 3: floor-cleared scores per claim + ranked selection for Pass 4. */
export interface Pass3Result {
  /** Cards that cleared the quality floor, keyed by GeneratedClaim.id. */
  scored: Map<string, CardClaimScore[]>;
  /** Top-N claims by card-pool quality (rooms² × count × avg score), in rank order. */
  selected: GeneratedClaim[];
}

/** Per-card claim-specific output of Pass 4: rewritten blurb + directional score. */
export interface CardArgument {
  /** Player-facing blurb rewritten to create tension against this claim. */
  rewrittenBlurb: string;
  /** Directional score in [-1.0, 1.0]. Sign = direction (positive supports
   *  the claim, negative undermines it). Magnitude = confidence. Pre-seeded
   *  so the runtime never needs to call an LLM to score a pick. */
  aiScore: number;
  /** Server-only auditor note: tension levers used, how work/play + deadline
   *  context shaped the rewrite, and any caveats a QA reviewer should check.
   *  Persisted to `suspicion.claim_cards.notes`. Never crosses the wire to
   *  the client (same posture as `fact` on public.cards). */
  notes: string;
  /** True for the small set of cards essential to revealing the
   *  hireable_truth in the brief. The runtime cover letter prompt surfaces
   *  these even if the player skipped them — paramount-but-skipped becomes
   *  an explicit "the player did not call X to the stand" gap call-out. Set
   *  by persist after Pass 4 from |ai_score| with room-coverage balancing. */
  isParamount: boolean;
}

/** Pass 4 combined output: validation results + per-card arguments. */
export interface Pass4Output {
  validations: ClaimValidation[];
  /** Per-card arguments keyed by GeneratedClaim.id → card_id → argument. */
  arguments: Map<string, Map<string, CardArgument>>;
}
