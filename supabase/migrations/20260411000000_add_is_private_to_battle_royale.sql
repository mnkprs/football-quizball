-- Private rooms (created with invite code) must not be visible to the matchmaking queue.
-- Rooms created via "Create Private Room" → is_private = true (queue-blind)
-- Rooms created via "Quick Join" / auto-created by the queue → is_private = false

ALTER TABLE battle_royale_rooms
  ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT false;

-- Partial index only covers public rooms so matchmaking queries stay fast
DROP INDEX IF EXISTS idx_br_rooms_waiting;
CREATE INDEX idx_br_rooms_waiting_public
  ON battle_royale_rooms (status, language)
  WHERE status = 'waiting' AND is_private = false;
