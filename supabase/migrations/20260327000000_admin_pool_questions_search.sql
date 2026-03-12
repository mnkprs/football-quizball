-- RPC for admin pool questions by raw_score range with optional search.
-- Search matches question_text or correct_answer (case-insensitive).

CREATE OR REPLACE FUNCTION get_admin_pool_questions(
  p_min_raw double precision,
  p_max_raw double precision,
  p_search text DEFAULT NULL,
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
