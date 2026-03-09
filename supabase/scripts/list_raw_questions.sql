-- List all raw questions from question_pool with category, difficulty, and answer.
-- Run in Supabase Dashboard: SQL Editor > New query > paste and run.
-- The question column stores the full JSON; we extract question_text and correct_answer.

SELECT
  qp.category,
  qp.difficulty,
  qp.question->>'question_text' AS question_text,
  qp.question->>'correct_answer' AS answer,
  qp.created_at,
  qp.used,
  qp.id
FROM question_pool qp
ORDER BY qp.created_at DESC, qp.category, qp.difficulty, qp.id;
