import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabase } from '$lib/server/supabase';
import { getClaimById } from '$lib/server/claims';

interface CreateSessionRequest {
  claim_id?: string;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, 'Invalid JSON body');
  }

  const { claim_id } = body as CreateSessionRequest;
  if (!claim_id || typeof claim_id !== 'string') {
    error(400, 'Missing or invalid claim_id');
  }

  const { claim, error: claimErr } = await getClaimById(claim_id);
  if (claimErr || !claim) {
    error(404, claimErr ?? 'Claim not found');
  }

  const { data, error: dbError } = await getSupabase()
    .schema('suspicion')
    .from('sessions')
    .insert({ claim_id: claim.id, claim_text: claim.text })
    .select('session_id')
    .single();

  if (dbError || !data?.session_id) {
    error(500, 'Failed to create session');
  }

  return json({ session_id: data.session_id, claim_id: claim.id, claim_text: claim.text });
};
