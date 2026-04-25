import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
    rules: {
      // TypeScript handles undefined-variable checks; ESLint's no-undef
      // doesn't understand DOM globals inside Svelte script blocks.
      'no-undef': 'off',
      // No paths.base configured — resolve() is a no-op and the rule blocks
      // legitimate query-string navigation (e.g. /room/parlor?claim_id=…).
      'svelte/no-navigation-without-resolve': 'off',
    },
  },
  {
    // Plain-JS Node scripts (no TS, no Svelte) need Node globals registered.
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    ignores: ['build/', 'dist/', '.svelte-kit/', 'node_modules/'],
  },
);
