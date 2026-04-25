import type { Evidence, FeedEntry, GameState, Verdict } from '$lib/types';
import { BASELINE_ATTENTION, clampAttention } from '$lib/attention';

const STORAGE_KEY = 'architectGameState';
const ATTENTION_KEY = 'architectAttention';

interface PersistedState extends GameState {
  attention: number;
}

function loadState(): PersistedState | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch (err) {
    // Malformed payload (e.g. after a deploy that changed the shape).
    // Surface it during QA but don't crash the app — start fresh.
    console.warn('[gameState] failed to parse persisted state:', err);
    return null;
  }
}

function saveState(state: GameState, attention: number) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, attention }));
    sessionStorage.setItem(ATTENTION_KEY, String(attention));
  } catch (err) {
    // Quota exceeded or storage disabled — non-critical but worth surfacing.
    console.warn('[gameState] failed to persist state:', err);
  }
}

function emptyState(): GameState {
  return {
    sessionId: null,
    claimId: null,
    claimText: '',
    roomsVisited: [],
    evidence: [],
    feed: [],
    verdict: null,
  };
}

function createGameState() {
  const restored = loadState();
  let state = $state<GameState>(restored ?? emptyState());
  let attention = $state<number>(restored?.attention ?? BASELINE_ATTENTION);

  function persist() {
    saveState(state, attention);
  }

  return {
    get current() {
      return state;
    },
    get attention() {
      return attention;
    },
    get proofCount() {
      return state.evidence.filter((e) => e.classification === 'proof').length;
    },
    get objectionCount() {
      return state.evidence.filter((e) => e.classification === 'objection').length;
    },
    get dismissedCount() {
      return state.evidence.filter((e) => e.classification === 'dismiss').length;
    },
    get ruledCount() {
      return state.evidence.filter((e) => e.classification !== 'dismiss').length;
    },

    initSession(payload: { sessionId: string; claimId: string; claimText: string }) {
      state = {
        ...emptyState(),
        sessionId: payload.sessionId,
        claimId: payload.claimId,
        claimText: payload.claimText,
      };
      attention = BASELINE_ATTENTION;
      persist();
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
    setAttention(value: number) {
      attention = clampAttention(value);
      persist();
    },
    setVerdict(verdict: Verdict) {
      state.verdict = verdict;
      persist();
    },
    setClaim(payload: { id: string; text: string }) {
      state.claimId = payload.id;
      state.claimText = payload.text;
      persist();
    },
    reset() {
      state = emptyState();
      attention = BASELINE_ATTENTION;
      persist();
    },
  };
}

export const gameState = createGameState();
