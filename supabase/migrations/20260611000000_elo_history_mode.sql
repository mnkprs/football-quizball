-- Add mode discriminator to elo_history so analytics can filter per ELO track.
-- Legacy rows (before this migration) have mode = NULL and are treated as
-- "unknown mode" — excluded from per-mode views.

ALTER TABLE elo_history
  ADD COLUMN IF NOT EXISTS mode TEXT CHECK (mode IN ('solo', 'logo_quiz', 'logo_quiz_hardcore'));

CREATE INDEX IF NOT EXISTS idx_elo_history_user_mode ON elo_history(user_id, mode);
CREATE INDEX IF NOT EXISTS idx_elo_history_user_mode_created ON elo_history(user_id, mode, created_at DESC);

COMMENT ON COLUMN elo_history.mode IS 'ELO track: solo | logo_quiz | logo_quiz_hardcore. Null for pre-migration rows.';
