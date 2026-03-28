-- Add game_type discriminator to duel_games for logo quiz duel support
ALTER TABLE duel_games
  ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (game_type IN ('standard', 'logo'));
