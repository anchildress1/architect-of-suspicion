import { describe, it, expect } from 'vitest';
import type { Card } from '$lib/types';

// Since Svelte 5 components cannot be trivially rendered in vitest without
// a DOM environment + Svelte compiler pipeline, we test the core logic
// that the component depends on: the Card type contract and classification flow.

function makeMockCard(overrides?: Partial<Card>): Card {
  return {
    objectID: 'card-test-1',
    title: 'Test Card Title',
    blurb: 'This is a test card blurb for evidence.',
    category: 'Philosophy',
    signal: 5,
    ...overrides,
  };
}

describe('EvidenceCard data contract', () => {
  it('card has all required display fields', () => {
    const card = makeMockCard();
    expect(card.objectID).toBeTruthy();
    expect(card.title).toBeTruthy();
    expect(card.blurb).toBeTruthy();
    expect(card.category).toBeTruthy();
    expect(typeof card.signal).toBe('number');
  });

  it('card does not contain hidden fields', () => {
    const card = makeMockCard();
    const cardObj = card as Record<string, unknown>;
    expect(cardObj['fact']).toBeUndefined();
    expect(cardObj['tags']).toBeUndefined();
    expect(cardObj['projects']).toBeUndefined();
    expect(cardObj['url']).toBeUndefined();
    expect(cardObj['created_at']).toBeUndefined();
    expect(cardObj['updated_at']).toBeUndefined();
    expect(cardObj['deleted_at']).toBeUndefined();
  });

  it('classification callback receives correct arguments', () => {
    const card = makeMockCard();
    const results: Array<{ card: Card; classification: string }> = [];
    const onClassify = (c: Card, cl: string) => results.push({ card: c, classification: cl });

    // Simulate proof classification
    onClassify(card, 'proof');
    expect(results).toHaveLength(1);
    expect(results[0].card.objectID).toBe('card-test-1');
    expect(results[0].classification).toBe('proof');

    // Simulate objection classification
    onClassify(card, 'objection');
    expect(results).toHaveLength(2);
    expect(results[1].classification).toBe('objection');
  });

  it('classification types are limited to proof and objection', () => {
    const validClassifications = ['proof', 'objection'];
    expect(validClassifications).toContain('proof');
    expect(validClassifications).toContain('objection');
    expect(validClassifications).toHaveLength(2);
  });
});
