/** Types shared across the claim engine pipeline. */

export interface CardRow {
  objectID: string;
  title: string;
  blurb: string;
  category: string;
  signal: number;
  fact: string | null;
}

/** Room slugs gameplay uses; matches src/lib/rooms.ts. Entry Hall & Attic
 *  are excluded from coverage checks per the PRD. */
export const GAMEPLAY_ROOMS = [
  'gallery',
  'control-room',
  'parlor',
  'library',
  'workshop',
  'cellar',
  'back-hall',
  'mansion',
] as const;

export type RoomSlug = (typeof GAMEPLAY_ROOMS)[number];

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
  false_ambiguity_card_ids: string[];
}

/** Final seed payload written to Supabase. */
export interface SeedPayload {
  claim_text: string;
  rationale: string;
  room_coverage: number;
  total_eligible_cards: number;
  cards: CardClaimScore[];
}
