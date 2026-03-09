-- Remove duplicate questions from blitz_question_pool.
-- Keeps one row per unique (category, normalized correct_answer).

CREATE OR REPLACE FUNCTION cleanup_blitz_question_pool()
RETURNS TABLE(deleted_invalid bigint, deleted_duplicates bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_invalid bigint := 0;
  v_dupes bigint := 0;
BEGIN
  -- Delete invalid (empty text/answer)
  WITH invalid AS (
    DELETE FROM blitz_question_pool
    WHERE
      (question->>'question_text') IS NULL
      OR trim(question->>'question_text') = ''
      OR (question->>'correct_answer') IS NULL
      OR trim(question->>'correct_answer') = ''
    RETURNING id
  )
  SELECT COUNT(*)::bigint INTO v_invalid FROM invalid;

  -- Delete duplicates (keep one per category, normalized answer)
  WITH normalized AS (
    SELECT id, category, lower(trim(question->>'correct_answer')) AS norm_answer
    FROM blitz_question_pool
  ),
  dup_ids AS (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY category, norm_answer ORDER BY id
      ) AS rn
      FROM normalized
    ) t WHERE rn > 1
  ),
  deleted AS (
    DELETE FROM blitz_question_pool WHERE id IN (SELECT id FROM dup_ids) RETURNING id
  )
  SELECT COUNT(*)::bigint INTO v_dupes FROM deleted;

  deleted_invalid := v_invalid;
  deleted_duplicates := v_dupes;
  RETURN NEXT;
END;
$$;
