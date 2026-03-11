-- Find questions that share the same correct_answer within each (category, difficulty).
-- Normalized: lower(trim()) to catch "Neymar" vs "Neymar " vs "neymar".
-- Excludes HIGHER_OR_LOWER and GUESS_SCORE: same answer is expected there (higher/lower,
-- or score X-Y), so grouping by answer would falsely flag distinct questions as duplicates.

WITH normalized AS (
  SELECT
    id,
    category,
    difficulty,
    question->>'question_text' AS question_text,
    question->>'correct_answer' AS correct_answer,
    lower(trim(question->>'correct_answer')) AS norm_answer
  FROM question_pool
  WHERE category NOT IN ('HIGHER_OR_LOWER', 'GUESS_SCORE')
),
grouped AS (
  SELECT
    category,
    difficulty,
    norm_answer,
    COUNT(*) AS cnt,
    array_agg(id ORDER BY id) AS ids,
    array_agg(question_text ORDER BY id) AS questions
  FROM normalized
  GROUP BY category, difficulty, norm_answer
  HAVING COUNT(*) > 1
)
SELECT
  category,
  difficulty,
  norm_answer AS answer,
  cnt AS duplicate_count,
  ids,
  questions
FROM grouped
ORDER BY cnt DESC, category, difficulty;
