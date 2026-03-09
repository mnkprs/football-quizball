-- Add optional p_exclude_ids to draw_questions for excluding recently seen NEWS questions.
-- When provided (e.g. from client localStorage), rows with question->>'id' in the list are skipped.

DROP FUNCTION IF EXISTS draw_questions(text, text, int);

CREATE OR REPLACE FUNCTION draw_questions(
  p_category text,
  p_difficulty text,
  p_count int DEFAULT 1,
  p_exclude_ids text[] DEFAULT NULL
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
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0 OR (qp.question->>'id') IS NULL OR NOT ((qp.question->>'id') = ANY(p_exclude_ids)))
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
