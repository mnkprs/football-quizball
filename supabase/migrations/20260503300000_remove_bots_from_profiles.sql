-- Remove bot entries that were duplicated into profiles table.
-- Bots should only exist in dummy_users.
-- Must clean up all FK references first.

-- 1. Delete match_history where either player is a bot
DELETE FROM match_history
WHERE player1_id IN (SELECT id FROM dummy_users)
   OR player2_id IN (SELECT id FROM dummy_users);

-- 2. Delete user_achievements for bots
DELETE FROM user_achievements
WHERE user_id IN (SELECT id FROM dummy_users);

-- 3. Delete user_mode_stats for bots
DELETE FROM user_mode_stats
WHERE user_id IN (SELECT id FROM dummy_users);

-- 4. Delete remaining duel_games hosted by bots
DELETE FROM duel_games
WHERE host_id IN (SELECT id FROM dummy_users);

-- 5. Delete remaining online_games hosted by bots
DELETE FROM online_games
WHERE host_id IN (SELECT id FROM dummy_users);

-- 6. Delete remaining battle_royale_players for bots
DELETE FROM battle_royale_players
WHERE user_id IN (SELECT id FROM dummy_users);

-- 7. Delete remaining battle_royale_rooms hosted by bots
DELETE FROM battle_royale_rooms
WHERE host_id IN (SELECT id FROM dummy_users);

-- 8. Now safe to remove bots from profiles
DELETE FROM profiles
WHERE id IN (SELECT id FROM dummy_users);
