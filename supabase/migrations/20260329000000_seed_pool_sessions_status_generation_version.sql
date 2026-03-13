-- Add status and generation_version to seed_pool_sessions for admin visibility.
-- status: 'completed' | 'cancelled' | 'in_progress' — all runs shown regardless.
-- generation_version: semantic version of question-generating logic at run time.

ALTER TABLE seed_pool_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'cancelled', 'in_progress')),
  ADD COLUMN IF NOT EXISTS generation_version text;

COMMENT ON COLUMN seed_pool_sessions.status IS 'Run outcome: completed, cancelled, or in_progress. All runs shown in admin.';
COMMENT ON COLUMN seed_pool_sessions.generation_version IS 'Semantic version of question-generating logic at run time.';
