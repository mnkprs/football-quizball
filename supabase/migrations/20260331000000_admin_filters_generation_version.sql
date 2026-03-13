-- Add optional generation_version filter to get_seed_pool_stats and get_admin_pool_questions.
-- When p_generation_version is provided: filter to that version (use 'legacy' for NULL).

-- get_seed_pool_stats: add optional p_generation_version param
DROP FUNCTION IF EXISTS get_seed_pool_stats();

CREATE FUNCTION get_seed_pool_stats(p_generation_version text DEFAULT NULL)
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
  WITH pool_filtered AS (
    SELECT qp.*
    FROM question_pool qp
    WHERE (p_generation_version IS NULL OR p_generation_version = '')
       OR (p_generation_version = 'legacy' AND qp.generation_version IS NULL)
       OR (p_generation_version IS NOT NULL AND p_generation_version != '' AND p_generation_version != 'legacy' AND qp.generation_version = p_generation_version)
  ),
  slot_defs AS (
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
    FROM pool_filtered qp
    GROUP BY qp.category, qp.difficulty
  ),
  drawable_stats AS (
    SELECT
      qp.category,
      s.diff AS difficulty,
      COUNT(*) FILTER (WHERE qp.used = false) AS drawable_unanswered,
      COUNT(*) FILTER (WHERE qp.used = true) AS drawable_answered
    FROM pool_filtered qp
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
$$ LANGUAGE plpgsql STABLE;

-- get_admin_pool_questions: add p_generation_version param
CREATE OR REPLACE FUNCTION get_admin_pool_questions(
  p_min_raw double precision,
  p_max_raw double precision,
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_generation_version text DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  category text,
  difficulty text,
  raw_score double precision,
  question_text text,
  correct_answer text,
  total_count bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT
      qp.id,
      qp.category,
      qp.difficulty,
      qp.raw_score,
      qp.question->>'question_text' AS q_text,
      qp.question->>'correct_answer' AS q_answer
    FROM question_pool qp
    WHERE qp.raw_score >= p_min_raw
      AND qp.raw_score < p_max_raw
      AND (p_category IS NULL OR p_category = '' OR qp.category = p_category)
      AND (p_difficulty IS NULL OR p_difficulty = '' OR qp.difficulty = p_difficulty)
      AND (
        p_generation_version IS NULL
        OR p_generation_version = ''
        OR (p_generation_version = 'legacy' AND qp.generation_version IS NULL)
        OR (qp.generation_version = p_generation_version)
      )
      AND (
        p_search IS NULL
        OR p_search = ''
        OR (
          (qp.question->>'question_text') ILIKE '%' || p_search || '%'
          OR (qp.question->>'correct_answer') ILIKE '%' || p_search || '%'
        )
      )
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS cnt FROM filtered
  )
  SELECT
    f.id,
    f.category,
    f.difficulty,
    f.raw_score,
    f.q_text,
    f.q_answer,
    c.cnt
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.raw_score ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;
