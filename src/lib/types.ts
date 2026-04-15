export type Classification = 'proof' | 'objection';
export type Verdict = 'accuse' | 'pardon';

export interface Card {
  objectID: string;
  title: string;
  blurb: string;
  category: string;
  signal: number;
}

export interface Evidence {
  card: Card;
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
  claim: string;
  roomsVisited: string[];
  evidence: Evidence[];
  feed: FeedEntry[];
  verdict: Verdict | null;
}
