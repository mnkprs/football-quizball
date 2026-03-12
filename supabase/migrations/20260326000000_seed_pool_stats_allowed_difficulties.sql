-- Add drawable capacity (allowed_difficulties) to pool stats.
-- drawable_unanswered/answered = questions that can fill this slot via allowed_difficulties.
-- primary (unanswered/answered) = questions with stored difficulty = slot (unchanged).

DROP FUNCTION IF EXISTS get_seed_pool_stats();

CREATE FUNCTION get_seed_pool_stats()
RETURNS TABLE (
  category text,
  difficulty text,
  unanswered bigint,
  answered bigint,
  drawable_unanswered bigint,
  drawable_answered bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH slot_defs AS (
    SELECT DISTINCT cat, diff FROM (VALUES
      ('HISTORY'::text, 'EASY'::text),
      ('HISTORY', 'MEDIUM'),
      ('HISTORY', 'HARD'),
      ('PLAYER_ID', 'MEDIUM'),
      ('HIGHER_OR_LOWER', 'MEDIUM'),
      ('GUESS_SCORE', 'EASY'),
      ('GUESS_SCORE', 'MEDIUM'),
      ('GUESS_SCORE', 'HARD'),
      ('TOP_5', 'HARD'),
      ('GEOGRAPHY', 'EASY'),
      ('GEOGRAPHY', 'MEDIUM'),
      ('GEOGRAPHY', 'HARD'),
      ('GOSSIP', 'MEDIUM'),
      ('NEWS', 'MEDIUM')
    ) AS t(cat, diff)
  ),
  primary_stats AS (
    SELECT
      qp.category,
      qp.difficulty,
      COUNT(*) FILTER (WHERE qp.used = false) AS unanswered,
      COUNT(*) FILTER (WHERE qp.used = true) AS answered
    FROM question_pool qp
    GROUP BY qp.category, qp.difficulty
  ),
  drawable_stats AS (
    SELECT
      qp.category,
      s.diff AS difficulty,
      COUNT(*) FILTER (WHERE qp.used = false) AS drawable_unanswered,
      COUNT(*) FILTER (WHERE qp.used = true) AS drawable_answered
    FROM question_pool qp
    CROSS JOIN LATERAL unnest(COALESCE(qp.allowed_difficulties, ARRAY[qp.difficulty])) AS slot_difficulty
    JOIN slot_defs s ON s.cat = qp.category AND s.diff = slot_difficulty
    GROUP BY qp.category, s.diff
  )
  SELECT
    s.cat::text AS category,
    s.diff::text AS difficulty,
    COALESCE(p.unanswered, 0)::bigint AS unanswered,
    COALESCE(p.answered, 0)::bigint AS answered,
    COALESCE(d.drawable_unanswered, 0)::bigint AS drawable_unanswered,
    COALESCE(d.drawable_answered, 0)::bigint AS drawable_answered
  FROM slot_defs s
  LEFT JOIN primary_stats p ON p.category = s.cat AND p.difficulty = s.diff
  LEFT JOIN drawable_stats d ON d.category = s.cat AND d.difficulty = s.diff
  ORDER BY s.cat, s.diff;
END;
$$ LANGUAGE plpgsql;
