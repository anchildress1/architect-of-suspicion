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

  it('frames the artifact as a portfolio cover letter for a recruiter audience', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    expect(prompt).toMatch(/portfolio cover letter/i);
    expect(prompt).toMatch(/recruiter or hiring manager/i);
    expect(prompt).toMatch(/attaches to a resume/i);
  });

  it('anchors the cover letter on the hireable truth', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    expect(prompt).toContain(truthContext.hireableTruth);
    expect(prompt).toMatch(/the cover letter MUST reveal/i);
    expect(prompt).toMatch(/spine of the cover letter/i);
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
      expect(prompt).toMatch(/truth lands clearly/i);
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
      expect(prompt).toMatch(/truth holds even when the surface/i);
      expect(prompt).toMatch(/without scolding/i);
      expect(prompt).not.toMatch(/truth lands clearly/i);
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
    it('includes paramount cards with directional engagement signal (no gameplay vocab)', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toContain('AI Tools Usage');
      expect(prompt).toMatch(/engaged as supporting/i);
      // Gameplay vocab must NOT leak into the prompt — the model picks it up.
      expect(prompt).not.toMatch(/RULED PROOF/);
      expect(prompt).not.toMatch(/SKIPPED by player/);
    });

    it('marks unengaged paramount cards without gameplay framing', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountSkipped],
        [],
      );
      expect(prompt).toContain('ADRs prevent drift');
      expect(prompt).toMatch(/not engaged during the investigation/i);
      expect(prompt).not.toMatch(/SKIPPED by player/);
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
      expect(prompt).toMatch(/weave/i);
      expect(prompt).toMatch(/DO NOT enumerate/);
      expect(prompt).toMatch(/numbered or bulleted list/i);
    });

    it('warns when no paramount cards loaded — pipeline bug fallback', () => {
      const prompt = buildCoverLetterPrompt('Test claim', 'pardon', truthContext, [], []);
      expect(prompt).toMatch(/No paramount evidence loaded/i);
      expect(prompt).toMatch(/pipeline bug/i);
    });
  });

  describe('personal investigation extras', () => {
    it('cites the engagement direction without gameplay vocab', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [ruledExtra],
      );
      expect(prompt).toContain('Open Source Contributions');
      expect(prompt).toMatch(/engaged as challenging/i);
      expect(prompt).not.toMatch(/RULED OBJECTION/);
    });

    it('warns the model not to let extras override the truth', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [ruledExtra],
      );
      expect(prompt).toMatch(/DO NOT let them override the truth/i);
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

  describe('gameplay-frame leak prevention', () => {
    it('forbids referencing players, verdicts, courts, juries, magistrates in the OUTPUT', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [ruledExtra],
      );
      expect(prompt).toMatch(/NEVER reference players, verdicts, courts/i);
      expect(prompt).toMatch(/no idea a game preceded this/i);
    });

    it('forbids "the brief", case numbers, and filing language in output', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/NO case numbers/);
      expect(prompt).toMatch(/NO "Filed this day"/);
      expect(prompt).toMatch(/NO "On the matter of …"/);
    });

    it('forbids a sign-off line in the body — component renders signature separately', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/NO sign-off/i);
      expect(prompt).toMatch(/component renders the signature separately/i);
    });

    it('forbids unengaged-paramount cards being framed as "skipped" or "the player did not"', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountSkipped],
        [],
      );
      expect(prompt).toMatch(/NEVER frame an absent card as "skipped"/i);
      expect(prompt).toMatch(/the reader doesn't know there was a player/i);
    });
  });

  describe('formatting', () => {
    it('instructs HTML emphasis tags only — no markdown', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/<em>italic<\/em>/i);
      expect(prompt).toMatch(/<strong>bold<\/strong>/i);
      expect(prompt).toMatch(/Never markdown asterisks/i);
    });

    it('forbids Victorian / steampunk vocabulary', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/Never use Victorian or steampunk vocabulary/);
    });

    it('requests plain text response (no JSON wrapping)', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toContain('ONLY the cover letter text');
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

  it('forbids referencing gameplay framing in the closing', () => {
    const prompt = buildClosingLinePrompt('accuse', truthContext);
    expect(prompt).toMatch(/NEVER reference players, verdicts, courts/i);
    expect(prompt).toMatch(/reader doesn't know a game preceded this/i);
  });

  it('instructs HTML emphasis tags only — no markdown', () => {
    const prompt = buildClosingLinePrompt('accuse', truthContext);
    expect(prompt).toMatch(/<em>/);
    expect(prompt).toMatch(/<strong>/);
    expect(prompt).toMatch(/Never markdown/i);
  });
});
