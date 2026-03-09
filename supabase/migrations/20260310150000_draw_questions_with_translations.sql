-- Create draw_questions RPC for question_pool (used by board game).
-- Returns id, category, difficulty, question, translations.
-- Marks drawn rows as used=true atomically.

DROP FUNCTION IF EXISTS draw_questions(text, text, int);

CREATE OR REPLACE FUNCTION draw_questions(
  p_category text,
  p_difficulty text,
  p_count int DEFAULT 1
)
RETURNS TABLE (
  id uuid,
  category text,
  difficulty text,
  question jsonb,
  translations jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH drawn AS (
    SELECT qp.id, qp.category, qp.difficulty, qp.question, COALESCE(qp.translations, '{}'::jsonb) AS translations
    FROM question_pool qp
    WHERE qp.used = false
      AND qp.category = p_category
      AND qp.difficulty = p_difficulty
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
  SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations FROM drawn d;
END;
$$;
