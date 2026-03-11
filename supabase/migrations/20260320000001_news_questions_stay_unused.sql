-- NEWS questions are recycled across games — never mark them as used.
-- Exclusion of recently seen NEWS is handled client-side via p_exclude_ids.

-- Reset any NEWS questions incorrectly marked used
UPDATE question_pool SET used = false, used_at = NULL WHERE category = 'NEWS';

-- Update draw_questions: only mark non-NEWS questions as used
DROP FUNCTION IF EXISTS draw_questions(text, text, int);
DROP FUNCTION IF EXISTS draw_questions(text, text, int, text[]);

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
    SET used = true, used_at = now()
    FROM drawn d
    WHERE qp.id = d.id
      AND qp.category != 'NEWS'
  )
  SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations FROM drawn d;
END;
$$;
