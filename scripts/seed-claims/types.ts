/** Types shared across the claim engine pipeline. */

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
 *  (Architecture, Principle, Process) have no playable room. */
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
  claim_text: string;
  rationale: string;
  tensions_targeted: string[];
}

/** Per-card score for a given claim (Pass 3 output). */
export interface CardClaimScore {
  card_id: string;
  ambiguity: number;
  surprise: number;
}

/** Validation result for a single claim (Pass 4 output). */
export interface ClaimValidation {
  claim_text: string;
  room_coverage: number;
  total_eligible_cards: number;
  survived: boolean;
  cut_reason?: string;
  eligible_card_ids: string[];
}

/** Final seed payload written to Supabase. */
export interface SeedPayload {
  claim_text: string;
  rationale: string;
  room_coverage: number;
  total_eligible_cards: number;
  cards: CardClaimScore[];
}

/** Output of Pass 3: floor-cleared scores per claim + ranked selection for Pass 4. */
export interface Pass3Result {
  /** Cards that cleared the quality floor, keyed by claim_text. */
  scored: Map<string, CardClaimScore[]>;
  /** Top-N claims by card-pool quality (rooms² × count × avg score), in rank order. */
  selected: GeneratedClaim[];
}

/** Pass 4 combined output: validation results + claim-specific blurb rewrites. */
export interface Pass4Output {
  validations: ClaimValidation[];
  /** Rewritten blurbs keyed by claim_text → card_id. Generated in the same
   *  pass as false-ambiguity detection to avoid a separate API round-trip. */
  rewrites: Map<string, Map<string, string>>;
}
