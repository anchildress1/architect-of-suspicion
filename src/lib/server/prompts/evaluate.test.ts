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
    it('signals ALIGNED when the player’s call goes with the card', () => {
      const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
      // Server-only signal in the prompt body.
      expect(prompt).toMatch(/Reading alignment[^\n]*ALIGNED/);
      // Tone branch fires with positive shape: lean the dial their way,
      // quote a supporting phrase, leave the call where the player put it.
      expect(prompt).toMatch(/Tone — the player's call goes with where the card leans/i);
      expect(prompt).toMatch(/Grudging acknowledgment/i);
      expect(prompt).toMatch(/lean the dial their way/i);
      expect(prompt).toMatch(/leaving the call where the player put it/i);
      // Single conceptual ceiling on correctness reveals (Invariant #5),
      // expressed once — not as a list of forbidden admission phrases.
      expect(prompt).toMatch(/correctness lives/i);
      expect(prompt).toMatch(/stop short of confirming the call was right/i);
      // Cross-check: strained-branch language not present.
      expect(prompt).not.toMatch(/Tone — the player's call cuts against/i);
    });

    it('signals STRAINED when the player’s call cuts against the card', () => {
      const prompt = buildReactionPrompt('Test claim', mockCard, 'objection', [], 'strained');
      expect(prompt).toMatch(/Reading alignment[^\n]*STRAINED/);
      // Tone branch engages the call as a deliberate weighing of the
      // evidence — not as inattention. Positive shape: place a contrasting
      // phrase next to the player's call so both readings can sit on the
      // table.
      expect(prompt).toMatch(/Tone — the player's call cuts against where the card leans/i);
      expect(prompt).toMatch(/made a deliberate call/i);
      expect(prompt).toMatch(/place it next to their call/i);
      expect(prompt).toMatch(/both can sit on the table at once/i);
      // Strained reactions still anchor in card text — no Architect-
      // invented categories.
      expect(prompt).toMatch(/directly from the title or blurb/i);
      // Single conceptual ceiling on correctness reveals (Invariant #5),
      // expressed once — no enumerated bad-phrase list.
      expect(prompt).toMatch(/correctness lives/i);
      expect(prompt).toMatch(/stop short of treating the call itself as a mistake/i);
      // Cross-check: aligned-branch language not present.
      expect(prompt).not.toMatch(/Tone — the player's call goes with/i);
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
