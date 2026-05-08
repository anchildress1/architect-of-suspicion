-- Pass 4 rewrite cache. The seed pipeline checks this before each Pass 4
-- batch — exact matches return persisted output and skip the LLM call.
-- input_hash combines card content + claim text + prompt version + model id,
-- so any change to inputs (or the prompt itself) invalidates the entry.

create schema if not exists suspicion;

create table suspicion.pass4_cache (
  input_hash text primary key,
  -- Denormalized inputs for debugging cache contents directly via SQL.
  -- These are not part of the lookup key but make `select * from
  -- pass4_cache where claim_text like '%foo%'` easy when iterating.
  card_id text not null,
  claim_text text not null,
  prompt_version text not null,
  model_id text not null,
  -- The cached output. Mirrors CardArgument shape minus isParamount, which
  -- is set after Pass 4 completes (paramount selection runs across the full
  -- pool, not per-card).
  rewritten_blurb text not null,
  ai_score numeric not null check (ai_score >= -1 and ai_score <= 1),
  notes text not null,
  created_at timestamptz not null default now()
);

comment on table suspicion.pass4_cache is
  'Pass 4 rewrite cache. Service-role-only — seed pipeline reads/writes; client never sees this. RLS enabled with no policies = no anonymous access.';

create index pass4_cache_card_idx on suspicion.pass4_cache (card_id);
create index pass4_cache_created_idx on suspicion.pass4_cache (created_at desc);

alter table suspicion.pass4_cache enable row level security;

-- service_role bypasses RLS but still needs explicit table privileges in
-- the suspicion schema (the schema's default grants don't propagate to new
-- tables). The seed pipeline authenticates with SUPABASE_SECRET_KEY which
-- maps to service_role; without these grants every cache lookup logs
-- "permission denied for table pass4_cache" and falls through.
grant select, insert, update, delete on suspicion.pass4_cache to service_role;
