-- Search for a substring anywhere inside the question JSONB column.
-- Run in Supabase Dashboard: SQL Editor > New query > paste and run.
-- Replace 'YOUR_SUBSTRING' below with the text you want to find (case-insensitive).
--
-- The search covers: question (all keys: question_text, correct_answer, wrong_choices, etc.)
-- and translations (e.g. el.question_text).

WITH search AS (
  SELECT '%YOUR_SUBSTRING%' AS pattern
)
(
  SELECT
    'question_pool' AS source,
    qp.id::text,
    qp.category,
    qp.difficulty::text AS difficulty_or_score,
    qp.question->>'question_text' AS question_text,
    qp.question->>'correct_answer' AS answer,
    qp.created_at,
    qp.used
  FROM question_pool qp, search
  WHERE qp.question::text ILIKE search.pattern
     OR COALESCE(qp.translations::text, '') ILIKE search.pattern
)
UNION ALL
(
  SELECT
    'blitz_question_pool' AS source,
    bqp.id::text,
    bqp.category,
    bqp.difficulty_score::text AS difficulty_or_score,
    bqp.question->>'question_text' AS question_text,
    bqp.question->>'correct_answer' AS answer,
    bqp.created_at,
    bqp.used
  FROM blitz_question_pool bqp, search
  WHERE bqp.question::text ILIKE search.pattern
     OR COALESCE(bqp.translations::text, '') ILIKE search.pattern
)
ORDER BY created_at DESC;
