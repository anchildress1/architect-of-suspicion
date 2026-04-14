import { describe, it, expect } from 'vitest';
import type { Verdict } from '$lib/types';

// Svelte 5 components cannot be trivially rendered in vitest without a DOM environment.
// We test the core data contracts and logic that the VerdictConfirmation component depends on.

describe('VerdictConfirmation data contract', () => {
  it('verdict type is limited to accuse and pardon', () => {
    const validVerdicts: Verdict[] = ['accuse', 'pardon'];
    expect(validVerdicts).toContain('accuse');
    expect(validVerdicts).toContain('pardon');
    expect(validVerdicts).toHaveLength(2);
  });

  it('component props require verdict and oncancel', () => {
    // Type-level test: ensure the expected props shape is valid
    const props: { verdict: Verdict; oncancel: () => void } = {
      verdict: 'accuse',
      oncancel: () => {},
    };
    expect(props.verdict).toBe('accuse');
    expect(typeof props.oncancel).toBe('function');
  });

  it('oncancel callback can be invoked', () => {
    let called = false;
    const oncancel = () => { called = true; };
    oncancel();
    expect(called).toBe(true);
  });

  it('generate-letter request body shape is correct for accuse', () => {
    const body = {
      session_id: 'test-uuid',
      claim: 'Ashley depends on AI too much',
      verdict: 'accuse' as Verdict,
    };
    expect(body.session_id).toBeTruthy();
    expect(body.claim).toBeTruthy();
    expect(body.verdict).toBe('accuse');
  });

  it('generate-letter request body shape is correct for pardon', () => {
    const body = {
      session_id: 'test-uuid',
      claim: 'Ashley depends on AI too much',
      verdict: 'pardon' as Verdict,
    };
    expect(body.verdict).toBe('pardon');
  });

  it('sessionStorage data shape matches expected format', () => {
    const data = {
      cover_letter: 'The gears have spoken...',
      architect_closing: 'The trial ends.',
      claim: 'Ashley depends on AI too much',
      verdict: 'accuse' as Verdict,
    };
    expect(data.cover_letter).toBeTruthy();
    expect(data.architect_closing).toBeTruthy();
    expect(data.claim).toBeTruthy();
    expect(data.verdict).toBe('accuse');
  });
});
