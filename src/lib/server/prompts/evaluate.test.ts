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
    expect(prompt).toMatch(/Tone — the strike/i);
    expect(prompt).toMatch(/Tease their hesitation/i);
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

  it('binds the Architect to the visible card as the only source of authority', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
    expect(prompt).toMatch(/card title and blurb are your only source of authority/i);
    expect(prompt).toMatch(/never invent category splits/i);
    expect(prompt).toMatch(/the player can verify/i);
  });

  it('provides positive vocabulary for what was asked of Ashley', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
    expect(prompt).toMatch(/the assignment, the scope, the constraint/i);
    expect(prompt).toMatch(/what she shipped against/i);
  });

  describe('alignment-driven tone', () => {
    it('signals ALIGNED when the player’s reading goes with the card', () => {
      const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
      // Server-only signal in the prompt body.
      expect(prompt).toMatch(/Reading alignment[^\n]*ALIGNED/);
      // Tone branch fires.
      expect(prompt).toMatch(/Tone — the player got the read right/i);
      expect(prompt).toMatch(/Grudging acknowledgment/i);
      // Anti-correction guard.
      expect(prompt).toMatch(/Do NOT correct them/i);
      // Direct admission of correctness still forbidden — Invariant #5.
      expect(prompt).toMatch(/NEVER say "you got it right"/);
      // Cross-check: strained-branch language not present.
      expect(prompt).not.toMatch(/Tone — the player's reading strains/i);
    });

    it('signals STRAINED when the player’s reading cuts against the card', () => {
      const prompt = buildReactionPrompt('Test claim', mockCard, 'objection', [], 'strained');
      expect(prompt).toMatch(/Reading alignment[^\n]*STRAINED/);
      expect(prompt).toMatch(/Tone — the player's reading strains/i);
      expect(prompt).toMatch(/Needle the FRAME they adopted/i);
      // The strained branch must still anchor in card phrases — not invent
      // a category to correct the player into.
      expect(prompt).toMatch(/direct phrase from the title or blurb/i);
      // Don't say "you were wrong about Ashley".
      expect(prompt).toMatch(/Don't tell the player they were "wrong about Ashley"/);
      // Cross-check: aligned-branch language not present.
      expect(prompt).not.toMatch(/Tone — the player got the read right/i);
    });

    it('signals NEUTRAL for dismiss', () => {
      const prompt = buildReactionPrompt('Test claim', mockCard, 'dismiss', [], null);
      expect(prompt).toMatch(/Reading alignment[^\n]*NEUTRAL/);
      // Dismiss branch is the strike-tease, not the neutral-zero shrug.
      expect(prompt).toMatch(/Tone — the strike/i);
    });

    it('signals NEUTRAL for genuinely ambiguous (near-zero) cards', () => {
      // Route passes alignment=null when |ai_score| < 0.1. The prompt
      // should branch to the "card sits near zero" tone: a magisterial
      // shrug rather than acknowledge or needle.
      const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], null);
      expect(prompt).toMatch(/Reading alignment[^\n]*NEUTRAL/);
      expect(prompt).toMatch(/Tone — the card sits near zero/i);
      expect(prompt).toMatch(/dial is unsettled here/);
    });
  });
});
