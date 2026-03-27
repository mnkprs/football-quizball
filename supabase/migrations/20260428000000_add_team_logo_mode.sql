-- Add team logo quiz mode support to Battle Royale tables

-- Room: add mode and config columns
ALTER TABLE battle_royale_rooms
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'classic'
    CHECK (mode IN ('classic', 'team_logo')),
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}';

-- Players: add team assignment and per-player questions
ALTER TABLE battle_royale_players
  ADD COLUMN IF NOT EXISTS team_id INT,
  ADD COLUMN IF NOT EXISTS player_questions JSONB;

-- Ensure question_started_at exists on players (needed for timer)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'battle_royale_players'
    AND column_name = 'question_started_at'
  ) THEN
    ALTER TABLE battle_royale_players ADD COLUMN question_started_at TIMESTAMPTZ;
  END IF;
END
$$;

-- Enable realtime for the new columns (they're on tables that already have realtime)
-- No additional realtime config needed since the tables are already enabled
