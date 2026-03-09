-- Pool counts by (category, difficulty): unanswered vs answered.
-- Run in Supabase Dashboard: SQL Editor > New query > paste and run.

SELECT
  category,
  difficulty,
  COUNT(*) FILTER (WHERE used = false) AS unanswered,
  COUNT(*) FILTER (WHERE used = true) AS answered
FROM question_pool
GROUP BY category, difficulty
ORDER BY unanswered, category, difficulty;
