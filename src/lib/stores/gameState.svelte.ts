import type { GameState, Evidence, FeedEntry, Verdict } from '$lib/types';
import { getRandomClaim } from '$lib/claims';

const STORAGE_KEY = 'architectGameState';

function loadState(): GameState | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

function saveState(state: GameState) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded — non-critical */ }
}

function createGameState() {
  const restored = loadState();
  let state = $state<GameState>(
    restored ?? {
      sessionId: null,
      claim: '',
      roomsVisited: [],
      evidence: [],
      feed: [],
      verdict: null,
    },
  );

  function persist() {
    saveState(state);
  }

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
        persist();
      }
    },
    addEvidence(evidence: Evidence) {
      state.evidence = [...state.evidence, evidence];
      persist();
    },
    addFeedEntry(entry: FeedEntry) {
      state.feed = [...state.feed, entry];
      persist();
    },
    removeFeedEntry(id: string) {
      state.feed = state.feed.filter((e) => e.id !== id);
      persist();
    },
    setSessionId(id: string) {
      state.sessionId = id;
      persist();
    },
    setVerdict(verdict: Verdict) {
      state.verdict = verdict;
      persist();
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
      persist();
    },
  };
}

export const gameState = createGameState();
