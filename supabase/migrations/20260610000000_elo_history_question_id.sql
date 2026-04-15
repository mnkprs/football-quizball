-- Add nullable FK from elo_history to question_pool so analytics can join
-- on question metadata (category, era, league_tier, competition_type, etc).
-- Nullable because legacy rows predate this column; they will bucket as "unknown".

ALTER TABLE elo_history
  ADD COLUMN IF NOT EXISTS question_id UUID REFERENCES question_pool(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_elo_history_question_id ON elo_history(question_id);
CREATE INDEX IF NOT EXISTS idx_elo_history_user_question ON elo_history(user_id, question_id);

COMMENT ON COLUMN elo_history.question_id IS 'Links the rated question back to question_pool for category/era/tier analytics. Null for legacy rows or LLM-fallback questions that never hit the pool.';
