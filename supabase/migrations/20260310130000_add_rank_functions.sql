-- Solo rank: 1-based position by ELO (1 = highest)
CREATE OR REPLACE FUNCTION get_solo_rank(p_user_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::int + 1
  FROM profiles
  WHERE elo > (SELECT elo FROM profiles WHERE id = p_user_id LIMIT 1);
$$;

-- Blitz rank: 1-based position by best score (1 = highest)
CREATE OR REPLACE FUNCTION get_blitz_rank(p_user_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH user_best AS (
    SELECT user_id, MAX(score) AS best FROM blitz_scores GROUP BY user_id
  ),
  my_best AS (
    SELECT best FROM user_best WHERE user_id = p_user_id LIMIT 1
  )
  SELECT COUNT(*)::int + 1
  FROM user_best
  WHERE best > (SELECT best FROM my_best);
$$;
