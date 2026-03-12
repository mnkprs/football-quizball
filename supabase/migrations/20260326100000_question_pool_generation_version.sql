-- Add generation_version to question_pool to track which version of the generating logic produced each question.
-- Semantic version (e.g. 1.0.0) — bump when difficulty scoring, diversity, or prompt logic changes.

ALTER TABLE question_pool
  ADD COLUMN IF NOT EXISTS generation_version text;

COMMENT ON COLUMN question_pool.generation_version IS 'Semantic version of the question generating logic (difficulty scorer, diversity, prompts). Null for legacy/pre-versioning questions.';

CREATE INDEX IF NOT EXISTS idx_question_pool_generation_version ON question_pool (generation_version) WHERE generation_version IS NOT NULL;
