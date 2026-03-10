-- Pool counts for ALL expected slots (including TOP_5 and slots with zero).
-- Run in Supabase Dashboard: SQL Editor > New query > paste and run.
-- Matches DRAW_REQUIREMENTS in question-pool.service.ts.

WITH expected_slots (category, difficulty) AS (
  VALUES
    ('HISTORY', 'EASY'), ('HISTORY', 'MEDIUM'), ('HISTORY', 'HARD'),
    ('PLAYER_ID', 'EASY'), ('PLAYER_ID', 'MEDIUM'), ('PLAYER_ID', 'HARD'),
    ('HIGHER_OR_LOWER', 'EASY'), ('HIGHER_OR_LOWER', 'MEDIUM'), ('HIGHER_OR_LOWER', 'HARD'),
    ('GUESS_SCORE', 'EASY'), ('GUESS_SCORE', 'MEDIUM'), ('GUESS_SCORE', 'HARD'),
    ('TOP_5', 'HARD'),
    ('GEOGRAPHY', 'EASY'), ('GEOGRAPHY', 'MEDIUM'), ('GEOGRAPHY', 'HARD'),
    ('GOSSIP', 'MEDIUM'),
    ('NEWS', 'MEDIUM')
)
SELECT
  e.category,
  e.difficulty,
  COUNT(qp.id) FILTER (WHERE qp.used = false) AS unanswered,
  COUNT(qp.id) FILTER (WHERE qp.used = true) AS answered
FROM expected_slots e
LEFT JOIN question_pool qp ON qp.category::text = e.category AND qp.difficulty::text = e.difficulty
GROUP BY e.category, e.difficulty
ORDER BY e.category, e.difficulty;
