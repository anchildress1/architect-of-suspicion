import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

/**
 * Coverage strategy:
 *   - vitest covers .ts files (logic, server routes, stores, helpers) with 100% threshold.
 *   - .svelte files are exercised by Playwright E2E (see playwright.config.ts) and
 *     by the Lighthouse CI pipeline (see lighthouserc{,.mobile}.json).
 *   - Type-only files (types.ts, app.d.ts) and runtime adapters (claude.ts, supabase.ts)
 *     are excluded — they're either declarations or thin wrappers around env-keyed clients
 *     that can't run without secrets.
 */
export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text', 'text-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.d.ts',
        'src/lib/types.ts',
        'src/lib/server/claude.ts',
        'src/lib/server/supabase.ts',
        'src/app.html',
      ],
      // Aggressive thresholds. The remaining gap is sessionStorage paths in
      // gameState.svelte.ts (no DOM in node), the rateLimit cleanup interval,
      // and a couple of defensive `?? '...'` fallbacks. Component coverage is
      // owned by Playwright + Lighthouse, not vitest.
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 95,
        lines: 90,
      },
    },
  },
});
