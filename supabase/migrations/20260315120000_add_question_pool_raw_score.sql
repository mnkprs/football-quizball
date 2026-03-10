-- Add raw_score to question_pool so we can inspect and backfill
-- the scorer output separately from the stored JSON payload.

ALTER TABLE question_pool
  ADD COLUMN IF NOT EXISTS raw_score double precision;

COMMENT ON COLUMN question_pool.raw_score IS 'Raw difficulty score produced by DifficultyScorer. Null when unavailable for legacy/manual rows.';
