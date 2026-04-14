-- Drop legacy accusations schema
DROP SCHEMA IF EXISTS accusations CASCADE;

-- Create suspicion schema
CREATE SCHEMA IF NOT EXISTS suspicion;

-- Sessions table: one row per game playthrough
CREATE TABLE suspicion.sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_text text NOT NULL,
  verdict text CHECK (verdict IN ('accuse', 'pardon')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Picks table: one row per card classification
CREATE TABLE suspicion.picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES suspicion.sessions(session_id),
  card_id uuid NOT NULL,
  classification text NOT NULL CHECK (classification IN ('proof', 'objection')),
  ai_score numeric(3,2) NOT NULL CHECK (ai_score >= -1.0 AND ai_score <= 1.0),
  ai_reaction_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE suspicion.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE suspicion.picks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sessions
-- Anon can create sessions
CREATE POLICY "anon_insert_sessions" ON suspicion.sessions
  FOR INSERT TO anon
  WITH CHECK (true);

-- Anon can update only the verdict field (and updated_at)
-- Column-level GRANT below restricts which columns can be written
CREATE POLICY "anon_update_verdict" ON suspicion.sessions
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- RLS Policies for picks
-- Anon can insert picks
CREATE POLICY "anon_insert_picks" ON suspicion.picks
  FOR INSERT TO anon
  WITH CHECK (true);

-- No anon SELECT on picks — reads go through server routes using secret key
-- No DELETE policies — deletions are not allowed from anon

-- Grant usage on suspicion schema to anon and authenticated
GRANT USAGE ON SCHEMA suspicion TO anon, authenticated;
GRANT INSERT ON suspicion.sessions TO anon;
GRANT UPDATE (verdict, updated_at) ON suspicion.sessions TO anon;
GRANT INSERT ON suspicion.picks TO anon;

-- Service role gets full access (used by server-side SvelteKit)
GRANT ALL ON SCHEMA suspicion TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA suspicion TO service_role;
