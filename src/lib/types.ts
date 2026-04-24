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
}

export interface EvaluateResponse {
  ai_reaction: string;
  /** Hidden-from-player attention delta in [-1.0, 1.0]. Drives the meter
   *  client-side. The raw score is server-only — only the smoothed needle
   *  position is ever rendered to the user. */
  attention_delta: number;
}
