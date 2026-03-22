-- Track whether a match was played against a bot opponent.
-- Useful for filtering bot vs. real matches on the profile/history page.

ALTER TABLE match_history
  ADD COLUMN IF NOT EXISTS is_bot_match BOOLEAN NOT NULL DEFAULT FALSE;
