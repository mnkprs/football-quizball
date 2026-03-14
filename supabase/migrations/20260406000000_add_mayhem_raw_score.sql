-- Add raw_score to mayhem_questions for difficulty tracking (mirrors question_pool.raw_score pattern)
ALTER TABLE mayhem_questions
  ADD COLUMN IF NOT EXISTS raw_score double precision;

COMMENT ON COLUMN mayhem_questions.raw_score IS 'Raw difficulty score from DifficultyScorer. Backfilled from hardcoded MAYHEM factors: fame=2, specificity=9, combinational=8, competition=World Football (tier 3).';

-- Backfill existing rows.
-- MAYHEM difficulty_factors are hardcoded in MayhemQuestionGenerator:
--   event_year = current year (age ≤ 2 → dateScore = 0.05)
--   competition = 'World Football' → tier 3 (default)
--   fame_score = 2, specificity_score = 10, combinational_thinking_score = 10
--   answer_type = 'mixed' (modifier = 0), category = 'MAYHEM'
-- Formula:
--   raw = 0.06 + 0.15*0.05 + 0.35*0.5 + 0.30*(8/9) + (9/9)*0.12 + (9/9)*0.10 + 0 + 0.15 + 0
--       = 0.06 + 0.0075 + 0.175 + 0.2667 + 0.12 + 0.10 + 0.15 = 0.879
UPDATE mayhem_questions
SET raw_score = 0.879
WHERE raw_score IS NULL;
