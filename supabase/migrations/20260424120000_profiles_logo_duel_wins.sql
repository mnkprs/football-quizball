-- Adds profiles.logo_duel_wins and corrects profiles.duel_wins to
-- standard-only by backfilling both from duel_games (source of truth).
-- Idempotent: re-running recomputes from duel_games without drift.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS logo_duel_wins int NOT NULL DEFAULT 0;

UPDATE profiles p SET logo_duel_wins = COALESCE((
  SELECT COUNT(*)
  FROM duel_games g
  WHERE g.status = 'finished'
    AND g.game_type = 'logo'
    AND g.scores IS NOT NULL
    AND (
      (g.host_id = p.id AND (g.scores->>'host')::int > (g.scores->>'guest')::int)
      OR
      (g.guest_id = p.id AND (g.scores->>'guest')::int > (g.scores->>'host')::int)
    )
), 0);

UPDATE profiles p SET duel_wins = COALESCE((
  SELECT COUNT(*)
  FROM duel_games g
  WHERE g.status = 'finished'
    AND g.game_type = 'standard'
    AND g.scores IS NOT NULL
    AND (
      (g.host_id = p.id AND (g.scores->>'host')::int > (g.scores->>'guest')::int)
      OR
      (g.guest_id = p.id AND (g.scores->>'guest')::int > (g.scores->>'host')::int)
    )
), 0);
