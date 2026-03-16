CREATE OR REPLACE FUNCTION get_mayhem_leaderboard(p_limit int DEFAULT 10)
RETURNS TABLE (user_id uuid, username text, current_elo int, max_elo int, games_played int) AS $$
  SELECT ms.user_id, p.username, ms.current_elo, ms.max_elo, ms.games_played
  FROM user_mode_stats ms
  JOIN profiles p ON p.id = ms.user_id
  WHERE ms.mode = 'mayhem'
  ORDER BY ms.current_elo DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION get_mayhem_rank(p_user_id uuid)
RETURNS int AS $$
  SELECT (COUNT(*) + 1)::int
  FROM user_mode_stats
  WHERE mode = 'mayhem' AND current_elo > (
    SELECT current_elo FROM user_mode_stats WHERE user_id = p_user_id AND mode = 'mayhem'
  );
$$ LANGUAGE sql STABLE;
