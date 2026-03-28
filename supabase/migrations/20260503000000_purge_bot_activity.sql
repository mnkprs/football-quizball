-- Purge all bot/dummy-user activity from game tables.
-- Bot users live in dummy_users; this removes their footprint from
-- duel_games, online_games, match_history, battle_royale_players,
-- battle_royale_rooms, and resets dummy_users stats to zero.

BEGIN;

-- 1. Delete battle_royale_players rows for dummy users
DELETE FROM battle_royale_players
WHERE user_id IN (SELECT id FROM dummy_users);

-- 2. Delete battle_royale_rooms hosted by dummy users
DELETE FROM battle_royale_rooms
WHERE host_id IN (SELECT id FROM dummy_users);

-- 3. Delete finished/abandoned battle_royale_rooms older than 1 hour
--    (cleanup for ALL users — these rows serve no purpose after the game ends)
DELETE FROM battle_royale_rooms
WHERE status IN ('finished')
  AND finished_at < now() - INTERVAL '1 hour';

-- 4. Delete duel_games where guest was a bot
DELETE FROM duel_games
WHERE guest_id IN (SELECT id FROM dummy_users);

-- 5. Delete online_games where guest was a bot
DELETE FROM online_games
WHERE guest_id IN (SELECT id FROM dummy_users);

-- 6. Delete match_history rows flagged as bot matches
DELETE FROM match_history
WHERE is_bot_match = TRUE;

-- 7. Reset dummy_users stats to zero
UPDATE dummy_users
SET games_played         = 0,
    questions_answered   = 0,
    correct_answers      = 0,
    max_blitz_score      = 0,
    max_blitz_total_answered = 0;

COMMIT;
