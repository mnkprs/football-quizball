-- List all raw questions from question_pool with category, difficulty, and answer.
-- The question column stores the full JSON; we extract question_text and correct_answer.

SELECT
  qp.id,
  qp.category,
  qp.difficulty,
  qp.question->>'question_text' AS question_text,
  qp.question->>'correct_answer' AS answer
FROM question_pool qp
ORDER BY qp.category, qp.difficulty, qp.id;
