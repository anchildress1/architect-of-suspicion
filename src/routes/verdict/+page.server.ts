import type { PageServerLoad } from './$types';
import { error as httpError, isHttpError } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/supabase';
import { loadSessionCapability } from '$lib/server/sessionCapability';

export const load: PageServerLoad = async ({ cookies }) => {
  let sessionId: string;
  try {
    const session = await loadSessionCapability(cookies);
    sessionId = session.sessionId;
  } catch (err) {
    // 401 = auth failure (missing/invalid session) — expected, render empty verdict page.
    // Anything else (500, unexpected error) is an infrastructure failure — surface it.
    if (isHttpError(err) && err.status === 401) {
      return { session: null };
    }
    throw err;
  }

  const supabase = getSupabase();
  const { data, error: dbError } = await supabase
    .schema('suspicion')
    .from('sessions')
    .select('claim_text, verdict, cover_letter, architect_closing')
    .eq('session_id', sessionId)
    .single();

  if (dbError) {
    console.error('[verdict] session lookup failed:', dbError.message);
    httpError(500, 'Failed to load verdict');
  }

  if (!data?.cover_letter) return { session: null };

  return {
    session: {
      cover_letter: data.cover_letter as string,
      architect_closing: (data.architect_closing ?? null) as string | null,
      claim: data.claim_text as string,
      verdict: data.verdict as string,
    },
  };
};
