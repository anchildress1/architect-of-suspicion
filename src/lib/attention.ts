/**
 * The Architect's Attention meter.
 *
 * One smoothed needle that drifts with the player's classification trajectory.
 * The needle's position never reveals per-pick correctness — its motion is
 * eased over multiple picks so an individual delta is unreadable on its own.
 *
 * Inputs (from /api/evaluate):
 *   attention_delta ∈ [-1, 1] = pickSign × pre_seeded_ai_score
 *     proof     →  + ai_score
 *     objection →  − ai_score
 *     dismiss   →  0
 *
 * Output (rendered to the user):
 *   needle ∈ [0, 100], one of four mood labels (Drifting / Watching / Interested / Riveted),
 *   never the raw delta, never a number readout.
 */

export const BASELINE_ATTENTION = 50;
export const ATTENTION_MIN = 0;
export const ATTENTION_MAX = 100;

/**
 * How strongly each pick nudges the needle toward its target. 0..1.
 * Lower = more inertia (a single pick barely moves the gauge), higher = jumpier.
 * 0.18 leaves enough room that aggregate trajectory is visible after ~6-8 picks
 * but a single pick produces no readable conclusion.
 */
export const SMOOTHING = 0.18;

/** Per-pick contribution to the attention "target." Tuned so a confident
 *  Proof of a strongly-supporting card (delta ≈ 1) shifts the target by 50,
 *  reaching FURY/Riveted only after several aligned picks. */
export const DELTA_GAIN = 50;

export type AttentionMood = 'Drifting' | 'Watching' | 'Interested' | 'Riveted';

export function clampAttention(value: number): number {
  if (Number.isNaN(value)) return BASELINE_ATTENTION;
  if (value < ATTENTION_MIN) return ATTENTION_MIN;
  if (value > ATTENTION_MAX) return ATTENTION_MAX;
  return value;
}

/**
 * Apply one pick's delta to the current needle value with easing.
 * The math intentionally hides per-pick magnitude inside the smoothing.
 */
export function applyAttentionDelta(current: number, delta: number): number {
  if (typeof delta !== 'number' || Number.isNaN(delta)) return current;
  const clampedDelta = Math.max(-1, Math.min(1, delta));
  const target = clampAttention(current + clampedDelta * DELTA_GAIN);
  // Linear interpolation toward the target — adds inertia.
  return clampAttention(current + (target - current) * SMOOTHING);
}

/** Recompute the needle position from a fresh pick history. Used on rehydrate. */
export function attentionFromHistory(deltas: readonly number[]): number {
  let value = BASELINE_ATTENTION;
  for (const d of deltas) {
    value = applyAttentionDelta(value, d);
  }
  return value;
}

/** Map the needle position to one of four moods. Boundaries are intentionally
 *  uneven — the ends are narrower so reaching them feels earned. */
export function moodFor(value: number): AttentionMood {
  const v = clampAttention(value);
  if (v < 30) return 'Drifting';
  if (v < 55) return 'Watching';
  if (v < 80) return 'Interested';
  return 'Riveted';
}
