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
    const prompt = buildReactionPrompt('Ashley depends on AI too much', mockCard, 'proof', []);
    expect(prompt).toContain('Ashley depends on AI too much');
  });

  it('includes the card title and player-facing blurb', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', []);
    expect(prompt).toContain('AI Tools Usage');
    expect(prompt).toContain('Player-facing blurb about AI tools');
  });

  it('includes the hidden fact for context', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', []);
    expect(prompt).toContain('Ashley uses AI tools for code generation');
  });

  it('describes proof as entered into evidence', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', []);
    expect(prompt).toContain('entered into evidence as PROOF');
  });

  it('describes objection as raised', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'objection', []);
    expect(prompt).toContain('raised as OBJECTION');
  });

  it('describes dismiss as struck from the record', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'dismiss', []);
    expect(prompt).toContain('STRUCK from the record');
    // Action frame instructs the model to note the strike and tease hesitation.
    expect(prompt).toMatch(/Note the strike/i);
    expect(prompt).toMatch(/tease their hesitation to commit/i);
  });

  it('lists prior picks when history exists', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [
      { card_id: 'a', card_title: 'Previous Card', classification: 'proof' },
      { card_id: 'b', card_title: 'Another Card', classification: 'objection' },
    ]);
    expect(prompt).toContain('Previous Card');
    expect(prompt).toContain('Another Card');
  });

  it('shows empty history placeholder when no prior picks', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', []);
    expect(prompt).toContain('No prior exhibits');
  });

  it('locks the no-score-leak rule (Invariant #5)', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', []);
    // Positive framing: "stay in character; never reveal..." — the negative
    // verb is preserved here because INVARIANT #5 is one place where a hard
    // ban is the right shape (the score is mechanically forbidden, not
    // calibration-style guidance).
    expect(prompt).toMatch(/never reveal scores/i);
  });

  it('requests plain reaction text (no JSON)', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'objection', []);
    expect(prompt).toContain('ONLY the reaction text');
    expect(prompt).toContain('no JSON');
  });

  it('binds the Architect to the visible card as the only source of authority', () => {
    // Positive constraint: every reference must come from the title or
    // blurb the player can re-read. Replaces the prior calibration ban-list
    // (which primed the model on the very vocabulary it was meant to
    // suppress — see the "no negative anchoring" feedback memory).
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', []);
    expect(prompt).toMatch(/card title and blurb are your only source of authority/i);
    expect(prompt).toMatch(/never invent category splits/i);
    expect(prompt).toMatch(/the player can verify/i);
  });

  it('provides positive vocabulary for what was asked of Ashley', () => {
    // Lands the model with somewhere to go ("the assignment / the scope /
    // the constraint / what she shipped against / the call she made")
    // instead of reaching for "the brief".
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', []);
    expect(prompt).toMatch(/the assignment, the scope, the constraint/i);
    expect(prompt).toMatch(/what she shipped against/i);
  });
});
