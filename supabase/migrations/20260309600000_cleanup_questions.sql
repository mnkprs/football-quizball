-- Cleanup question_pool: remove invalid questions and duplicates.
-- Run this periodically or after bulk imports to maintain quality.
--
-- 1. Remove invalid questions (empty text/answer, missing id)
-- 2. Remove duplicates by (category, difficulty, normalized correct_answer)
--
-- Also creates cleanup_question_pool() RPC for on-demand runs.

-- Step 1: Delete invalid questions
DELETE FROM question_pool
WHERE
  (question->>'question_text') IS NULL
  OR trim(question->>'question_text') = ''
  OR (question->>'correct_answer') IS NULL
  OR trim(question->>'correct_answer') = ''
  OR (question->>'id') IS NULL
  OR trim(question->>'id') = '';

-- Step 2: Delete duplicates (keep one per category, difficulty, normalized answer)
WITH normalized AS (
  SELECT
    id,
    category,
    difficulty,
    lower(trim(question->>'correct_answer')) AS norm_answer
  FROM question_pool
),
duplicates AS (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY category, difficulty, norm_answer
        ORDER BY id
      ) AS rn
    FROM normalized
  ) t
  WHERE rn > 1
)
DELETE FROM question_pool
WHERE id IN (SELECT id FROM duplicates);

-- RPC for on-demand cleanup (e.g. POST /api/admin/cleanup-questions)
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

  -- Delete duplicates
  WITH normalized AS (
    SELECT id, category, difficulty, lower(trim(question->>'correct_answer')) AS norm_answer
    FROM question_pool
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
