import { describe, it, expect } from 'vitest';
import { buildReactionPrompt } from './evaluate';

const mockCard = {
  objectID: 'card-1',
  title: 'AI Tools Usage',
  blurb: 'Player-facing blurb about AI tools',
  fact: 'Ashley uses AI tools for code generation, documentation, and project planning.',
  category: 'Philosophy',
  signal: 5,
};

describe('buildReactionPrompt', () => {
  it('includes the claim verbatim', () => {
    const prompt = buildReactionPrompt(
      'Ashley depends on AI too much',
      mockCard,
      'proof',
      [],
      'aligned',
    );
    expect(prompt).toContain('Ashley depends on AI too much');
  });

  it('includes the card title and player-facing blurb', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
    expect(prompt).toContain('AI Tools Usage');
    expect(prompt).toContain('Player-facing blurb about AI tools');
  });

  it('includes the hidden fact for context', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
    expect(prompt).toContain('Ashley uses AI tools for code generation');
  });

  it('describes proof as entered into evidence', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
    expect(prompt).toContain('entered into evidence as PROOF');
  });

  it('describes objection as raised', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'objection', [], 'aligned');
    expect(prompt).toContain('raised as OBJECTION');
  });

  it('describes dismiss as struck from the record', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'dismiss', [], null);
    expect(prompt).toContain('STRUCK from the record');
    // Action frame instructs the model to note the strike and tease hesitation.
    expect(prompt).toMatch(/the strike/i);
    expect(prompt).toMatch(/tease the hesitation/i);
  });

  it('lists prior picks when history exists', () => {
    const prompt = buildReactionPrompt(
      'Test claim',
      mockCard,
      'proof',
      [
        { card_id: 'a', card_title: 'Previous Card', classification: 'proof' },
        { card_id: 'b', card_title: 'Another Card', classification: 'objection' },
      ],
      'aligned',
    );
    expect(prompt).toContain('Previous Card');
    expect(prompt).toContain('Another Card');
  });

  it('shows empty history placeholder when no prior picks', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
    expect(prompt).toContain('No prior exhibits');
  });

  it('locks the no-score-leak rule (Invariant #5)', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
    expect(prompt).toMatch(/never reveal scores, weights, alignment/i);
  });

  it('requests plain reaction text (no JSON)', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'objection', [], 'strained');
    expect(prompt).toContain('ONLY the reaction text');
    expect(prompt).toContain('no JSON');
  });

  // Card-as-only-authority and the assignment/scope/constraint vocabulary
  // are anchored in ARCHITECT_SYSTEM_PROMPT (system.test.ts covers them).
  // The per-pick prompt assumes the system context; locking those phrases
  // here would just duplicate the contract.

  describe('alignment-driven tone', () => {
    it('signals ALIGNED when the player’s call goes with the card', () => {
      const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
      expect(prompt).toMatch(/Reading alignment[^\n]*ALIGNED/);
      // Aligned branch: grudging acknowledgment, supporting phrase, don't confirm.
      expect(prompt).toMatch(/call goes with the card/i);
      expect(prompt).toMatch(/grudging acknowledgment/i);
      expect(prompt).toMatch(/leave the call where the player put it/i);
      expect(prompt).toMatch(/don't confirm the call was right/i);
      expect(prompt).not.toMatch(/call cuts against/i);
    });

    it('signals STRAINED when the player’s call cuts against the card', () => {
      const prompt = buildReactionPrompt('Test claim', mockCard, 'objection', [], 'strained');
      expect(prompt).toMatch(/Reading alignment[^\n]*STRAINED/);
      // Strained branch: deliberate weighing, contrasting phrase, anchored in card.
      expect(prompt).toMatch(/call cuts against the card/i);
      expect(prompt).toMatch(/deliberate weighing/i);
      expect(prompt).toMatch(/place it next to their call/i);
      expect(prompt).toMatch(/from the title or blurb/i);
      expect(prompt).toMatch(/don't treat the call as a mistake/i);
      expect(prompt).not.toMatch(/call goes with the card/i);
    });

    it('signals NEUTRAL for dismiss', () => {
      const prompt = buildReactionPrompt('Test claim', mockCard, 'dismiss', [], null);
      expect(prompt).toMatch(/Reading alignment[^\n]*NEUTRAL/);
      expect(prompt).toMatch(/the strike/i);
    });

    it('signals NEUTRAL for genuinely ambiguous (near-zero) cards', () => {
      const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], null);
      expect(prompt).toMatch(/Reading alignment[^\n]*NEUTRAL/);
      expect(prompt).toMatch(/card sits near zero/i);
      expect(prompt).toMatch(/dial is unsettled here/);
    });
  });
});
