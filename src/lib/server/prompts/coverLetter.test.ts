import { describe, it, expect } from 'vitest';
import { buildCoverLetterPrompt, buildClosingLinePrompt } from './coverLetter';
import type { ClaimVerdictReadings } from '$lib/types';

const mockCard = {
  objectID: 'card-1',
  title: 'AI Tools Usage',
  blurb: 'Evidence about AI tool usage',
  fact: 'Ashley uses AI tools for code generation, documentation, and project planning.',
  category: 'Philosophy',
  signal: 5,
};

const mockCard2 = {
  objectID: 'card-2',
  title: 'Open Source Contributions',
  blurb: 'Community engagement and code sharing',
  fact: 'Ashley maintains several open source projects and contributes regularly.',
  category: 'Engineering',
  signal: 7,
};

const readings: ClaimVerdictReadings = {
  guilty: 'a force-multiplier who treats AI tooling as another instrument in the kit',
  notGuilty: 'a hands-on builder who reaches for AI only where it earns its place',
};

describe('buildCoverLetterPrompt', () => {
  it('includes the claim verbatim', () => {
    const prompt = buildCoverLetterPrompt('Ashley depends on AI too much', 'accuse', [], readings);
    expect(prompt).toContain('Ashley depends on AI too much');
  });

  it('labels the verdict for accuse', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', [], readings);
    expect(prompt).toContain('Verdict: ACCUSED');
  });

  it('labels the verdict for pardon', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'pardon', [], readings);
    expect(prompt).toContain('Verdict: PARDONED');
  });

  it('anchors the brief on the guilty reading when verdict is accuse', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', [], readings);
    expect(prompt).toContain(readings.guilty);
    expect(prompt).toContain('Trait surfaced by this verdict');
  });

  it('anchors the brief on the not-guilty reading when verdict is pardon', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'pardon', [], readings);
    expect(prompt).toContain(readings.notGuilty);
    expect(prompt).toContain('Trait surfaced by this verdict');
  });

  it('also includes the opposite reading as context, marked do-not-pivot', () => {
    const accusePrompt = buildCoverLetterPrompt('Test claim', 'accuse', [], readings);
    expect(accusePrompt).toContain(readings.notGuilty);
    expect(accusePrompt).toMatch(/do NOT pivot/i);
  });

  it('includes evidence card details', () => {
    const evidence = [
      { card: mockCard, classification: 'proof' as const },
      { card: mockCard2, classification: 'objection' as const },
    ];

    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', evidence, readings);
    expect(prompt).toContain('AI Tools Usage');
    expect(prompt).toContain('Evidence about AI tool usage');
    expect(prompt).toContain('Ashley uses AI tools for code generation');
    expect(prompt).toContain('Open Source Contributions');
  });

  it('counts ruled evidence', () => {
    const evidence = [
      { card: mockCard, classification: 'proof' as const },
      { card: mockCard2, classification: 'objection' as const },
    ];

    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', evidence, readings);
    expect(prompt).toContain('2 total');
    expect(prompt).toContain('1 proof');
    expect(prompt).toContain('1 objection');
  });

  it('handles empty evidence gracefully', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'pardon', [], readings);
    expect(prompt).toContain('No evidence was ruled on');
  });

  it('reminds the model to ignore dismissed exhibits', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', [], readings);
    expect(prompt).toContain('Dismissed exhibits have been struck from the record');
  });

  it('instructs to write a verdict brief, not a job application', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', [], readings);
    expect(prompt).toContain('verdict brief');
    expect(prompt).toContain('NOT a job application');
  });

  it('requests plain text response (no JSON wrapping)', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', [], readings);
    expect(prompt).toContain('ONLY the brief text');
  });

  it('forbids Victorian / steampunk vocabulary', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', [], readings);
    expect(prompt).toContain('NEVER use Victorian or steampunk vocabulary');
  });

  // Recruiter-safety contract: this is the public artifact a hiring manager
  // reads. Lock the dual-hireability framing into the prompt so a future
  // edit can't silently re-introduce condemnation language under "accuse".
  describe('recruiter-safety contract', () => {
    it('declares the recruiter-safety floor non-negotiable', () => {
      const prompt = buildCoverLetterPrompt('Test claim', 'accuse', [], readings);
      expect(prompt).toMatch(/recruiter[- ]safety/i);
      expect(prompt).toMatch(/non[- ]negotiable/i);
    });

    it('forbids "found wanting" / "evidence damns" framing under accuse', () => {
      const prompt = buildCoverLetterPrompt('Test claim', 'accuse', [], readings);
      expect(prompt).toMatch(/never write text that indicts/i);
      expect(prompt).toMatch(/found wanting/i);
      expect(prompt).toMatch(/the evidence damns/i);
    });

    it('forbids indictment of competence, integrity, ethics, professionalism', () => {
      const prompt = buildCoverLetterPrompt('Test claim', 'pardon', [], readings);
      expect(prompt).toMatch(/competence/i);
      expect(prompt).toMatch(/integrity/i);
      expect(prompt).toMatch(/ethics/i);
      expect(prompt).toMatch(/professionalism/i);
    });

    it('frames Proof and Objection as one coherent professional pattern', () => {
      const prompt = buildCoverLetterPrompt('Test claim', 'accuse', [], readings);
      expect(prompt).toMatch(/one coherent professional pattern/i);
      expect(prompt).toMatch(/not as a tally/i);
    });

    it('makes the surfaced trait the spine of the brief', () => {
      const prompt = buildCoverLetterPrompt('Test claim', 'accuse', [], readings);
      expect(prompt).toMatch(/spine of the brief/i);
    });
  });
});

describe('buildClosingLinePrompt', () => {
  it('includes accuse verdict label', () => {
    const prompt = buildClosingLinePrompt('accuse', readings);
    expect(prompt).toContain('ACCUSATION');
  });

  it('includes pardon verdict label', () => {
    const prompt = buildClosingLinePrompt('pardon', readings);
    expect(prompt).toContain('PARDON');
  });

  it('anchors closing on the guilty reading under accuse', () => {
    const prompt = buildClosingLinePrompt('accuse', readings);
    expect(prompt).toContain(readings.guilty);
    expect(prompt).not.toContain(readings.notGuilty);
  });

  it('anchors closing on the not-guilty reading under pardon', () => {
    const prompt = buildClosingLinePrompt('pardon', readings);
    expect(prompt).toContain(readings.notGuilty);
    expect(prompt).not.toContain(readings.guilty);
  });

  it('requests a single closing line', () => {
    const prompt = buildClosingLinePrompt('accuse', readings);
    expect(prompt).toContain('single dramatic closing line');
  });

  it('declares the recruiter-safety floor non-negotiable', () => {
    const prompt = buildClosingLinePrompt('accuse', readings);
    expect(prompt).toMatch(/recruiter[- ]safety/i);
    expect(prompt).toMatch(/non[- ]negotiable/i);
  });

  it('forbids damning closing flourishes', () => {
    const prompt = buildClosingLinePrompt('accuse', readings);
    expect(prompt).toMatch(/never indict/i);
    expect(prompt).toMatch(/found wanting/i);
  });
});
