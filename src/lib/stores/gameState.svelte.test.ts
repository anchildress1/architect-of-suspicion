import { describe, it, expect, beforeEach } from 'vitest';
import { gameState } from './gameState.svelte';
import { claims } from '$lib/claims';
import type { Evidence, FeedEntry } from '$lib/types';

describe('gameState', () => {
  beforeEach(() => {
    gameState.reset();
  });

  it('initializes with a valid claim', () => {
    expect(claims).toContain(gameState.current.claim);
  });

  it('initializes with empty collections', () => {
    expect(gameState.current.roomsVisited).toEqual([]);
    expect(gameState.current.evidence).toEqual([]);
    expect(gameState.current.feed).toEqual([]);
    expect(gameState.current.verdict).toBeNull();
    expect(gameState.current.sessionId).toBeNull();
  });

  describe('visitRoom', () => {
    it('adds a room to visited list', () => {
      gameState.visitRoom('library');
      expect(gameState.current.roomsVisited).toContain('library');
    });

    it('does not add duplicate rooms', () => {
      gameState.visitRoom('library');
      gameState.visitRoom('library');
      expect(gameState.current.roomsVisited).toEqual(['library']);
    });

    it('tracks multiple rooms', () => {
      gameState.visitRoom('library');
      gameState.visitRoom('parlor');
      expect(gameState.current.roomsVisited).toEqual(['library', 'parlor']);
    });
  });

  describe('addEvidence', () => {
    const mockEvidence: Evidence = {
      card: {
        objectID: 'card-1',
        title: 'Test Card',
        blurb: 'A test card',
        category: 'Philosophy',
        signal: 1,
      },
      classification: 'proof',
    };

    it('adds evidence to the list', () => {
      gameState.addEvidence(mockEvidence);
      expect(gameState.current.evidence).toHaveLength(1);
      expect(gameState.current.evidence[0]).toEqual(mockEvidence);
    });
  });

  describe('proofCount and objectionCount', () => {
    it('counts proofs correctly', () => {
      gameState.addEvidence({
        card: { objectID: '1', title: 'A', blurb: '', category: '', signal: 1 },
        classification: 'proof',
      });
      gameState.addEvidence({
        card: { objectID: '2', title: 'B', blurb: '', category: '', signal: -1 },
        classification: 'objection',
      });
      gameState.addEvidence({
        card: { objectID: '3', title: 'C', blurb: '', category: '', signal: 1 },
        classification: 'proof',
      });

      expect(gameState.proofCount).toBe(2);
      expect(gameState.objectionCount).toBe(1);
    });

    it('returns zero when no evidence exists', () => {
      expect(gameState.proofCount).toBe(0);
      expect(gameState.objectionCount).toBe(0);
    });
  });

  describe('addFeedEntry', () => {
    it('adds a feed entry', () => {
      const entry: FeedEntry = {
        id: 'f1',
        type: 'narration',
        text: 'The investigation begins.',
        timestamp: Date.now(),
      };
      gameState.addFeedEntry(entry);
      expect(gameState.current.feed).toHaveLength(1);
      expect(gameState.current.feed[0].text).toBe('The investigation begins.');
    });
  });

  describe('removeFeedEntry', () => {
    it('removes a feed entry by id', () => {
      const keep: FeedEntry = {
        id: 'keep',
        type: 'narration',
        text: 'Stays.',
        timestamp: 1,
      };
      const drop: FeedEntry = {
        id: 'drop',
        type: 'narration',
        text: 'Goes.',
        timestamp: 2,
      };
      gameState.addFeedEntry(keep);
      gameState.addFeedEntry(drop);
      gameState.removeFeedEntry('drop');
      expect(gameState.current.feed).toHaveLength(1);
      expect(gameState.current.feed[0].id).toBe('keep');
    });

    it('is a no-op when id is not present', () => {
      gameState.addFeedEntry({
        id: 'only',
        type: 'narration',
        text: 'Alone.',
        timestamp: 1,
      });
      gameState.removeFeedEntry('missing');
      expect(gameState.current.feed).toHaveLength(1);
    });
  });

  describe('setSessionId', () => {
    it('sets the session ID', () => {
      gameState.setSessionId('abc-123');
      expect(gameState.current.sessionId).toBe('abc-123');
    });
  });

  describe('setVerdict', () => {
    it('sets the verdict', () => {
      gameState.setVerdict('accuse');
      expect(gameState.current.verdict).toBe('accuse');
    });
  });

  describe('reset', () => {
    it('resets all state', () => {
      gameState.visitRoom('library');
      gameState.setSessionId('xyz');
      gameState.setVerdict('pardon');
      gameState.reset();

      expect(gameState.current.roomsVisited).toEqual([]);
      expect(gameState.current.sessionId).toBeNull();
      expect(gameState.current.verdict).toBeNull();
      expect(gameState.current.evidence).toEqual([]);
      expect(gameState.current.feed).toEqual([]);
      expect(claims).toContain(gameState.current.claim);
    });
  });
});
