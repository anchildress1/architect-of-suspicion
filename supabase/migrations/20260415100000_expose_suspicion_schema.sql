-- Expose the suspicion schema to PostgREST so the Supabase JS client
-- can reach it via .schema('suspicion'). Without this, all queries
-- against suspicion.sessions and suspicion.picks fail silently.
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, suspicion';
NOTIFY pgrst, 'reload schema';
