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

  it('labels the verdict ACCUSED for the accuse path', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'accuse',
      truthContext,
      [paramountRuled],
      [],
    );
    expect(prompt).toContain('Verdict rendered: ACCUSED');
  });

  it('labels the verdict PARDONED for the pardon path', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    expect(prompt).toContain('Verdict rendered: PARDONED');
  });

  it('frames the artifact as a cover letter attached to a resume, voiced by The Architect', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    // Function: this is a cover letter that attaches to the resume.
    expect(prompt).toMatch(/cover letter/i);
    expect(prompt).toMatch(/attaches to Ashley's resume/i);
    expect(prompt).toMatch(/recruiter or hiring manager/i);
    // Voice: The Architect's, AI operator of the mechanism.
    expect(prompt).toMatch(/AI operator of the mechanism/i);
    expect(prompt).toMatch(/The Architect's/i);
  });

  it('anchors the record on the hireable truth', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    expect(prompt).toContain(truthContext.hireableTruth);
    expect(prompt).toMatch(/spine of the record/i);
    expect(prompt).toMatch(/anchor every paragraph on the hireable truth/i);
  });

  describe('verdict alignment opener', () => {
    it('opens with the truth-lands-clearly framing when verdict matches desiredVerdict', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/truth landing clearly/i);
      expect(prompt).toMatch(/aligns with the record/i);
      expect(prompt).not.toMatch(/holds even when the surface/i);
    });

    it('opens with the truth-still-holds framing when verdict misses desiredVerdict', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'accuse',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/truth holding even when the surface/i);
      expect(prompt).not.toMatch(/truth landing clearly/i);
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
      expect(matchPrompt).toMatch(/YES \(the chosen reading matches the record\)/);
      expect(missPrompt).toMatch(/NO \(the record contradicts the chosen reading\)/);
    });
  });

  describe('evidence pool', () => {
    it('feeds engaged paramount cards into the prompt with their direction', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toContain('AI Tools Usage');
      expect(prompt).toMatch(/engaged as supporting/i);
    });

    it('feeds unengaged paramount cards into the prompt without gameplay-mechanic vocab', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountSkipped],
        [],
      );
      expect(prompt).toContain('ADRs prevent drift');
      expect(prompt).toMatch(/not engaged during the examination/i);
    });

    it('surfaces both engaged and unengaged paramount cards together', () => {
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

    it('instructs the model to pick 3-5 strongest pieces and weave them as prose', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/3-5 STRONGEST/i);
      expect(prompt).toMatch(/weave them into prose/i);
      expect(prompt).toMatch(/no card-by-card enumeration/i);
    });

    it('warns when no paramount cards loaded — pipeline bug fallback', () => {
      const prompt = buildCoverLetterPrompt('Test claim', 'pardon', truthContext, [], []);
      expect(prompt).toMatch(/No paramount evidence loaded/i);
      expect(prompt).toMatch(/pipeline bug/i);
    });
  });

  describe('personal investigation extras', () => {
    it('feeds engaged extras with their direction (no gameplay-mechanic vocab)', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [ruledExtra],
      );
      expect(prompt).toContain('Open Source Contributions');
      expect(prompt).toMatch(/engaged as challenging/i);
    });

    it('signals that extras are personalization, not load-bearing for the truth', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [ruledExtra],
      );
      expect(prompt).toMatch(/the truth doesn't depend on them/i);
    });

    it('handles the empty case gracefully', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/No additional engaged evidence beyond the paramount set/i);
    });
  });

  describe('recruiter-safety and voice', () => {
    it('declares the recruiter-safety floor', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'accuse',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/recruiter[- ]safety floor/i);
    });

    it('locks both readings of the surface claim to leave Ashley hireable', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/both readings of the surface claim/i);
      expect(prompt).toMatch(/leave Ashley sounding hireable/i);
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

    it('frames working-style traits positively as substance recruiters respect', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/working-style trait/i);
      expect(prompt).toMatch(/recruiters respect/i);
    });

    it('paints the industrial-noir vocabulary palette positively', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      // Welcomed openers spelled out so the model has somewhere to land.
      expect(prompt).toMatch(/The mechanism has settled on/i);
      expect(prompt).toMatch(/The dial has come to rest/i);
      // Vocabulary palette named.
      expect(prompt).toMatch(/instrument, ledger, record, gallery, mechanism/i);
    });

    it('provides positive replacements for "what was asked of Ashley" so the model has somewhere to land instead of "the brief"', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/the assignment, the scope, the constraint/i);
    });
  });

  // Calibration block was deleted in the no-negative-anchoring rewrite.
  // Listing forbidden phrases primes the model on the very vocabulary the
  // list is trying to suppress; the positive-frame approach (vocabulary
  // palette + recruiter-safety floor + hireable-truth spine) carries the
  // safety contract without naming what to avoid. The tests in
  // "recruiter-safety and voice" and "evidence pool" already verify the
  // positive guidance is present.

  describe('formatting', () => {
    it('instructs HTML emphasis tags only — no markdown', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/<em>/);
      expect(prompt).toMatch(/<strong>/);
      expect(prompt).toMatch(/markdown/i);
    });

    it('requests plain text response (no JSON wrapping)', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toContain('ONLY the record text');
    });
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
    expect(accusePrompt).toMatch(/Anchor the line on the hireable truth/i);
  });

  it('requests a single closing line', () => {
    const prompt = buildClosingLinePrompt('accuse', truthContext);
    expect(prompt).toContain('single dramatic closing line');
  });

  it('preserves the Architect voice — sardonic AI operator, industrial-noir', () => {
    const prompt = buildClosingLinePrompt('accuse', truthContext);
    expect(prompt).toMatch(/The Architect's voice/i);
    expect(prompt).toMatch(/sardonic AI operator/i);
    expect(prompt).toMatch(/industrial-noir/i);
  });

  it('instructs HTML emphasis tags only — no markdown', () => {
    const prompt = buildClosingLinePrompt('accuse', truthContext);
    expect(prompt).toMatch(/<em>/);
    expect(prompt).toMatch(/<strong>/);
    expect(prompt).toMatch(/markdown/i);
  });
});
