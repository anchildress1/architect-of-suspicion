import { describe, it, expect } from 'vitest';
import { buildPass4Cache, deriveCachePromptVersion, pass4CacheKey } from './pass4Cache';
import type { CardRow, GeneratedClaim } from './types';

const VERSION = 'v0123456789abcdef';

const card: CardRow = {
  objectID: 'card-1',
  title: 'AI Tools Usage',
  blurb: 'Player-facing blurb.',
  fact: 'Hidden context fact.',
  category: 'Philosophy',
  signal: 5,
  created_at: '2026-04-01T00:00:00Z',
  tags: { lvl0: ['DEV Challenge'], lvl1: ['DEV Challenge > WeCoded 2026'] },
  projects: ['CheckMark'],
};

const claim: GeneratedClaim = {
  id: 'claim-1',
  claim_text: 'Ashley over-engineers everything.',
  rationale: 'Constraints + Decisions cards stack consistent.',
  truths_targeted: ['Ashley builds constraints before features.'],
  hireable_truth: 'Ashley builds constraints before features so failure modes become design tools.',
  desired_verdict: 'accuse',
};

describe('pass4CacheKey', () => {
  it('returns a deterministic 64-char hex sha256 for fixed inputs', () => {
    const key = pass4CacheKey(card, claim, VERSION, 'gpt-5.4');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(pass4CacheKey(card, claim, VERSION, 'gpt-5.4')).toBe(key);
  });

  it('changes when the model id changes', () => {
    const a = pass4CacheKey(card, claim, VERSION, 'gpt-5.4');
    const b = pass4CacheKey(card, claim, VERSION, 'gemini-3.1-pro-preview');
    expect(a).not.toBe(b);
  });

  it('changes when the prompt version drifts', () => {
    const a = pass4CacheKey(card, claim, VERSION, 'gpt-5.4');
    const b = pass4CacheKey(card, claim, 'different-version', 'gpt-5.4');
    expect(a).not.toBe(b);
  });

  it('changes when the card content drifts (blurb)', () => {
    const a = pass4CacheKey(card, claim, VERSION, 'gpt-5.4');
    const b = pass4CacheKey({ ...card, blurb: 'A different blurb' }, claim, VERSION, 'gpt-5.4');
    expect(a).not.toBe(b);
  });

  it('changes when the card content drifts (fact)', () => {
    const a = pass4CacheKey(card, claim, VERSION, 'gpt-5.4');
    const b = pass4CacheKey({ ...card, fact: 'Different fact.' }, claim, VERSION, 'gpt-5.4');
    expect(a).not.toBe(b);
  });

  it('changes when claim_text drifts', () => {
    const a = pass4CacheKey(card, claim, VERSION, 'gpt-5.4');
    const b = pass4CacheKey(
      card,
      { ...claim, claim_text: 'Different surface.' },
      VERSION,
      'gpt-5.4',
    );
    expect(a).not.toBe(b);
  });

  it('changes when desired_verdict drifts', () => {
    const a = pass4CacheKey(card, claim, VERSION, 'gpt-5.4');
    const b = pass4CacheKey(card, { ...claim, desired_verdict: 'pardon' }, VERSION, 'gpt-5.4');
    expect(a).not.toBe(b);
  });

  it('changes when hireable_truth drifts', () => {
    const a = pass4CacheKey(card, claim, VERSION, 'gpt-5.4');
    const b = pass4CacheKey(
      card,
      { ...claim, hireable_truth: 'Sharper truth.' },
      VERSION,
      'gpt-5.4',
    );
    expect(a).not.toBe(b);
  });

  it('does not change when irrelevant fields drift (id, rationale, truths_targeted)', () => {
    const a = pass4CacheKey(card, claim, VERSION, 'gpt-5.4');
    const b = pass4CacheKey(
      card,
      { ...claim, id: 'claim-99', rationale: 'different rationale', truths_targeted: ['x'] },
      VERSION,
      'gpt-5.4',
    );
    // claim.id, rationale, and truths_targeted don't shape the prompt
    // sent to Pass 4 — they're audit metadata. Cache key ignores them so
    // re-runs that re-shuffle ids hit the cache instead of regenerating.
    expect(a).toBe(b);
  });
});

describe('deriveCachePromptVersion', () => {
  it('returns a 16-char hex prefix', () => {
    expect(deriveCachePromptVersion('arbitrary system prompt')).toMatch(/^[a-f0-9]{16}$/);
  });

  it('is deterministic for the same input', () => {
    const a = deriveCachePromptVersion('foo');
    const b = deriveCachePromptVersion('foo');
    expect(a).toBe(b);
  });

  it('changes when the prompt changes', () => {
    expect(deriveCachePromptVersion('foo')).not.toBe(deriveCachePromptVersion('foo!'));
  });
});

describe('buildPass4Cache (disabled mode)', () => {
  it('returns an empty map on lookup and skips writes when disabled', async () => {
    const cache = buildPass4Cache({ disabled: true, promptVersion: VERSION });
    expect(cache.enabled).toBe(false);
    const hits = await cache.lookup([card], claim, 'gpt-5.4');
    expect(hits.size).toBe(0);
    await cache.store(card, claim, 'gpt-5.4', {
      rewrittenTitle: 't',
      rewrittenBlurb: 'x',
      aiScore: 0.1,
      notes: 'x',
      isParamount: false,
    });
    const stats = cache.stats();
    expect(stats).toEqual({ hits: 0, misses: 0, writes: 0 });
  });
});
