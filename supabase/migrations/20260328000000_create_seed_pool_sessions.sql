-- Track seed-pool runs: each run stores the question IDs generated and the datetime.
-- Used by admin dashboard to view questions from a specific seed session.

CREATE TABLE IF NOT EXISTS seed_pool_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  question_ids uuid[]      NOT NULL DEFAULT '{}',
  total_added  int         NOT NULL DEFAULT 0,
  target       int         NOT NULL DEFAULT 100
);

COMMENT ON TABLE seed_pool_sessions IS 'Records each seed-pool run with generated question IDs for admin inspection.';
CREATE INDEX IF NOT EXISTS idx_seed_pool_sessions_created_at ON seed_pool_sessions (created_at DESC);

ALTER TABLE seed_pool_sessions ENABLE ROW LEVEL SECURITY;
