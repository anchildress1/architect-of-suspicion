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

export interface Tension {
  theme: string;
  description: string;
  categories: string[];
}

/** Raw output of Pass 1. */
export interface TensionMap {
  tensions: Tension[];
  notes?: string;
}

/** Raw output of Pass 2. */
export interface GeneratedClaim {
  /** Stable pipeline-local key; assigned after Pass 2 parsing. */
  id: string;
  claim_text: string;
  rationale: string;
  tensions_targeted: string[];
  /** One-sentence hireable trait the `accuse` verdict surfaces. Persisted to
   *  `suspicion.claims.guilty_reading` and used by the runtime cover letter
   *  prompt so an accused verdict resolves to a recruiter-safe reading
   *  instead of a generic condemnation. */
  guilty_reading: string;
  /** One-sentence hireable trait the `pardon` verdict surfaces. Persisted to
   *  `suspicion.claims.not_guilty_reading`. Mirror of `guilty_reading` for
   *  the opposite verdict. */
  not_guilty_reading: string;
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
}

/** Pass 4 combined output: validation results + per-card arguments. */
export interface Pass4Output {
  validations: ClaimValidation[];
  /** Per-card arguments keyed by GeneratedClaim.id → card_id → argument. */
  arguments: Map<string, Map<string, CardArgument>>;
}
