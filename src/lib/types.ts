/**
 * Player's classification of an exhibit. Witness mode adds 'dismiss' (struck
 * from the record — no contribution to the Architect's attention meter).
 */
export type Classification = 'proof' | 'objection' | 'dismiss';

export type Verdict = 'accuse' | 'pardon';

/** A claim row from suspicion.claims. Player-facing fields only. */
export interface Claim {
  id: string;
  text: string;
}

/** A claim_cards row joined with the player-visible card fields.
 *  `blurb` is the rewritten claim-specific blurb from Pass 4 — it pulls the
 *  reader two ways without revealing the direction. */
export interface ClaimCardEntry {
  objectID: string;
  title: string;
  blurb: string;
  category: string;
  /** Pre-computed ambiguity * surprise. Drives Witness mode ordering
   *  (least-charged exhibits called first, most-charged last). */
  weight: number;
}

/** Card with server-only `fact` field included. Used inside server routes
 *  for richer Architect reaction prompts. Never serialized to the client. */
export interface FullCard {
  objectID: string;
  title: string;
  blurb: string;
  fact: string;
  category: string;
  signal: number;
}

export interface Evidence {
  card: ClaimCardEntry;
  classification: Classification;
}

export interface FeedEntry {
  id: string;
  type: 'action' | 'reaction' | 'narration';
  text: string;
  timestamp: number;
}

export interface GameState {
  sessionId: string | null;
  claimId: string | null;
  claimText: string;
  roomsVisited: string[];
  evidence: Evidence[];
  feed: FeedEntry[];
  verdict: Verdict | null;
}

export interface CoverLetterResponse {
  cover_letter: string;
  architect_closing: string;
  /** True when the Claude letter call fell back to a static string. */
  letter_fallback: boolean;
}

export interface EvaluateResponse {
  ai_reaction: string;
  /** Post-smoothing needle position [0, 100]. Computed server-side so the raw
   *  ai_score magnitude never reaches the client (Invariant #2). */
  attention: number;
  /** True when the Claude reaction call fell back to a static string — lets
   *  the UI show a subdued state instead of pretending the Architect spoke. */
  reaction_fallback: boolean;
}

/** 409 body returned when a card has already been ruled in this session.
 *  Carries the *canonical* server-side state so the client can re-sync
 *  without trusting the attempted classification (which may differ from
 *  what the database already holds — e.g. retry after a successful write,
 *  second tab, hard reload mid-pick). */
export interface EvaluateConflictResponse {
  canonical: {
    classification: Classification;
    attention: number;
  };
}
