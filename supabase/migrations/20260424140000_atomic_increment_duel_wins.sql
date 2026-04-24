-- Atomic counter increment for duel_wins / logo_duel_wins.
-- Replaces the read-modify-write pattern in SupabaseService.incrementDuelWins,
-- which was vulnerable to a lost-update race when two duels for the same
-- user finalized concurrently: both reads would see the same current value
-- and both writes would set N+1 — one win silently dropped.
--
-- Single UPDATE statement, Postgres MVCC handles the concurrency.

CREATE OR REPLACE FUNCTION increment_duel_wins(p_user_id uuid, p_game_type text)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE profiles
  SET duel_wins      = CASE WHEN p_game_type = 'standard' THEN duel_wins + 1      ELSE duel_wins      END,
      logo_duel_wins = CASE WHEN p_game_type = 'logo'     THEN logo_duel_wins + 1 ELSE logo_duel_wins END
  WHERE id = p_user_id
  RETURNING CASE WHEN p_game_type = 'logo' THEN logo_duel_wins ELSE duel_wins END;
$$;
