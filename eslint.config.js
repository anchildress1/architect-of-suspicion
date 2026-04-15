import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';

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
    },
  },
  {
    ignores: ['build/', 'dist/', '.svelte-kit/', 'node_modules/'],
  },
);
