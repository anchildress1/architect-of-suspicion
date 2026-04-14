import { describe, it, expect } from 'vitest';
import { buildEvaluationPrompt } from './evaluate';

const mockCard = {
  objectID: 'card-1',
  title: 'AI Tools Usage',
  blurb: 'Evidence about AI tool usage',
  fact: 'Ashley uses AI tools for code generation, documentation, and project planning.',
  category: 'Philosophy',
  signal: 5,
};

describe('buildEvaluationPrompt', () => {
  it('includes the claim in the prompt', () => {
    const prompt = buildEvaluationPrompt(
      'Ashley depends on AI too much',
      mockCard,
      'proof',
      [],
    );
    expect(prompt).toContain('Ashley depends on AI too much');
  });

  it('includes card title and blurb', () => {
    const prompt = buildEvaluationPrompt(
      'Test claim',
      mockCard,
      'proof',
      [],
    );
    expect(prompt).toContain('AI Tools Usage');
    expect(prompt).toContain('Evidence about AI tool usage');
  });

  it('includes the fact (full hidden context)', () => {
    const prompt = buildEvaluationPrompt(
      'Test claim',
      mockCard,
      'proof',
      [],
    );
    expect(prompt).toContain('Ashley uses AI tools for code generation');
  });

  it('includes the classification', () => {
    const prompt = buildEvaluationPrompt(
      'Test claim',
      mockCard,
      'objection',
      [],
    );
    expect(prompt).toContain('objection');
  });

  it('includes evidence history when provided', () => {
    const history = [
      { card_id: 'c1', card_title: 'Previous Card', classification: 'proof' as const },
      { card_id: 'c2', card_title: 'Another Card', classification: 'objection' as const },
    ];

    const prompt = buildEvaluationPrompt(
      'Test claim',
      mockCard,
      'proof',
      history,
    );
    expect(prompt).toContain('Previous Card');
    expect(prompt).toContain('Another Card');
    expect(prompt).toContain('proof');
    expect(prompt).toContain('objection');
  });

  it('shows empty history message when no prior picks', () => {
    const prompt = buildEvaluationPrompt(
      'Test claim',
      mockCard,
      'proof',
      [],
    );
    expect(prompt).toContain('No prior evidence collected');
  });

  it('includes card category', () => {
    const prompt = buildEvaluationPrompt(
      'Test claim',
      mockCard,
      'proof',
      [],
    );
    expect(prompt).toContain('Philosophy');
  });

  it('requests JSON response format', () => {
    const prompt = buildEvaluationPrompt(
      'Test claim',
      mockCard,
      'proof',
      [],
    );
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('score');
    expect(prompt).toContain('reaction');
  });
});
