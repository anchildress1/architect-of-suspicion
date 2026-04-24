import { describe, it, expect, beforeEach } from 'vitest';
import { gameState } from './gameState.svelte';
import { BASELINE_ATTENTION, DELTA_GAIN, SMOOTHING } from '$lib/attention';
import type { Evidence, FeedEntry } from '$lib/types';

describe('gameState', () => {
  beforeEach(() => {
    gameState.reset();
  });

  it('initializes empty', () => {
    expect(gameState.current.sessionId).toBeNull();
    expect(gameState.current.claimId).toBeNull();
    expect(gameState.current.claimText).toBe('');
    expect(gameState.current.roomsVisited).toEqual([]);
    expect(gameState.current.evidence).toEqual([]);
    expect(gameState.current.feed).toEqual([]);
    expect(gameState.current.verdict).toBeNull();
    expect(gameState.attention).toBe(BASELINE_ATTENTION);
  });

  describe('initSession', () => {
    it('clears prior state and sets session/claim payload', () => {
      gameState.visitRoom('parlor');
      gameState.nudgeAttention(0.5);
      gameState.initSession({
        sessionId: 'sess-1',
        claimId: 'claim-1',
        claimText: 'A claim',
      });

      expect(gameState.current.sessionId).toBe('sess-1');
      expect(gameState.current.claimId).toBe('claim-1');
      expect(gameState.current.claimText).toBe('A claim');
      expect(gameState.current.roomsVisited).toEqual([]);
      expect(gameState.attention).toBe(BASELINE_ATTENTION);
    });
  });

  describe('visitRoom', () => {
    it('adds a room and de-duplicates', () => {
      gameState.visitRoom('library');
      gameState.visitRoom('library');
      gameState.visitRoom('parlor');
      expect(gameState.current.roomsVisited).toEqual(['library', 'parlor']);
    });
  });

  describe('addEvidence + counts', () => {
    function pushEvidence(classification: Evidence['classification'], id: string): void {
      gameState.addEvidence({
        card: { objectID: id, title: id, blurb: '', category: 'Decisions', weight: 1 },
        classification,
      });
    }

    it('counts proof, objection, and dismiss separately', () => {
      pushEvidence('proof', '1');
      pushEvidence('objection', '2');
      pushEvidence('dismiss', '3');
      pushEvidence('proof', '4');

      expect(gameState.proofCount).toBe(2);
      expect(gameState.objectionCount).toBe(1);
      expect(gameState.dismissedCount).toBe(1);
      expect(gameState.ruledCount).toBe(3);
    });
  });

  describe('feed', () => {
    it('adds and removes feed entries by id', () => {
      const keep: FeedEntry = { id: 'k', type: 'narration', text: 'Stays', timestamp: 1 };
      const drop: FeedEntry = { id: 'd', type: 'narration', text: 'Goes', timestamp: 2 };
      gameState.addFeedEntry(keep);
      gameState.addFeedEntry(drop);
      gameState.removeFeedEntry('d');
      expect(gameState.current.feed.map((e) => e.id)).toEqual(['k']);
    });

    it('removeFeedEntry is a no-op when id not present', () => {
      gameState.addFeedEntry({ id: 'only', type: 'narration', text: 'A', timestamp: 1 });
      gameState.removeFeedEntry('missing');
      expect(gameState.current.feed).toHaveLength(1);
    });
  });

  describe('attention', () => {
    it('moves up on positive nudge', () => {
      const before = gameState.attention;
      gameState.nudgeAttention(0.5);
      expect(gameState.attention).toBeGreaterThan(before);
    });

    it('moves down on negative nudge', () => {
      const before = gameState.attention;
      gameState.nudgeAttention(-0.5);
      expect(gameState.attention).toBeLessThan(before);
    });

    it('does not move on zero nudge (Dismiss)', () => {
      const before = gameState.attention;
      gameState.nudgeAttention(0);
      expect(gameState.attention).toBe(before);
    });

    it('per-pick magnitude is bounded by smoothing', () => {
      const before = gameState.attention;
      gameState.nudgeAttention(1);
      const jump = gameState.attention - before;
      expect(jump).toBeLessThanOrEqual(DELTA_GAIN * SMOOTHING + 0.001);
    });

    it('setAttention clamps within [0, 100]', () => {
      gameState.setAttention(250);
      expect(gameState.attention).toBe(100);
      gameState.setAttention(-10);
      expect(gameState.attention).toBe(0);
    });
  });

  describe('setVerdict / setClaim', () => {
    it('sets the verdict', () => {
      gameState.setVerdict('accuse');
      expect(gameState.current.verdict).toBe('accuse');
    });

    it('sets the claim', () => {
      gameState.setClaim({ id: 'claim-9', text: 'Big claim' });
      expect(gameState.current.claimId).toBe('claim-9');
      expect(gameState.current.claimText).toBe('Big claim');
    });
  });

  describe('reset', () => {
    it('clears everything back to baseline', () => {
      gameState.initSession({ sessionId: 's', claimId: 'c', claimText: 't' });
      gameState.visitRoom('parlor');
      gameState.nudgeAttention(0.8);
      gameState.setVerdict('pardon');
      gameState.reset();

      expect(gameState.current.sessionId).toBeNull();
      expect(gameState.current.claimId).toBeNull();
      expect(gameState.current.claimText).toBe('');
      expect(gameState.current.roomsVisited).toEqual([]);
      expect(gameState.current.verdict).toBeNull();
      expect(gameState.attention).toBe(BASELINE_ATTENTION);
    });
  });
});
