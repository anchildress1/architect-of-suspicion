import type { GameState, Evidence, FeedEntry, Verdict } from '$lib/types';
import { getRandomClaim } from '$lib/claims';

function createGameState() {
  let state = $state<GameState>({
    sessionId: null,
    claim: '',
    roomsVisited: [],
    evidence: [],
    feed: [],
    verdict: null,
  });

  return {
    get current() {
      return state;
    },
    get proofCount() {
      return state.evidence.filter((e) => e.classification === 'proof').length;
    },
    get objectionCount() {
      return state.evidence.filter((e) => e.classification === 'objection').length;
    },

    visitRoom(slug: string) {
      if (!state.roomsVisited.includes(slug)) {
        state.roomsVisited = [...state.roomsVisited, slug];
      }
    },
    addEvidence(evidence: Evidence) {
      state.evidence = [...state.evidence, evidence];
    },
    addFeedEntry(entry: FeedEntry) {
      state.feed = [...state.feed, entry];
    },
    removeFeedEntry(id: string) {
      state.feed = state.feed.filter((e) => e.id !== id);
    },
    setSessionId(id: string) {
      state.sessionId = id;
    },
    setVerdict(verdict: Verdict) {
      state.verdict = verdict;
    },
    reset() {
      state = {
        sessionId: null,
        claim: getRandomClaim(),
        roomsVisited: [],
        evidence: [],
        feed: [],
        verdict: null,
      };
    },
  };
}

export const gameState = createGameState();
