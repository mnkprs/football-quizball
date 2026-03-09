-- List all blitz questions from blitz_question_pool.
-- Run in Supabase Dashboard: SQL Editor > New query > paste and run.
-- Note: blitz_question_pool has difficulty_score (1-100), not difficulty. "used" = drawn by a Blitz session.

SELECT
  qp.category,
  qp.difficulty_score,
  qp.question->>'question_text' AS question_text,
  qp.question->>'correct_answer' AS answer,
  qp.created_at,
  qp.id
FROM blitz_question_pool qp
ORDER BY qp.created_at DESC, qp.category, qp.difficulty_score, qp.id;
