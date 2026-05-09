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

  it('includes the card title and player-facing blurb under the visible surface', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
    expect(prompt).toContain('AI Tools Usage');
    expect(prompt).toContain('Player-facing blurb about AI tools');
    expect(prompt).toMatch(/VISIBLE SURFACE[^]*Title:\s*"AI Tools Usage"/);
  });

  it('places the fact under INTERNAL STEERING bound to tone-shaping only', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
    // Fact is still embedded for tone steering...
    expect(prompt).toContain('Ashley uses AI tools for code generation');
    // ...but the section header positively binds the steering inputs to
    // tone-shaping and binds output text to the visible surface. Earlier
    // negative phrasing ("never quoted, paraphrased, summarized, or
    // described") planted the very forbidden moves the model then
    // surfaced as meta-commentary in output.
    expect(prompt).toMatch(/INTERNAL STEERING/);
    expect(prompt).toMatch(/shapes tone; output text comes from the visible surface/i);
    // Fact must appear inside the INTERNAL STEERING block, not the visible surface.
    const steeringBlock = prompt.split('INTERNAL STEERING')[1] ?? '';
    expect(steeringBlock).toContain('Ashley uses AI tools for code generation');
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
    // Neutral dismiss tone: strike on an unsettled dial, light needle.
    expect(prompt).toMatch(/strike on an unsettled dial/i);
    expect(prompt).toMatch(/tease the hesitation lightly/i);
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

  it('locks the score & fact invariant (Invariants #6 / #1)', () => {
    // The one block in the prompt that retains explicit "stay inside"
    // language. Score-leak and fact-leak are non-negotiable, and the
    // single consolidated INVARIANT block is where that lock lives —
    // not scattered across multiple "never X" guards.
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
    expect(prompt).toMatch(/INVARIANT \(#6 \/ #1\)/);
    expect(prompt).toMatch(/score and the fact stay inside the mechanism/i);
    expect(prompt).toMatch(/alignment signal shapes tone/i);
    expect(prompt).toMatch(/output is built from the visible surface/i);
  });

  it('locks the destabilization-as-job framing', () => {
    // The Architect's job is entertainment via uncertainty, not fair-witness
    // narration. JOB section binds the model to "lift a phrase that
    // complicates the call" as the per-reaction action; placement carries
    // the weight, the player carries the inference.
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
    expect(prompt).toMatch(/THE JOB:/);
    expect(prompt).toMatch(/Your job is entertainment/i);
    expect(prompt).toMatch(/keep the player uncertain/i);
    expect(prompt).toMatch(/wondering whether they got it right — regardless of whether they did/i);
    expect(prompt).toMatch(/truth on the visible surface is your lever/i);
    expect(prompt).toMatch(/the placement carries the weight/i);
  });

  it('locks the CRAFT block as positive bindings (no enumerated negatives)', () => {
    // Earlier rounds piled "never X / never Y / never Z" guards across
    // the SOURCES OF AUTHORITY block, and the model surfaced those
    // negations as meta-commentary in output ("the dial notes, without
    // sharing its reading, that..."). The CRAFT block is now positive
    // bindings only: lift, place, surface, describe, voice. The
    // invariants that need a "stay inside" live in the INVARIANT block.
    const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
    expect(prompt).toMatch(/CRAFT:/);
    expect(prompt).toMatch(/Architect speaks only from the title and blurb/i);
    expect(prompt).toMatch(/lifts phrases and places them next to the call/i);
    expect(prompt).toMatch(/the placement does the work; the player carries the inference/i);
    expect(prompt).toMatch(
      /Deciding what a phrase says about Ashley belongs to the player — that is the entire game/i,
    );
    expect(prompt).toMatch(/card is the visible surface you and the player share/i);
    expect(prompt).toMatch(/dial belongs to the mechanism/i);
    expect(prompt).toMatch(
      /operator describes its motion \(wobble, hesitation, refusal to settle\)/i,
    );
    expect(prompt).toMatch(/dial itself has no voice/i);
    expect(prompt).toMatch(/Posture is sardonic prod\. Brief, observed, restrained\./);
  });

  it('requests plain reaction text (no JSON)', () => {
    const prompt = buildReactionPrompt('Test claim', mockCard, 'objection', [], 'strained');
    expect(prompt).toContain('ONLY the reaction text');
    expect(prompt).toContain('no JSON');
  });

  describe('alignment-driven tone', () => {
    it('signals ALIGNED when the player’s call goes with the card', () => {
      const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], 'aligned');
      expect(prompt).toMatch(/Reading alignment[^\n]*ALIGNED/);
      // Aligned branch: quiet destabilization. Player landed on the
      // dominant pull; Architect surfaces the COUNTER-PHRASE (the
      // minority read pulling against the call). Placement carries
      // the weight — no "you do not say so" anchor needed.
      expect(prompt).toMatch(/quiet destabilization/i);
      expect(prompt).toMatch(/landed on the dominant pull/i);
      expect(prompt).toMatch(/Lift the COUNTER-PHRASE/);
      expect(prompt).toMatch(/pulls against the call/i);
      expect(prompt).toMatch(/minority read/i);
      expect(prompt).toMatch(/the placement carries the weight/i);
      expect(prompt).toMatch(/leave wondering whether they read it right/i);
      expect(prompt).not.toMatch(/the weight of what they read past/i);
    });

    it('signals STRAINED when the player’s call cuts against the card', () => {
      const prompt = buildReactionPrompt('Test claim', mockCard, 'objection', [], 'strained');
      expect(prompt).toMatch(/Reading alignment[^\n]*STRAINED/);
      // Strained branch: weight of what the player read past. Player set
      // aside the dominant pull; Architect surfaces the COUNTER-PHRASE
      // (the dominant pull they missed). Placement presses on the call.
      expect(prompt).toMatch(/the weight of what they read past/i);
      expect(prompt).toMatch(/set aside the dominant pull/i);
      expect(prompt).toMatch(/Lift the COUNTER-PHRASE/);
      expect(prompt).toMatch(/from the title or blurb/i);
      expect(prompt).toMatch(/pulls hardest against the call/i);
      expect(prompt).toMatch(/the placement presses on the call/i);
      expect(prompt).toMatch(/leave wondering whether they read it right/i);
      expect(prompt).not.toMatch(/quiet destabilization/i);
    });

    it('signals NEUTRAL for dismiss on a near-zero card', () => {
      // Player walked away from a genuinely ambiguous card — the strike
      // is fair. Light needle, no sharper.
      const prompt = buildReactionPrompt('Test claim', mockCard, 'dismiss', [], null);
      expect(prompt).toMatch(/Reading alignment[^\n]*NEUTRAL/);
      expect(prompt).toMatch(/strike on an unsettled dial/i);
      expect(prompt).toMatch(/tease the hesitation lightly/i);
      expect(prompt).not.toMatch(/the duck/i);
    });

    it('signals STRAINED for dismiss on a card with a clear pull', () => {
      // Player ducked a card with directional weight. Sharper needle:
      // the lever was lit; they walked.
      const prompt = buildReactionPrompt('Test claim', mockCard, 'dismiss', [], 'strained');
      expect(prompt).toMatch(/Reading alignment[^\n]*STRAINED/);
      expect(prompt).toMatch(/the duck\./i);
      expect(prompt).toMatch(/dial was already on a side/i);
      expect(prompt).toMatch(/lever was lit; they walked/i);
      expect(prompt).toMatch(/from the title or blurb/i);
      expect(prompt).not.toMatch(/strike on an unsettled dial/i);
    });

    it('signals NEUTRAL for genuinely ambiguous (near-zero) cards', () => {
      const prompt = buildReactionPrompt('Test claim', mockCard, 'proof', [], null);
      expect(prompt).toMatch(/Reading alignment[^\n]*NEUTRAL/);
      expect(prompt).toMatch(/both pulls roughly even/i);
      expect(prompt).toMatch(/Surface the wobble/i);
      // Neutral non-dismiss: the dial wobbled, player picked a side.
      // Architect surfaces both pulls to make the player feel they
      // tipped a dial that didn't tip on its own.
      expect(prompt).toMatch(/the dial wobbled, and the player picked a side/i);
      expect(prompt).toMatch(/Lift two phrases/i);
      expect(prompt).toMatch(/one that pulls each way/i);
      expect(prompt).toMatch(/dial did not tip on its own; the player tipped it/i);
    });
  });
});
