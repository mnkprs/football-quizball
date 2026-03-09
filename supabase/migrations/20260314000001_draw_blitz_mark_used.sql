-- Update draw_blitz_questions_v2 to atomically draw and mark questions as used.
-- Ensures the same questions are not drawn by multiple Blitz sessions.

DROP FUNCTION IF EXISTS draw_blitz_questions_v2(int);

CREATE OR REPLACE FUNCTION draw_blitz_questions_v2(p_count int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  category text,
  difficulty_score smallint,
  question jsonb,
  translations jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH drawn AS (
    SELECT bqp.id, bqp.category, bqp.difficulty_score, bqp.question, COALESCE(bqp.translations, '{}'::jsonb) AS translations
    FROM blitz_question_pool bqp
    WHERE bqp.used = false
      AND bqp.category IN ('HISTORY', 'GEOGRAPHY', 'GOSSIP', 'PLAYER_ID')
    ORDER BY random()
    LIMIT p_count
    FOR UPDATE
  ),
  updated AS (
    UPDATE blitz_question_pool bqp
    SET used = true
    FROM drawn d
    WHERE bqp.id = d.id
  )
  SELECT d.id, d.category::text, d.difficulty_score, d.question, d.translations FROM drawn d;
END;
$$;
