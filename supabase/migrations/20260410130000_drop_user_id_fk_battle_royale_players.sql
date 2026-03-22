-- Drop the FK constraint on battle_royale_players.user_id so that dummy_users IDs
-- can be inserted as bot room participants. Profile resolution is handled in app code.

ALTER TABLE battle_royale_players DROP CONSTRAINT IF EXISTS battle_royale_players_user_id_fkey;
