-- Backfill match_history.match_mode = 'logo_duel' for rows that reference
-- a logo-duel game. Pre-existing data was all tagged 'duel' regardless of
-- game_type, so "Last 10 games" couldn't differentiate. New duels written
-- by DuelService now tag correctly; this migration fixes history.
--
-- Idempotent: re-running just recomputes from duel_games.game_type.

UPDATE match_history mh
SET match_mode = 'logo_duel'
FROM duel_games g
WHERE mh.match_mode = 'duel'
  AND mh.game_ref_type = 'duel'
  AND mh.game_ref_id = g.id::text
  AND g.game_type = 'logo';
