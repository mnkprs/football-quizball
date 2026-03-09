-- Find duplicate questions in question_pool and blitz_question_pool.
-- Run in Supabase Dashboard: SQL Editor > New query > paste and run.
-- Or: psql $DATABASE_URL -f supabase/scripts/find_duplicate_questions.sql

-- ========== question_pool ==========
WITH normalized AS (
  SELECT
    id,
    category,
    difficulty,
    trim(question->>'question_text') AS question_text,
    trim(question->>'correct_answer') AS correct_answer,
    lower(trim(question->>'question_text')) || '|||' || lower(trim(question->>'correct_answer')) AS key
  FROM question_pool
),
grouped AS (
  SELECT key, category, difficulty, COUNT(*) AS cnt, array_agg(id ORDER BY id) AS ids
  FROM normalized
  GROUP BY key, category, difficulty
  HAVING COUNT(*) > 1
)
SELECT category, difficulty, cnt AS duplicate_count, ids
FROM grouped
ORDER BY cnt DESC;

-- ========== blitz_question_pool ==========
WITH normalized AS (
  SELECT
    id,
    category,
    difficulty_score,
    trim(question->>'question_text') AS question_text,
    trim(question->>'correct_answer') AS correct_answer,
    lower(trim(question->>'question_text')) || '|||' || lower(trim(question->>'correct_answer')) AS key
  FROM blitz_question_pool
),
grouped AS (
  SELECT key, category, difficulty_score, COUNT(*) AS cnt, array_agg(id ORDER BY id) AS ids
  FROM normalized
  GROUP BY key, category, difficulty_score
  HAVING COUNT(*) > 1
)
SELECT category, difficulty_score, cnt AS duplicate_count, ids
FROM grouped
ORDER BY cnt DESC;
