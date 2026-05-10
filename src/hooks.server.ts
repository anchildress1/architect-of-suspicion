import type { Handle } from '@sveltejs/kit';

// Vite's dev server uses `blob:`-URL Web Workers for HMR + module-graph
// machinery. Without `worker-src` set explicitly, browsers fall back to
// `script-src`, which here is `'self' 'unsafe-inline'` — no `blob:`, so
// every dev page logs CSP violations and HMR breaks. In production the
// SvelteKit + Vite output bundles workers as same-origin URLs, so
// `worker-src 'self'` is the right floor and `blob:` is unnecessary
// (and broader than we want).
const isDev = import.meta.env.DEV;
const workerSrc = isDev ? "worker-src 'self' blob:" : "worker-src 'self'";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  workerSrc,
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com",
].join('; ');

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  response.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');

  return response;
};
