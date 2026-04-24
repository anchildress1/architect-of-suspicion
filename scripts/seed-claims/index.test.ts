import { describe, expect, it } from 'vitest';
import { requiredEnvVarsForModels, validateEnv } from './index';
import type { Config } from './config';

function makeModels(overrides: Partial<Config['models']> = {}): Config['models'] {
  return {
    pass1: 'claude-sonnet-4-6',
    pass2: 'gpt-5.4-mini',
    pass3: 'gpt-5.4-mini',
    pass4: 'gemini-3.1-flash-lite-preview',
    ...overrides,
  };
}

describe('seed-claims env validation', () => {
  it('collects only provider keys required by configured models', () => {
    const required = requiredEnvVarsForModels(
      makeModels({
        pass1: 'gpt-5.4-mini',
        pass2: 'gpt-5.4-mini',
        pass3: 'gpt-5.4-mini',
        pass4: 'gpt-5.4-mini',
      }),
    );

    expect(required.sort()).toEqual(['OPENAI_API_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_URL']);
  });

  it('passes when required keys are present for the configured providers', () => {
    const env: NodeJS.ProcessEnv = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: 'secret',
      ANTHROPIC_API_KEY: 'anthropic',
      OPENAI_API_KEY: 'openai',
      GEMINI_API_KEY: 'gemini',
    };

    expect(() => validateEnv(makeModels(), env)).not.toThrow();
  });

  it('fails when a required provider key is missing', () => {
    const env: NodeJS.ProcessEnv = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: 'secret',
      OPENAI_API_KEY: 'openai',
    };

    expect(() => validateEnv(makeModels(), env)).toThrow(/GEMINI_API_KEY/);
  });

  it('fails when pass2 and pass4 use the same provider', () => {
    const env: NodeJS.ProcessEnv = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: 'secret',
      ANTHROPIC_API_KEY: 'anthropic',
      OPENAI_API_KEY: 'openai',
    };

    expect(() => validateEnv(makeModels({ pass2: 'gpt-5.4-mini', pass4: 'gpt-5.4' }), env)).toThrow(
      /must differ/,
    );
  });
});
