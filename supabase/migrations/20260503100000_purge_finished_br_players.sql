-- Purge battle_royale_players rows from finished/abandoned rooms.
-- These rows served their purpose during gameplay; match results live in match_history.

DELETE FROM battle_royale_players
WHERE room_id IN (
  SELECT id FROM battle_royale_rooms
  WHERE status = 'finished'
);

-- Also delete the finished rooms themselves (no longer needed)
DELETE FROM battle_royale_rooms
WHERE status = 'finished';
