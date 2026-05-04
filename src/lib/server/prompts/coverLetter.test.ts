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
    expect(prompt).toContain('Verdict rendered: ACCUSED');
  });

  it('labels pardon verdict the same way', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    expect(prompt).toContain('Verdict rendered: PARDONED');
  });

  it('frames the artifact as a portfolio brief in the Architect voice', () => {
    const prompt = buildCoverLetterPrompt(
      'Test claim',
      'pardon',
      truthContext,
      [paramountRuled],
      [],
    );
    // Voice — the Architect filing a brief — stays.
    expect(prompt).toMatch(/filing the brief/i);
    expect(prompt).toMatch(/Architect's voice/i);
    expect(prompt).toMatch(/sardonic magistrate/i);
    // Audience is still a recruiter; the artifact still attaches to a resume.
    expect(prompt).toMatch(/recruiter or hiring manager/i);
    expect(prompt).toMatch(/portfolio artifact/i);
    expect(prompt).toMatch(/attached to Ashley's resume/i);
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
    it('includes paramount cards with directional engagement signal (no gameplay-mechanic vocab)', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toContain('AI Tools Usage');
      expect(prompt).toMatch(/engaged as supporting/i);
      // Gameplay-mechanic vocab must NOT leak into the prompt body — the
      // model picks it up. (The Architect's VOICE — record, gallery,
      // ledger — is allowed; the player-action MECHANIC is not.)
      expect(prompt).not.toMatch(/RULED PROOF/);
      expect(prompt).not.toMatch(/SKIPPED by player/);
    });

    it('marks unengaged paramount cards without gameplay-mechanic vocab', () => {
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
    it('cites the engagement direction without gameplay-mechanic vocab', () => {
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

  describe('voice vs mechanics', () => {
    it('preserves the Architect voice — magistrate, brief, record, gallery, ledger are all in-bounds', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/On the matter of/);
      expect(prompt).toMatch(/the gallery/i);
      expect(prompt).toMatch(/the ledger/i);
      expect(prompt).toMatch(/Industrial-noir register/i);
      // Voice elements are explicitly welcomed:
      expect(prompt).toMatch(/all in-bounds and welcome/i);
    });

    it('forbids gameplay MECHANICS in output — player actions, picks, classifications', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [ruledExtra],
      );
      expect(prompt).toMatch(/never reference the player/i);
      expect(prompt).toMatch(/the player ruled X/i);
      expect(prompt).toMatch(/skipped by the player/i);
      expect(prompt).toMatch(/card-by-card/i);
      expect(prompt).toMatch(/they did not see a game/i);
    });

    it('forbids unengaged paramount cards being framed as "skipped" in output', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountSkipped],
        [],
      );
      expect(prompt).toMatch(/NEVER frame them as "skipped"/i);
      expect(prompt).toMatch(/Architect can enter them on his own authority/i);
    });

    it('forbids a sign-off line in the body — component renders signature separately', () => {
      const prompt = buildCoverLetterPrompt(
        'Test claim',
        'pardon',
        truthContext,
        [paramountRuled],
        [],
      );
      expect(prompt).toMatch(/component renders the Architect's signature separately/i);
      expect(prompt).toMatch(/NO "Yours, …"/);
      expect(prompt).toMatch(/by my hand/i);
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
      expect(prompt).toMatch(/NEVER use Victorian or steampunk vocabulary/);
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

  it('preserves the Architect voice — sardonic magistrate, industrial-noir', () => {
    const prompt = buildClosingLinePrompt('accuse', truthContext);
    expect(prompt).toMatch(/Architect's voice/i);
    expect(prompt).toMatch(/sardonic magistrate/i);
    expect(prompt).toMatch(/industrial-noir register/i);
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

  it('forbids gameplay-mechanic references — player, picks, cards, classifications', () => {
    const prompt = buildClosingLinePrompt('accuse', truthContext);
    expect(prompt).toMatch(/NEVER reference the player/i);
    expect(prompt).toMatch(/picks, cards, classifications/i);
    expect(prompt).toMatch(/saw a brief, not a game/i);
  });

  it('instructs HTML emphasis tags only — no markdown', () => {
    const prompt = buildClosingLinePrompt('accuse', truthContext);
    expect(prompt).toMatch(/<em>/);
    expect(prompt).toMatch(/<strong>/);
    expect(prompt).toMatch(/Never markdown/i);
  });
});
