-- Phase 1 of question_pool schema cleanup: additive only.
-- Adds play-stats counters and promotes 4 jsonb fields to top-level columns.
-- Zero-risk: no jsonb strip, no RPC changes, no reader migration. Existing
-- readers that probe `question->>'source_url'` etc. keep working; the new
-- top-level columns are available for downstream PRs.
--
-- Why counters alongside `used` (rather than replacing it): `used` is not a
-- monotonic "has this ever been shown" flag in this codebase. Every draw RPC
-- contains auto-reset logic that flips `used=false` when a (category, difficulty)
-- slot drains — so the column serves as a recycling eligibility cursor, not a
-- historical signal. The new counters give us the monotonic history we need
-- for staleness detection and difficulty self-calibration, without disturbing
-- the draw-cursor semantics the RPCs depend on.

ALTER TABLE question_pool
  ADD COLUMN IF NOT EXISTS times_shown        INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_correct      INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_timed_out    INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_wrong        INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_response_ms  BIGINT      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_shown_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS specificity_score  SMALLINT,
  ADD COLUMN IF NOT EXISTS combo_score        SMALLINT,
  ADD COLUMN IF NOT EXISTS source_url         TEXT,
  ADD COLUMN IF NOT EXISTS image_url          TEXT;

COMMENT ON COLUMN question_pool.times_shown       IS 'Monotonic count of draws. Unlike `used` (recycled by draw RPCs on slot drain), this only increments. Wired into draw RPCs in a follow-up PR.';
COMMENT ON COLUMN question_pool.times_correct     IS 'Number of correct answers. Populated by record_answer_outcome RPC (follow-up PR).';
COMMENT ON COLUMN question_pool.times_timed_out   IS 'Number of timer-runs-out events with no submission.';
COMMENT ON COLUMN question_pool.times_wrong       IS 'Number of wrong answers (excluding timeouts).';
COMMENT ON COLUMN question_pool.total_response_ms IS 'Sum of response times in ms. Divide by (times_correct + times_wrong) for average.';
COMMENT ON COLUMN question_pool.last_shown_at     IS 'Most recent draw timestamp. Unlike used_at (reset to NULL when pool recycles), this is monotonic.';
COMMENT ON COLUMN question_pool.specificity_score IS 'Promoted from question.difficulty_factors.specificity_score (1-10). Drives difficulty scoring.';
COMMENT ON COLUMN question_pool.combo_score       IS 'Promoted from question.difficulty_factors.combinational_thinking_score (1-10).';
COMMENT ON COLUMN question_pool.source_url        IS 'Promoted from question.source_url. Citation URL for fact verification.';
COMMENT ON COLUMN question_pool.image_url         IS 'Promoted from question.image_url. Optional image (used by LOGO_QUIZ and visual categories).';

-- Backfill: seed counters + last_shown_at from the existing used/used_at state.
-- `times_shown = 1` for rows currently marked used is a conservative prior; the
-- true value may be higher (pool recycling resets `used=false` periodically) but
-- we have no way to recover the exact count. Future draws increment from here.
UPDATE question_pool
SET
  times_shown   = CASE WHEN used THEN 1 ELSE 0 END,
  last_shown_at = used_at
WHERE times_shown = 0;

-- Backfill promoted columns from jsonb. NULLIF guards against empty strings
-- that would otherwise blow up the ::smallint cast.
UPDATE question_pool
SET specificity_score = NULLIF(question->'difficulty_factors'->>'specificity_score', '')::smallint
WHERE specificity_score IS NULL
  AND question ? 'difficulty_factors'
  AND question->'difficulty_factors' ? 'specificity_score';

UPDATE question_pool
SET combo_score = NULLIF(question->'difficulty_factors'->>'combinational_thinking_score', '')::smallint
WHERE combo_score IS NULL
  AND question ? 'difficulty_factors'
  AND question->'difficulty_factors' ? 'combinational_thinking_score';

UPDATE question_pool
SET source_url = NULLIF(question->>'source_url', '')
WHERE source_url IS NULL
  AND question ? 'source_url';

UPDATE question_pool
SET image_url = NULLIF(question->>'image_url', '')
WHERE image_url IS NULL
  AND question ? 'image_url';

-- Partial index for future "oldest-drawn first" draw heuristics.
-- NULLs (never-drawn rows) are excluded — those are the newest questions and
-- already favored by existing draw logic via `used = false`.
CREATE INDEX IF NOT EXISTS idx_question_pool_last_shown_at
  ON question_pool (last_shown_at)
  WHERE last_shown_at IS NOT NULL;
