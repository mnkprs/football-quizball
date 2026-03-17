-- Fix cleanup_question_pool to handle GUESS_SCORE score deduplication.
-- Normalizes "7-1" and "1-7" as the same match by sorting the two score parts,
-- so Germany-Brazil 2014 stored as either orientation is caught as a duplicate.
CREATE OR REPLACE FUNCTION cleanup_question_pool()
RETURNS TABLE(deleted_invalid bigint, deleted_duplicates bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_invalid bigint := 0;
  v_dupes bigint := 0;
BEGIN
  -- Remove invalid questions (missing required fields)
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

  -- Deduplicate by normalized answer (excluding HIGHER_OR_LOWER which has binary answers)
  WITH normalized AS (
    SELECT
      id,
      category,
      difficulty,
      CASE
        -- For GUESS_SCORE: normalize "7-1" and "1-7" to the same key by sorting scores
        WHEN category = 'GUESS_SCORE' THEN
          LEAST(
            split_part(lower(trim(question->>'correct_answer')), '-', 1),
            split_part(lower(trim(question->>'correct_answer')), '-', 2)
          ) || '-' ||
          GREATEST(
            split_part(lower(trim(question->>'correct_answer')), '-', 1),
            split_part(lower(trim(question->>'correct_answer')), '-', 2)
          )
        ELSE lower(trim(question->>'correct_answer'))
      END AS norm_answer
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

-- Run cleanup immediately to purge existing duplicates
SELECT * FROM cleanup_question_pool();
