import { describe, it, expect } from 'vitest';
import { buildCoverLetterPrompt, buildClosingLinePrompt } from './coverLetter';
import type { ClaimTruthContext, ParamountCardEntry } from '$lib/types';

const truthContext: ClaimTruthContext = {
  hireableTruth: 'Ashley weaponizes AI — teaches it, constrains it, holds it to standard.',
  desiredVerdict: 'pardon',
};

const paramountRuled: ParamountCardEntry = {
  card: {
    objectID: 'card-1',
    title: 'AI Tools Usage',
    blurb: 'Evidence about AI tool usage',
    fact: 'Ashley uses AI tools for code generation, documentation, and project planning.',
    category: 'Philosophy',
    signal: 5,
  },
  classification: 'proof',
};

const paramountSkipped: ParamountCardEntry = {
  card: {
    objectID: 'card-2',
    title: 'ADRs prevent drift',
    blurb: 'Architecture decision records used as a constraint mechanism',
    fact: 'Ashley introduced ADRs to lock context into the codebase.',
    category: 'Constraints',
    signal: 4,
  },
  classification: null,
};

const ruledExtra = {
  card: {
    objectID: 'card-3',
    title: 'Open Source Contributions',
    blurb: 'Community engagement and code sharing',
    fact: 'Ashley maintains several open source projects and contributes regularly.',
    category: 'Engineering',
    signal: 7,
  },
  classification: 'objection' as const,
};

describe('buildCoverLetterPrompt', () => {
  it('includes the claim verbatim', () => {
    const prompt = buildCoverLetterPrompt(
      'Ashley uses AI too much',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    expect(prompt).toContain('Ashley uses AI too much');
  });

  it('labels the verdict the player rendered', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'accuse',
      truthContext,
      [paramountRuled],
      [ruledExtra],
    );
    expect(prompt).toContain('Verdict the player rendered: ACCUSED');
  });

  it('labels pardon verdict the same way', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    expect(prompt).toContain('Verdict the player rendered: PARDONED');
  });

  it('anchors the brief on the hireable truth', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    expect(prompt).toContain(truthContext.hireableTruth);
    expect(prompt).toMatch(/the brief MUST reveal/i);
    expect(prompt).toMatch(/spine of the brief/i);
  });

  describe('verdict alignment opener', () => {
    it('opens with "the player saw the truth clearly" when verdict matches desiredVerdict', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/saw the truth clearly/i);
      expect(prompt).toMatch(/aligns with the record/i);
      expect(prompt).not.toMatch(/the record corrects them/i);
    });

    it('opens with "the record corrects them" when verdict misses desiredVerdict', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'accuse',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/the record corrects them/i);
      expect(prompt).toMatch(/no scolding/i);
      expect(prompt).not.toMatch(/saw the truth clearly/i);
    });

    it('reports verdict alignment as YES vs NO so the model picks the right opener deterministically', () => {
      const matchPrompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      const missPrompt = buildCoverLetterPrompt(
        'Test claim',
        'accuse',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(matchPrompt).toMatch(/YES \(their reading matches the record\)/);
      expect(missPrompt).toMatch(/NO \(the record contradicts their reading\)/);
    });
  });

  describe('paramount evidence', () => {
    it('cites paramount cards the player ruled with their classification', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toContain('AI Tools Usage');
      expect(prompt).toMatch(/RULED PROOF by player/);
    });

    it('marks paramount cards the player skipped as gaps to surface', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountSkipped],
        [],
      );
      expect(prompt).toContain('ADRs prevent drift');
      expect(prompt).toMatch(/SKIPPED by player — surface as a gap/);
    });

    it('surfaces both ruled and skipped paramount cards together', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled, paramountSkipped],
        [],
      );
      expect(prompt).toContain('AI Tools Usage');
      expect(prompt).toContain('ADRs prevent drift');
    });

    it('includes the paramount card fact for the prompt to weave in', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toContain('Ashley uses AI tools for code generation');
    });

    it('warns when no paramount cards loaded — pipeline bug fallback', () => {
      const prompt = buildCoverLetterPrompt('Test claim', 'pardon', truthContext, [], []);
      expect(prompt).toMatch(/No paramount evidence loaded/i);
      expect(prompt).toMatch(/pipeline bug/i);
    });
  });

  describe('ruled extras (non-paramount)', () => {
    it('cites the player ruling for personalization', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [ruledExtra],
      );
      expect(prompt).toContain('Open Source Contributions');
      expect(prompt).toMatch(/RULED OBJECTION by player/);
    });

    it('warns the model not to let extras shift the truth', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [ruledExtra],
      );
      expect(prompt).toMatch(/do NOT let them shift the truth/i);
    });

    it('handles the empty case gracefully', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/No additional ruled evidence beyond the paramount set/i);
    });
  });

  describe('recruiter-safety contract', () => {
    it('declares the recruiter-safety floor non-negotiable', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'accuse',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/recruiter[- ]safety/i);
      expect(prompt).toMatch(/non[- ]negotiable/i);
    });

    it('forbids "found wanting" / "evidence damns" framing', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'accuse',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/found wanting/i);
      expect(prompt).toMatch(/the evidence damns/i);
    });

    it('forbids indictment of competence, integrity, ethics, professionalism', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/competence/i);
      expect(prompt).toMatch(/integrity/i);
      expect(prompt).toMatch(/ethics/i);
      expect(prompt).toMatch(/professionalism/i);
    });

    it('locks two recruiters reaching the same conclusion', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/two recruiters/i);
      expect(prompt).toMatch(/same conclusion about Ashley/i);
    });
  });

  it('instructs to write a verdict brief, not a job application', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    expect(prompt).toContain('verdict brief');
    expect(prompt).toContain('NOT a job application');
  });

  it('requests plain text response (no JSON wrapping)', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    expect(prompt).toContain('ONLY the brief text');
  });

  it('forbids Victorian / steampunk vocabulary', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    expect(prompt).toContain('NEVER use Victorian or steampunk vocabulary');
  });
});

describe('buildClosingLinePrompt', () => {
  it('includes accuse verdict label', () => {
    const prompt = buildClosingLinePrompt('accuse', truthContext);
    expect(prompt).toContain('ACCUSATION');
  });

  it('includes pardon verdict label', () => {
    const prompt = buildClosingLinePrompt('pardon', truthContext);
    expect(prompt).toContain('PARDON');
  });

  it('anchors the closing on the hireable truth regardless of verdict', () => {
    const accusePrompt = buildClosingLinePrompt('accuse', truthContext);
    const pardonPrompt = buildClosingLinePrompt('pardon', truthContext);
    expect(accusePrompt).toContain(truthContext.hireableTruth);
    expect(pardonPrompt).toContain(truthContext.hireableTruth);
  });

  it('requests a single closing line', () => {
    const prompt = buildClosingLinePrompt('accuse', truthContext);
    expect(prompt).toContain('single dramatic closing line');
  });

  it('declares the recruiter-safety floor non-negotiable', () => {
    const prompt = buildClosingLinePrompt('accuse', truthContext);
    expect(prompt).toMatch(/recruiter[- ]safety/i);
    expect(prompt).toMatch(/non[- ]negotiable/i);
  });

  it('forbids damning closing flourishes', () => {
    const prompt = buildClosingLinePrompt('accuse', truthContext);
    expect(prompt).toMatch(/never indict/i);
    expect(prompt).toMatch(/found wanting/i);
  });
});
