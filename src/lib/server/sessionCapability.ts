import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { error, type Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { getSupabase } from '$lib/server/supabase';
import { BASELINE_ATTENTION, clampAttention } from '$lib/attention';
import { isUuid } from '$lib/server/validation';

export const SESSION_ID_COOKIE = 'aos_session_id';
export const SESSION_TOKEN_COOKIE = 'aos_session_cap';
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

interface SessionRow {
  session_id: string;
  claim_id: string | null;
  claim_text: string;
  attention: number | null;
  session_token_hash: string;
}

export interface SessionCapabilityContext {
  sessionId: string;
  claimId: string;
  claimText: string;
  attention: number;
}

// timingSafeEqual prevents timing attacks where an attacker could guess
// the correct hash one byte at a time by measuring response latency.
function compareHex(a: string, b: string): boolean {
  const aBytes = Buffer.from(a, 'hex');
  const bBytes = Buffer.from(b, 'hex');
  if (aBytes.length !== bBytes.length || aBytes.length === 0) {
    return false;
  }
  return timingSafeEqual(aBytes, bBytes);
}

function getRequiredCookie(cookies: Cookies, key: string): string {
  const value = cookies.get(key);
  if (!value || typeof value !== 'string') {
    error(401, 'Missing session capability');
  }
  return value;
}

export function hashSessionCapability(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function mintSessionCapability(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSessionCapability(token) };
}

export function setSessionCookies(cookies: Cookies, sessionId: string, token: string): void {
  const secure = !dev;
  const baseOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  };

  cookies.set(SESSION_ID_COOKIE, sessionId, baseOptions);
  cookies.set(SESSION_TOKEN_COOKIE, token, baseOptions);
}

export async function loadSessionCapability(cookies: Cookies): Promise<SessionCapabilityContext> {
  const sessionId = getRequiredCookie(cookies, SESSION_ID_COOKIE);
  if (!isUuid(sessionId)) {
    error(401, 'Invalid session capability');
  }

  const token = getRequiredCookie(cookies, SESSION_TOKEN_COOKIE);
  if (token.length < 20 || token.length > 200) {
    error(401, 'Invalid session capability');
  }

  const { data, error: sessErr } = await getSupabase()
    .schema('suspicion')
    .from('sessions')
    .select('session_id, claim_id, claim_text, attention, session_token_hash')
    .eq('session_id', sessionId)
    .maybeSingle<SessionRow>();

  if (sessErr) {
    console.error('[session-capability] sessions read failed:', sessErr.message);
    error(500, 'Failed to read session');
  }
  if (!data?.claim_id) {
    error(401, 'Invalid session capability');
  }

  const expectedHash = data.session_token_hash;
  if (!expectedHash || !/^[0-9a-f]{64}$/i.test(expectedHash)) {
    error(500, 'Invalid session capability state');
  }

  const providedHash = hashSessionCapability(token);
  if (!compareHex(expectedHash, providedHash)) {
    error(401, 'Invalid session capability');
  }

  return {
    sessionId: data.session_id,
    claimId: data.claim_id,
    claimText: data.claim_text,
    attention: clampAttention(
      typeof data.attention === 'number' ? data.attention : BASELINE_ATTENTION,
    ),
  };
}
