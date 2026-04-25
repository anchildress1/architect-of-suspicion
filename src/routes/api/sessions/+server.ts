import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabase } from '$lib/server/supabase';
import { getClaimById } from '$lib/server/claims';
import { BASELINE_ATTENTION } from '$lib/attention';
import { rateLimitGuard } from '$lib/server/rateLimit';
import { isUuid, parseJsonBodyWithLimit } from '$lib/server/validation';
import { mintSessionCapability, setSessionCookies } from '$lib/server/sessionCapability';

interface CreateSessionRequest {
  claim_id?: string;
}

const MAX_SESSION_REQUEST_BYTES = 1_024;

export const POST: RequestHandler = async ({ request, getClientAddress, cookies }) => {
  const blocked = rateLimitGuard(getClientAddress());
  if (blocked) return blocked;

  const body = await parseJsonBodyWithLimit<CreateSessionRequest>(
    request,
    MAX_SESSION_REQUEST_BYTES,
  );
  const claimId = body.claim_id;
  if (!claimId || typeof claimId !== 'string' || !isUuid(claimId)) {
    error(400, 'Missing or invalid claim_id');
  }

  const { claim, error: claimErr } = await getClaimById(claimId);
  if (claimErr && claimErr !== 'Claim not found') {
    // getClaimById already logged the underlying Postgres error.
    error(500, claimErr);
  }
  if (!claim) {
    error(404, 'Claim not found');
  }

  const capability = mintSessionCapability();

  const { data, error: dbError } = await getSupabase()
    .schema('suspicion')
    .from('sessions')
    .insert({
      claim_id: claim.id,
      claim_text: claim.text,
      attention: BASELINE_ATTENTION,
      session_token_hash: capability.tokenHash,
    })
    .select('session_id')
    .single();

  if (dbError || !data?.session_id) {
    console.error('[sessions] insert failed:', dbError?.message ?? 'no session_id returned');
    error(500, 'Failed to create session');
  }

  setSessionCookies(cookies, data.session_id, capability.token);

  return json({
    session_id: data.session_id,
    claim_id: claim.id,
    claim_text: claim.text,
    attention: BASELINE_ATTENTION,
  });
};
