-- Exclude HIGHER_OR_LOWER from duplicate-by-answer logic.
-- For that category, answer is always "higher" or "lower" — grouping by answer
-- would incorrectly treat distinct questions as duplicates.

CREATE OR REPLACE FUNCTION cleanup_question_pool()
RETURNS TABLE(deleted_invalid bigint, deleted_duplicates bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_invalid bigint := 0;
  v_dupes bigint := 0;
BEGIN
  -- Delete invalid
  WITH invalid AS (
    DELETE FROM question_pool
    WHERE
      (question->>'question_text') IS NULL
      OR trim(question->>'question_text') = ''
      OR (question->>'correct_answer') IS NULL
      OR trim(question->>'correct_answer') = ''
      OR (question->>'id') IS NULL
      OR trim(question->>'id') = ''
    RETURNING id
  )
  SELECT COUNT(*)::bigint INTO v_invalid FROM invalid;

  -- Delete duplicates by (category, difficulty, norm_answer)
  -- Exclude HIGHER_OR_LOWER: answer is always "higher"/"lower", so distinct
  -- questions would wrongly be treated as duplicates.
  WITH normalized AS (
    SELECT id, category, difficulty, lower(trim(question->>'correct_answer')) AS norm_answer
    FROM question_pool
    WHERE category != 'HIGHER_OR_LOWER'
  ),
  dup_ids AS (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY category, difficulty, norm_answer ORDER BY id
      ) AS rn
      FROM normalized
    ) t WHERE rn > 1
  ),
  deleted AS (
    DELETE FROM question_pool WHERE id IN (SELECT id FROM dup_ids) RETURNING id
  )
  SELECT COUNT(*)::bigint INTO v_dupes FROM deleted;

  deleted_invalid := v_invalid;
  deleted_duplicates := v_dupes;
  RETURN NEXT;
END;
$$;
