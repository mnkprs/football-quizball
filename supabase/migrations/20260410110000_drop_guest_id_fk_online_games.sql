-- Drop the FK constraint on online_games.guest_id so that dummy_users IDs can be
-- used as bot opponents. Profile resolution is handled in application code via
-- SupabaseService.getProfile() which already falls back to dummy_users.

ALTER TABLE online_games DROP CONSTRAINT IF EXISTS online_games_guest_id_fkey;
