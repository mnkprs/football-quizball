-- Add used_at to question_pool to record when a question was drawn/used.
-- Populated by draw_questions when marking used=true; cleared by return_questions_to_pool.

ALTER TABLE question_pool
  ADD COLUMN IF NOT EXISTS used_at timestamptz;

COMMENT ON COLUMN question_pool.used_at IS 'When the question was drawn for a game. Null when unused or returned to pool.';

-- Update draw_questions to set used_at when drawing
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
  )
  SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations FROM drawn d;
END;
$$;

-- Update return_questions_to_pool to clear used_at when returning
CREATE OR REPLACE FUNCTION return_questions_to_pool(p_question_ids text[])
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE question_pool
  SET used = false, used_at = NULL
  WHERE used = true
    AND (question->>'id') = ANY(p_question_ids);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
