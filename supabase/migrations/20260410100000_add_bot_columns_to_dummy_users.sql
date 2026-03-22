-- Add bot-specific columns to dummy_users so they can be used as matchmaking opponents.
-- All existing dummy users are bots; real players are only in profiles.

ALTER TABLE dummy_users
  ADD COLUMN IF NOT EXISTS is_bot     BOOLEAN       NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS bot_skill  NUMERIC(3,2)  NOT NULL DEFAULT 0.50;

-- All current dummy_users are bots with varied skill levels matching their ELO tier
UPDATE dummy_users SET is_bot = true, bot_skill =
  CASE
    WHEN elo >= 1600 THEN 0.80
    WHEN elo >= 1400 THEN 0.72
    WHEN elo >= 1100 THEN 0.65
    WHEN elo >= 900  THEN 0.55
    ELSE                  0.45
  END;

CREATE INDEX IF NOT EXISTS idx_dummy_users_bot ON dummy_users (is_bot, elo) WHERE is_bot = true;
