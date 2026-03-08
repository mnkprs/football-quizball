-- Function: draw_blitz_questions
-- Atomically draws questions from the pool for Blitz mode and marks them as used.
-- Ensures the same questions are not drawn by 2-player mode or another Blitz session.
-- Categories: HISTORY, GEOGRAPHY, GOSSIP. Difficulties: EASY, MEDIUM.

CREATE OR REPLACE FUNCTION draw_blitz_questions(p_count int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  category text,
  difficulty text,
  question jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH drawn AS (
    SELECT qp.id, qp.category, qp.difficulty, qp.question
    FROM question_pool qp
    WHERE qp.used = false
      AND qp.category IN ('HISTORY', 'GEOGRAPHY', 'GOSSIP')
      AND qp.difficulty IN ('EASY', 'MEDIUM')
    ORDER BY random()
    LIMIT p_count
    FOR UPDATE
  ),
  updated AS (
    UPDATE question_pool qp
    SET used = true
    FROM drawn d
    WHERE qp.id = d.id
  )
  SELECT d.id, d.category::text, d.difficulty::text, d.question FROM drawn d;
END;
$$;
