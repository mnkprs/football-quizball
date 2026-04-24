-- Logo duel leaderboard: same shape as standard duel RPCs,
-- filtered to game_type = 'logo'.

CREATE OR REPLACE FUNCTION get_logo_duel_leaderboard(p_limit int DEFAULT 10)
RETURNS TABLE(user_id uuid, username text, wins int, losses int, games_played int)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH finished AS (
    SELECT
      CASE WHEN (scores->>'host')::int > (scores->>'guest')::int THEN host_id ELSE guest_id END AS winner_id,
      CASE WHEN (scores->>'host')::int > (scores->>'guest')::int THEN guest_id ELSE host_id END AS loser_id
    FROM duel_games
    WHERE status = 'finished' AND game_type = 'logo' AND scores IS NOT NULL
  ),
  win_counts AS (SELECT winner_id AS uid, COUNT(*)::int AS w FROM finished GROUP BY winner_id),
  loss_counts AS (SELECT loser_id AS uid, COUNT(*)::int AS l FROM finished GROUP BY loser_id),
  combined AS (
    SELECT COALESCE(wc.uid, lc.uid) AS uid,
           COALESCE(wc.w, 0) AS wins,
           COALESCE(lc.l, 0) AS losses
    FROM win_counts wc FULL OUTER JOIN loss_counts lc ON wc.uid = lc.uid
  )
  SELECT c.uid, p.username, c.wins, c.losses, (c.wins + c.losses) AS games_played
  FROM combined c JOIN profiles p ON p.id = c.uid
  WHERE c.wins > 0
  ORDER BY c.wins DESC, c.losses ASC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_logo_duel_rank(p_user_id uuid)
RETURNS int LANGUAGE sql SECURITY DEFINER AS $$
  WITH win_counts AS (
    SELECT CASE WHEN (scores->>'host')::int > (scores->>'guest')::int THEN host_id ELSE guest_id END AS winner_id
    FROM duel_games
    WHERE status = 'finished' AND game_type = 'logo' AND scores IS NOT NULL
  ),
  per_user AS (SELECT winner_id, COUNT(*)::int AS wins FROM win_counts GROUP BY winner_id)
  SELECT (COUNT(*)::int + 1) FROM per_user
  WHERE wins > COALESCE((SELECT wins FROM per_user WHERE winner_id = p_user_id), 0);
$$;

CREATE OR REPLACE FUNCTION get_logo_duel_user_stats(p_user_id uuid)
RETURNS TABLE(wins int, losses int, games_played int)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH finished AS (
    SELECT CASE WHEN (scores->>'host')::int > (scores->>'guest')::int THEN host_id ELSE guest_id END AS winner_id
    FROM duel_games
    WHERE status = 'finished' AND game_type = 'logo' AND scores IS NOT NULL
      AND (host_id = p_user_id OR guest_id = p_user_id)
  )
  SELECT
    COUNT(*) FILTER (WHERE winner_id = p_user_id)::int AS wins,
    COUNT(*) FILTER (WHERE winner_id != p_user_id)::int AS losses,
    COUNT(*)::int AS games_played
  FROM finished;
$$;
