import type { PageServerLoad } from './$types';
import { getSupabase } from '$lib/server/supabase';
import { loadSessionCapability } from '$lib/server/sessionCapability';

export const load: PageServerLoad = async ({ cookies }) => {
  let sessionId: string;
  try {
    const session = await loadSessionCapability(cookies);
    sessionId = session.sessionId;
  } catch {
    return { session: null };
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .schema('suspicion')
    .from('sessions')
    .select('claim_text, verdict, cover_letter, architect_closing')
    .eq('session_id', sessionId)
    .single();

  if (error) {
    console.error('[verdict] session lookup failed:', error.message);
    return { session: null };
  }

  if (!data?.cover_letter) return { session: null };

  return {
    session: {
      cover_letter: data.cover_letter as string,
      architect_closing: data.architect_closing as string,
      claim: data.claim_text as string,
      verdict: data.verdict as string,
    },
  };
};
