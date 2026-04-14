import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabase } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, 'Invalid JSON body');
  }

  const { claim } = body as { claim?: string };
  if (!claim || typeof claim !== 'string' || claim.trim().length === 0) {
    error(400, 'Missing or invalid claim');
  }

  const { data, error: dbError } = await getSupabase()
    .from('sessions')
    .insert({ claim_text: claim.trim() })
    .select('session_id')
    .single();

  if (dbError) {
    error(500, 'Failed to create session');
  }

  return json({ session_id: data.session_id });
};
