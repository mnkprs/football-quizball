-- Extend elo_history.mode CHECK to include 'duel_forfeit'.
--
-- The duel reservation flow (introduced in 20260426133304_duel_reservation_state.sql)
-- writes a -5 ELO penalty row with mode='duel_forfeit' whenever a player fails
-- to accept a found match within the 10s window OR explicitly abandons during
-- reserved state. The original CHECK constraint from 20260611000000 only
-- whitelisted ('solo','logo_quiz','logo_quiz_hardcore'), so every forfeit
-- INSERT was rejected with 23514 — silently swallowed by the fire-and-forget
-- catch in DuelService.applyForfeitPenalty / cron path → no ELO actually
-- deducted, no analytics row written.
--
-- The original constraint was added inline (unnamed); PostgreSQL auto-named it
-- elo_history_mode_check. We drop by that conventional name then re-add the
-- broadened version with an explicit name so future extensions are easier.

ALTER TABLE elo_history
  DROP CONSTRAINT IF EXISTS elo_history_mode_check;

ALTER TABLE elo_history
  ADD CONSTRAINT elo_history_mode_check
  CHECK (mode IS NULL OR mode IN ('solo', 'logo_quiz', 'logo_quiz_hardcore', 'duel_forfeit'));

COMMENT ON COLUMN elo_history.mode IS
  'ELO track: solo | logo_quiz | logo_quiz_hardcore | duel_forfeit. Null for pre-migration rows.';
