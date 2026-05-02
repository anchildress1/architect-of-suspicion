import { describe, it, expect } from 'vitest';
import {
  applyAttentionDelta,
  attentionFromHistory,
  ATTENTION_MAX,
  ATTENTION_MIN,
  BASELINE_ATTENTION,
  clampAttention,
  DELTA_GAIN,
  moodFor,
  SMOOTHING,
} from './attention';

describe('clampAttention', () => {
  it('returns value within bounds untouched', () => {
    expect(clampAttention(50)).toBe(50);
    expect(clampAttention(0)).toBe(ATTENTION_MIN);
    expect(clampAttention(100)).toBe(ATTENTION_MAX);
  });

  it('clamps below min', () => {
    expect(clampAttention(-25)).toBe(ATTENTION_MIN);
  });

  it('clamps above max', () => {
    expect(clampAttention(250)).toBe(ATTENTION_MAX);
  });

  it('returns baseline for NaN', () => {
    expect(clampAttention(Number.NaN)).toBe(BASELINE_ATTENTION);
  });
});

describe('applyAttentionDelta', () => {
  it('moves toward higher attention on positive delta', () => {
    const next = applyAttentionDelta(BASELINE_ATTENTION, 0.5);
    expect(next).toBeGreaterThan(BASELINE_ATTENTION);
  });

  it('moves toward lower attention on negative delta', () => {
    const next = applyAttentionDelta(BASELINE_ATTENTION, -0.5);
    expect(next).toBeLessThan(BASELINE_ATTENTION);
  });

  it('does not move on zero delta (Dismiss)', () => {
    expect(applyAttentionDelta(BASELINE_ATTENTION, 0)).toBe(BASELINE_ATTENTION);
  });

  it('clamps deltas above 1', () => {
    const next = applyAttentionDelta(BASELINE_ATTENTION, 5);
    const expected = applyAttentionDelta(BASELINE_ATTENTION, 1);
    expect(next).toBe(expected);
  });

  it('clamps deltas below -1', () => {
    const next = applyAttentionDelta(BASELINE_ATTENTION, -5);
    const expected = applyAttentionDelta(BASELINE_ATTENTION, -1);
    expect(next).toBe(expected);
  });

  it('returns current value for non-numeric delta', () => {
    expect(applyAttentionDelta(70, Number.NaN)).toBe(70);
    expect(applyAttentionDelta(70, 'foo' as unknown as number)).toBe(70);
  });

  it('per-pick magnitude is small (smoothing hides individual picks)', () => {
    // A single confident pick should not jump the needle by more than DELTA_GAIN * SMOOTHING.
    const before = BASELINE_ATTENTION;
    const after = applyAttentionDelta(before, 1);
    const jump = after - before;
    expect(jump).toBeLessThanOrEqual(DELTA_GAIN * SMOOTHING + 0.001);
    expect(jump).toBeGreaterThan(0);
  });

  it('asymptotically approaches the ceiling under sustained positive picks', () => {
    let v = BASELINE_ATTENTION;
    for (let i = 0; i < 200; i++) v = applyAttentionDelta(v, 1);
    expect(v).toBeLessThanOrEqual(ATTENTION_MAX);
    expect(v).toBeGreaterThan(ATTENTION_MAX - 0.001);
  });

  it('asymptotically approaches the floor under sustained negative picks', () => {
    let v = BASELINE_ATTENTION;
    for (let i = 0; i < 200; i++) v = applyAttentionDelta(v, -1);
    expect(v).toBeGreaterThanOrEqual(ATTENTION_MIN);
    expect(v).toBeLessThan(ATTENTION_MIN + 0.001);
  });
});

describe('attentionFromHistory', () => {
  it('returns baseline for empty history', () => {
    expect(attentionFromHistory([])).toBe(BASELINE_ATTENTION);
  });

  it('reproduces the same value as sequential nudges', () => {
    const deltas = [0.4, -0.2, 0.8, 0, -0.5];
    let manual = BASELINE_ATTENTION;
    for (const d of deltas) manual = applyAttentionDelta(manual, d);
    expect(attentionFromHistory(deltas)).toBeCloseTo(manual, 8);
  });
});

describe('moodFor', () => {
  it('returns Exonerating at the low end', () => {
    expect(moodFor(0)).toBe('Exonerating');
    expect(moodFor(20)).toBe('Exonerating');
  });

  it('returns Watching in the lower middle', () => {
    expect(moodFor(30)).toBe('Watching');
    expect(moodFor(50)).toBe('Watching');
  });

  it('returns Tightening in the upper middle', () => {
    expect(moodFor(55)).toBe('Tightening');
    expect(moodFor(75)).toBe('Tightening');
  });

  it('returns Damning at the high end', () => {
    expect(moodFor(80)).toBe('Damning');
    expect(moodFor(100)).toBe('Damning');
  });

  it('clamps out-of-range values before mapping', () => {
    expect(moodFor(-10)).toBe('Exonerating');
    expect(moodFor(150)).toBe('Damning');
  });
});
