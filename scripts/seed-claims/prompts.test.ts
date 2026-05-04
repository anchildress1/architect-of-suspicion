/** Prompt-contract tests. Lock in the single-truth + recruiter-safety
 *  framing across the seed pipeline so future prompt edits cannot silently
 *  re-introduce character-indictment language or revert to dual-reading
 *  framing. The game is a recruiter-facing artifact; these strings ARE the
 *  product surface. */

import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT as PASS1 } from './pass1-tensions';
import { SYSTEM_PROMPT as PASS2 } from './pass2-claims';
import { SYSTEM_PROMPT as PASS4 } from './pass4-validate';

describe('seed prompts: single-truth + recruiter-safety invariants', () => {
  describe('Pass 1 — truths', () => {
    it('frames the output as truths, not tensions', () => {
      expect(PASS1).toMatch(/truths?/i);
      // The legacy "tensions" framing is gone — its persistence in the
      // prompt drove dual-reading drift downstream.
      expect(PASS1).not.toMatch(/fault lines?/i);
    });

    it('forbids the legacy "rationalization" framing that produced moral indictments', () => {
      expect(PASS1).not.toMatch(/rationalization/i);
    });

    it('explicitly rejects moral / character / ethics framing', () => {
      expect(PASS1).toMatch(/moral|ethical|character|integrity/i);
    });

    it('requires reasonable_doubt as the seed of the surface claim', () => {
      expect(PASS1).toMatch(/reasonable[- ]doubt|reasonable_doubt/i);
    });
  });

  describe('Pass 2 — claims', () => {
    it('mandates a single hireable_truth per claim (no dual readings)', () => {
      expect(PASS2).toMatch(/hireable_truth/);
      expect(PASS2).not.toMatch(/guilty_reading/);
      expect(PASS2).not.toMatch(/not_guilty_reading/);
    });

    it('requires desired_verdict to flag the surface claim as true or false of Ashley', () => {
      expect(PASS2).toMatch(/desired_verdict/);
      expect(PASS2).toMatch(/accuse/);
      expect(PASS2).toMatch(/pardon/);
    });

    it('explicitly bans character indictments — competence, integrity, ethics', () => {
      expect(PASS2).toMatch(/competence/i);
      expect(PASS2).toMatch(/integrity/i);
      expect(PASS2).toMatch(/ethics/i);
    });

    it('drops the legacy "blunt, provocative accusation" framing', () => {
      expect(PASS2).not.toMatch(/blunt,?\s+provocative\s+accusation/i);
    });

    it('teaches the abstraction floor — claims travel across chambers, no specific tools or scopes', () => {
      // Earlier prompts also enumerated the legacy bad shapes ("Ashley
      // coasts on reputation", "Ashley takes credit"). Listing forbidden
      // phrasings primes the model on the very phrases the list is
      // trying to suppress (see feedback_no_negative_anchoring.md). The
      // current prompt teaches the abstraction floor positively: the
      // verb has to describe a posture that recurs across 5+ chambers,
      // and concrete examples illustrate the narrow→wide transform
      // ("over-polices process with lint rules" → "over-polices process").
      expect(PASS2).toMatch(/abstraction floor/i);
      expect(PASS2).toMatch(/verbs that travel/i);
      expect(PASS2).toMatch(/with lint rules/);
      expect(PASS2).toMatch(/broaden the verb/i);
    });

    it('warns the model that downstream cross-checks drop verdict mismatches', () => {
      // Pass 4 compares declared desired_verdict against avg ai_score sign;
      // the prompt must signal that the model can't lie about it without
      // losing the claim.
      expect(PASS2).toMatch(/cross[- ]check|drops the claim|mismatch/i);
    });
  });

  describe('Pass 4 — rewrite', () => {
    it('declares recruiter-safety as non-negotiable', () => {
      expect(PASS4).toMatch(/recruiter[- ]safety/i);
      expect(PASS4).toMatch(/non[- ]negotiable/i);
    });

    it('requires both proof and objection readings to describe hireable traits', () => {
      expect(PASS4).toMatch(/hireable/i);
      expect(PASS4).toMatch(/proof/i);
      expect(PASS4).toMatch(/objection/i);
    });

    it('forbids text that indicts competence, integrity, or basic professionalism', () => {
      expect(PASS4).toMatch(/competence/i);
      expect(PASS4).toMatch(/integrity/i);
      expect(PASS4).toMatch(/professionalism/i);
    });
  });
});
