-- Remove dummy_users (bots) from all leaderboard and rank functions.
-- Bots should only exist in dummy_users table, never appear in user-facing rankings.

-- ── Blitz leaderboard: profiles only ──────────────────────────────────────────
DROP FUNCTION IF EXISTS get_blitz_leaderboard(int);

CREATE OR REPLACE FUNCTION get_blitz_leaderboard(p_limit int DEFAULT 10)
RETURNS TABLE(user_id uuid, username text, score int, total_answered int)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id AS user_id, username, max_blitz_score AS score, max_blitz_total_answered AS total_answered
  FROM profiles
  WHERE max_blitz_score > 0
  ORDER BY max_blitz_score DESC
  LIMIT p_limit;
$$;

-- ── Blitz rank: profiles only ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_blitz_rank(p_user_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::int + 1
  FROM profiles
  WHERE max_blitz_score > COALESCE(
    (SELECT max_blitz_score FROM profiles WHERE id = p_user_id), 0
  );
$$;
