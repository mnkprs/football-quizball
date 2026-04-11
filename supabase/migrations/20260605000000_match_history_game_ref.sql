-- Add game reference columns to match_history so match detail views
-- can fetch question results, board state, or BR leaderboards from
-- the source game tables (duel_games, online_games, battle_royale_rooms).

ALTER TABLE match_history
  ADD COLUMN game_ref_id   uuid,
  ADD COLUMN game_ref_type text;

-- Index for the detail-endpoint lookup: fetch match row by id + join to game table.
CREATE INDEX idx_match_history_game_ref ON match_history (game_ref_id) WHERE game_ref_id IS NOT NULL;
