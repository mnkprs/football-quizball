-- Fix question_pool rows with used IS NULL so they match draw_questions (WHERE used = false).
-- Rows inserted without explicit used=false may have NULL, which does not match used=false in SQL.

UPDATE question_pool
SET used = false
WHERE used IS NULL;
