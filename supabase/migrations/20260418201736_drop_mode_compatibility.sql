-- Drop question_pool.mode_compatibility column + its GIN index.
--
-- Context: introduced in 20260612000000_question_pool_taxonomy as an optional
-- classifier-populated column describing which game modes a question is safe
-- to draw for. In practice the prompt told the LLM the field was optional and
-- "empty is fine", so the classifier returned [] on ~99.9% of rows, and the
-- pool-seed writer coerced [] to NULL. Verified 1091/1092 rows NULL since the
-- taxonomy classifier deployed on 2026-04-16.
--
-- No read path depends on this column (no RPCs, views, analytics, frontend).
-- Product decision (2026-04-18): the taxonomy exists for user stats/analytics
-- ("top X% on UCL questions"), not mode routing. mode_compatibility is not
-- needed for that use case, so we remove it rather than fix the prompt.

ALTER TABLE question_pool DROP COLUMN IF EXISTS mode_compatibility;

-- The GIN index drops automatically with the column, but belt + braces.
DROP INDEX IF EXISTS idx_question_pool_mode_compat;
