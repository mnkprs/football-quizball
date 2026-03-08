-- Function: get_seed_pool_stats
-- Returns unanswered (used=false) and answered (used=true) counts per category and difficulty.
-- Can be invoked via: SELECT * FROM get_seed_pool_stats();

CREATE OR REPLACE FUNCTION get_seed_pool_stats()
RETURNS TABLE (
  category text,
  difficulty text,
  unanswered bigint,
  answered bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    qp.category::text,
    qp.difficulty::text,
    COUNT(*) FILTER (WHERE qp.used = false) AS unanswered,
    COUNT(*) FILTER (WHERE qp.used = true) AS answered
  FROM question_pool qp
  GROUP BY qp.category, qp.difficulty
  ORDER BY qp.category, qp.difficulty;
END;
$$ LANGUAGE plpgsql;
