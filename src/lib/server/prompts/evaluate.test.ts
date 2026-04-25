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
    expect(prompt).toContain('struck this from the record');
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

  it('forbids revealing scores or correctness', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', []);
    expect(prompt).toContain('NEVER reveal a score');
  });

  it('requests plain reaction text (no JSON)', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'objection', []);
    expect(prompt).toContain('ONLY the reaction text');
    expect(prompt).toContain('no JSON');
  });
});
