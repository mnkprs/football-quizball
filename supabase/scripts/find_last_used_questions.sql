-- Find the last used question from both question_pool and blitz_question_pool.
-- question_pool: uses used_at when available, else created_at as fallback.
-- blitz_question_pool: no used_at, so we order by created_at DESC.
-- Run in Supabase Dashboard: SQL Editor > New query > paste and run.

(
  SELECT
    'question_pool' AS source,
    qp.id,
    qp.category,
    qp.difficulty::text AS difficulty_or_score,
    qp.question->>'question_text' AS question_text,
    qp.question->>'correct_answer' AS answer,
    COALESCE(qp.used_at, qp.created_at) AS last_used_at,
    qp.used
  FROM question_pool qp
  WHERE qp.used = true
  ORDER BY COALESCE(qp.used_at, qp.created_at) DESC
  LIMIT 1
)
UNION ALL
(
  SELECT
    'blitz_question_pool' AS source,
    bqp.id,
    bqp.category,
    bqp.difficulty_score::text AS difficulty_or_score,
    bqp.question->>'question_text' AS question_text,
    bqp.question->>'correct_answer' AS answer,
    bqp.created_at AS last_used_at,
    bqp.used
  FROM blitz_question_pool bqp
  WHERE bqp.used = true
  ORDER BY bqp.created_at DESC
  LIMIT 1
);
