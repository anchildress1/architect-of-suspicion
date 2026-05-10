import { describe, expect, it } from 'vitest';
import { buildSeedPayload, type PersistInput } from './persist';

function makeInput(overrides: Partial<PersistInput> = {}): PersistInput {
  return {
    claim: {
      id: 'claim-1',
      claim_text: 'Ashley uses AI too much',
      rationale: 'Targets the AI tooling tension across Decisions and Experimentation',
      truths_targeted: ['ai-as-leverage'],
      hireable_truth: 'Ashley weaponizes AI — teaches it, constrains it, holds it to standard.',
      desired_verdict: 'pardon',
    },
    validation: {
      claim_id: 'claim-1',
      claim_text: 'Ashley uses AI too much',
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
        {
          rewrittenBlurb: 'Rewrite 1',
          aiScore: 0.6,
          notes: 'Leans on hidden DEV deadline.',
          isParamount: true,
        },
      ],
      [
        'card-2',
        {
          rewrittenBlurb: 'Rewrite 2',
          aiScore: -0.4,
          notes: 'Work-vs-play ambiguity intentional.',
          isParamount: false,
        },
      ],
    ]),
    ...overrides,
  };
}

describe('buildSeedPayload', () => {
  it('returns only surviving claims with validated card payload rows (including paramount + verdict)', () => {
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
        hireable_truth: survivor.claim.hireable_truth,
        desired_verdict: survivor.claim.desired_verdict,
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
            is_paramount: true,
          },
          {
            card_id: 'card-2',
            ambiguity: 2,
            surprise: 5,
            ai_score: -0.4,
            rewritten_blurb: 'Rewrite 2',
            notes: 'Work-vs-play ambiguity intentional.',
            is_paramount: false,
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
      arguments: new Map([
        ['card-1', { rewrittenBlurb: 'Rewrite 1', aiScore: 0.6, notes: 'ok', isParamount: true }],
      ]),
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/Missing argument/);
  });

  it('throws when ai_score is out of [-1.0, 1.0] bounds', () => {
    const invalid = makeInput({
      arguments: new Map([
        ['card-1', { rewrittenBlurb: 'Rewrite 1', aiScore: 1.5, notes: 'ok', isParamount: true }],
        ['card-2', { rewrittenBlurb: 'Rewrite 2', aiScore: -0.4, notes: 'ok', isParamount: false }],
      ]),
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/expected number in \[-1\.0, 1\.0\]/);
  });

  it('throws when ai_score is NaN', () => {
    const invalid = makeInput({
      arguments: new Map([
        [
          'card-1',
          { rewrittenBlurb: 'Rewrite 1', aiScore: Number.NaN, notes: 'ok', isParamount: true },
        ],
        ['card-2', { rewrittenBlurb: 'Rewrite 2', aiScore: -0.4, notes: 'ok', isParamount: false }],
      ]),
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/expected number in \[-1\.0, 1\.0\]/);
  });

  it('throws when notes is missing', () => {
    const invalid = makeInput({
      arguments: new Map([
        ['card-1', { rewrittenBlurb: 'Rewrite 1', aiScore: 0.6, notes: '', isParamount: true }],
        ['card-2', { rewrittenBlurb: 'Rewrite 2', aiScore: -0.4, notes: 'ok', isParamount: false }],
      ]),
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/Missing notes/);
  });

  it('throws when notes is only whitespace', () => {
    const invalid = makeInput({
      arguments: new Map([
        ['card-1', { rewrittenBlurb: 'Rewrite 1', aiScore: 0.6, notes: '   ', isParamount: true }],
        ['card-2', { rewrittenBlurb: 'Rewrite 2', aiScore: -0.4, notes: 'ok', isParamount: false }],
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

  it('throws when hireable_truth is missing — runtime brief would have no anchor', () => {
    const invalid = makeInput({
      claim: { ...makeInput().claim, hireable_truth: '' },
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/Missing hireable_truth/);
  });

  it('throws when hireable_truth is whitespace-only', () => {
    const invalid = makeInput({
      claim: { ...makeInput().claim, hireable_truth: '   ' },
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/Missing hireable_truth/);
  });

  it('trims surrounding whitespace from hireable_truth before persisting', () => {
    const padded = makeInput({
      claim: {
        ...makeInput().claim,
        hireable_truth: '  weaponizes AI with discipline  ',
      },
    });

    const [row] = buildSeedPayload([padded]);
    expect(row.hireable_truth).toBe('weaponizes AI with discipline');
  });

  it('throws when desired_verdict is invalid', () => {
    const invalid = makeInput({
      claim: {
        ...makeInput().claim,
        desired_verdict: 'maybe' as unknown as 'accuse' | 'pardon',
      },
    });

    expect(() => buildSeedPayload([invalid])).toThrow(/Invalid desired_verdict/);
  });

  it('persists desired_verdict for both accuse and pardon', () => {
    const accuseInput = makeInput({
      claim: { ...makeInput().claim, desired_verdict: 'accuse' },
    });
    const [row] = buildSeedPayload([accuseInput]);
    expect(row.desired_verdict).toBe('accuse');
  });

  it('throws when no card on a surviving claim is paramount — pipeline bug', () => {
    const noneFlagged = makeInput({
      arguments: new Map([
        ['card-1', { rewrittenBlurb: 'Rewrite 1', aiScore: 0.6, notes: 'ok', isParamount: false }],
        ['card-2', { rewrittenBlurb: 'Rewrite 2', aiScore: -0.4, notes: 'ok', isParamount: false }],
      ]),
    });

    expect(() => buildSeedPayload([noneFlagged])).toThrow(/No paramount cards/);
  });
});
