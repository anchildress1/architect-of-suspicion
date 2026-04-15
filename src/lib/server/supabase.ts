import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

let _client: SupabaseClient | null = null;

/** Lazily creates the Supabase client so it doesn't crash builds without env vars. */
export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables');
    }
    _client = createClient(url, key);
  }
  return _client;
}
