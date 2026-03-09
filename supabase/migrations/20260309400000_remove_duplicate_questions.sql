-- Remove duplicate questions from question_pool.
-- Keeps one row per unique (category, difficulty, question_text, correct_answer).

WITH duplicates AS (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY category, difficulty, question->>'question_text', question->>'correct_answer'
        ORDER BY id
      ) AS rn
    FROM question_pool
  ) t
  WHERE rn > 1
)
DELETE FROM question_pool
WHERE id IN (SELECT id FROM duplicates);
