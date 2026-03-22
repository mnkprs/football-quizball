-- Drop the FK constraint on duel_games.guest_id so that dummy_users IDs can be
-- used as bot opponents. Profile resolution falls back to dummy_users in app code.

ALTER TABLE duel_games DROP CONSTRAINT IF EXISTS duel_games_guest_id_fkey;
