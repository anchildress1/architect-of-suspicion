import { describe, expect, it } from 'vitest';
import { buildSeedPayload, type PersistInput } from './persist';

function makeInput(overrides: Partial<PersistInput> = {}): PersistInput {
  return {
    claim: {
      id: 'claim-1',
      claim_text: 'Ashley prioritizes novelty over reliability',
      rationale: 'Targets speed vs quality tension',
      tensions_targeted: ['speed-vs-quality'],
    },
    validation: {
      claim_id: 'claim-1',
      claim_text: 'Ashley prioritizes novelty over reliability',
      room_coverage: 6,
      total_eligible_cards: 2,
      survived: true,
      eligible_card_ids: ['card-1', 'card-2'],
    },
    scores: [
      { card_id: 'card-1', ambiguity: 4, surprise: 4 },
      { card_id: 'card-2', ambiguity: 2, surprise: 5 },
    ],
    arguments: new Map([
      [
        'card-1',
        { rewrittenBlurb: 'Rewrite 1', aiScore: 0.6, notes: 'Leans on hidden DEV deadline.' },
      ],
      [
        'card-2',
        {
          rewrittenBlurb: 'Rewrite 2',
          aiScore: -0.4,
          notes: 'Work-vs-play ambiguity intentional.',
        },
      ],
    ]),
    ...overrides,
  };
}

describe('buildSeedPayload', () => {
  it('returns only surviving claims with validated card payload rows (including notes)', () => {
    const survivor = makeInput();
    const cut = makeInput({
      claim: { ...makeInput().claim, id: 'claim-2', claim_text: 'Cut claim' },
      validation: {
        ...makeInput().validation,
        claim_id: 'claim-2',
        claim_text: 'Cut claim',
        survived: false,
      },
    });

    const payload = buildSeedPayload([survivor, cut]);

    expect(payload).toEqual([
      {
        claim_text: survivor.claim.claim_text,
        rationale: survivor.claim.rationale,
        room_coverage: 6,
        total_eligible_cards: 2,
        cards: [
          {
            card_id: 'card-1',
            ambiguity: 4,
            surprise: 4,
            ai_score: 0.6,
            rewritten_blurb: 'Rewrite 1',
            notes: 'Leans on hidden DEV deadline.',
          },
          {
            card_id: 'card-2',
            ambiguity: 2,
            surprise: 5,
            ai_score: -0.4,
            rewritten_blurb: 'Rewrite 2',
            notes: 'Work-vs-play ambiguity intentional.',
          },
        ],
      },
    ]);
  });

  it('throws when a score is out of bounds', () => {
    const invalid = makeInput({
      scores: [
        { card_id: 'card-1', ambiguity: 6, surprise: 4 },
        { card_id: 'card-2', ambiguity: 2, surprise: 5 },
      ],
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/expected integer 1\.\.5/);
  });

  it('throws when an argument is missing for an eligible card', () => {
    const invalid = makeInput({
      arguments: new Map([['card-1', { rewrittenBlurb: 'Rewrite 1', aiScore: 0.6, notes: 'ok' }]]),
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/Missing argument/);
  });

  it('throws when ai_score is out of [-1.0, 1.0] bounds', () => {
    const invalid = makeInput({
      arguments: new Map([
        ['card-1', { rewrittenBlurb: 'Rewrite 1', aiScore: 1.5, notes: 'ok' }],
        ['card-2', { rewrittenBlurb: 'Rewrite 2', aiScore: -0.4, notes: 'ok' }],
      ]),
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/expected number in \[-1\.0, 1\.0\]/);
  });

  it('throws when ai_score is NaN', () => {
    const invalid = makeInput({
      arguments: new Map([
        ['card-1', { rewrittenBlurb: 'Rewrite 1', aiScore: Number.NaN, notes: 'ok' }],
        ['card-2', { rewrittenBlurb: 'Rewrite 2', aiScore: -0.4, notes: 'ok' }],
      ]),
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/expected number in \[-1\.0, 1\.0\]/);
  });

  it('throws when notes is missing', () => {
    const invalid = makeInput({
      arguments: new Map([
        ['card-1', { rewrittenBlurb: 'Rewrite 1', aiScore: 0.6, notes: '' }],
        ['card-2', { rewrittenBlurb: 'Rewrite 2', aiScore: -0.4, notes: 'ok' }],
      ]),
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/Missing notes/);
  });

  it('throws when notes is only whitespace', () => {
    const invalid = makeInput({
      arguments: new Map([
        ['card-1', { rewrittenBlurb: 'Rewrite 1', aiScore: 0.6, notes: '   ' }],
        ['card-2', { rewrittenBlurb: 'Rewrite 2', aiScore: -0.4, notes: 'ok' }],
      ]),
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/Missing notes/);
  });

  it('throws when claim and validation keys do not match', () => {
    const invalid = makeInput({
      validation: {
        ...makeInput().validation,
        claim_id: 'different-claim-id',
      },
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/Validation key mismatch/);
  });

  it('throws when called with no surviving inputs', () => {
    const cut = makeInput({
      validation: { ...makeInput().validation, survived: false },
    });

    expect(() => buildSeedPayload([cut])).toThrow(/no surviving inputs/);
  });

  it('throws when an eligible card id appears twice in the validation list', () => {
    const invalid = makeInput({
      validation: {
        ...makeInput().validation,
        eligible_card_ids: ['card-1', 'card-1'],
      },
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/Duplicate eligible card/);
  });
});
