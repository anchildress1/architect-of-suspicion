/** Prompt-contract tests. Lock in the dual-hireability framing across the
 *  seed pipeline so future prompt edits cannot silently re-introduce
 *  character-indictment language. The game is a recruiter-facing artifact;
 *  these strings ARE the product surface. */

import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT as PASS1 } from './pass1-tensions';
import { SYSTEM_PROMPT as PASS2 } from './pass2-claims';
import { SYSTEM_PROMPT as PASS4 } from './pass4-validate';

describe('seed prompts: dual-hireability invariants', () => {
  describe('Pass 1 — tensions', () => {
    it('frames tensions as working-style, not virtue/vice', () => {
      expect(PASS1).toMatch(/working[- ]style/i);
    });

    it('forbids the legacy "rationalization" framing that produced moral indictments', () => {
      expect(PASS1).not.toMatch(/rationalization/i);
    });

    it('explicitly rejects moral / character / ethics framing', () => {
      expect(PASS1).toMatch(/moral|ethical|character/i);
    });
  });

  describe('Pass 2 — claims', () => {
    it('mandates the dual-hireability test', () => {
      expect(PASS2).toMatch(/dual[- ]hireab/i);
    });

    it('requires guilty_reading and not_guilty_reading per claim', () => {
      expect(PASS2).toMatch(/guilty_reading/);
      expect(PASS2).toMatch(/not_guilty_reading/);
    });

    it('explicitly bans character indictments — competence, integrity, ethics', () => {
      expect(PASS2).toMatch(/competence/i);
      expect(PASS2).toMatch(/integrity/i);
      expect(PASS2).toMatch(/ethics/i);
    });

    it('drops the legacy "blunt, provocative accusation" framing', () => {
      expect(PASS2).not.toMatch(/blunt,?\s+provocative\s+accusation/i);
    });

    it('lists the legacy bad-shape claims as forbidden examples', () => {
      // These exact claim shapes shipped in earlier seed runs and damaged
      // the public artifact. They MUST appear in the rejection criteria so
      // the model never regenerates them.
      expect(PASS2).toMatch(/coasts on reputation/i);
      expect(PASS2).toMatch(/takes credit/i);
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
