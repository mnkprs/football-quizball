-- Remove duplicate questions that share the same correct_answer.
-- The previous migration (20260309400000) only removed exact (question_text, correct_answer) dupes.
-- This one keeps one row per (category, difficulty, normalized correct_answer).
-- Normalization: lower(trim()) to catch "Neymar" vs "Neymar " vs "neymar".

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
