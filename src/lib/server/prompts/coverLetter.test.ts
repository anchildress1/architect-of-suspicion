import { describe, it, expect } from 'vitest';
import { buildCoverLetterPrompt, buildClosingLinePrompt } from './coverLetter';

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

describe('buildCoverLetterPrompt', () => {
  it('includes the claim in the prompt', () => {
    const prompt = buildCoverLetterPrompt('Ashley depends on AI too much', 'accuse', []);
    expect(prompt).toContain('Ashley depends on AI too much');
  });

  it('includes the verdict for accuse', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', []);
    expect(prompt).toContain('ACCUSED');
    expect(prompt).toContain('found wanting');
  });

  it('includes the verdict for pardon', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'pardon', []);
    expect(prompt).toContain('PARDONED');
    expect(prompt).toContain('vindicated');
  });

  it('includes evidence card details', () => {
    const evidence = [
      { card: mockCard, classification: 'proof' as const },
      { card: mockCard2, classification: 'objection' as const },
    ];

    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', evidence);
    expect(prompt).toContain('AI Tools Usage');
    expect(prompt).toContain('Evidence about AI tool usage');
    expect(prompt).toContain('Ashley uses AI tools for code generation');
    expect(prompt).toContain('Open Source Contributions');
    expect(prompt).toContain('Community engagement and code sharing');
    expect(prompt).toContain('proof');
    expect(prompt).toContain('objection');
  });

  it('includes card categories', () => {
    const evidence = [{ card: mockCard, classification: 'proof' as const }];
    const prompt = buildCoverLetterPrompt('Test claim', 'pardon', evidence);
    expect(prompt).toContain('Philosophy');
  });

  it('includes evidence counts', () => {
    const evidence = [
      { card: mockCard, classification: 'proof' as const },
      { card: mockCard2, classification: 'objection' as const },
    ];

    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', evidence);
    expect(prompt).toContain('2 total');
    expect(prompt).toContain('1 proof');
    expect(prompt).toContain('1 objection');
  });

  it('handles empty evidence gracefully', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'pardon', []);
    expect(prompt).toContain('No evidence was collected');
  });

  it('instructs to write a character reference, not a job application', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', []);
    expect(prompt).toContain('character reference');
    expect(prompt).toContain('NOT a job application');
  });

  it('adjusts tone instructions based on accuse verdict', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', []);
    expect(prompt).toContain('found WANTING');
  });

  it('adjusts tone instructions based on pardon verdict', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'pardon', []);
    expect(prompt).toContain('VINDICATED');
  });

  it('requests plain text response (no JSON wrapping)', () => {
    const prompt = buildCoverLetterPrompt('Test claim', 'accuse', []);
    expect(prompt).toContain('ONLY the letter text');
    expect(prompt).toContain('no JSON');
  });
});

describe('buildClosingLinePrompt', () => {
  it('includes accuse verdict', () => {
    const prompt = buildClosingLinePrompt('accuse');
    expect(prompt).toContain('ACCUSATION');
  });

  it('includes pardon verdict', () => {
    const prompt = buildClosingLinePrompt('pardon');
    expect(prompt).toContain('PARDON');
  });

  it('requests a single closing line', () => {
    const prompt = buildClosingLinePrompt('accuse');
    expect(prompt).toContain('single dramatic closing line');
  });
});
