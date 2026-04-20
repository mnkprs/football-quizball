-- Align cheating_flags.mode with elo_history.mode.
--
-- The initial cheating_flags migration (20260420215358) listed modes that
-- don't exist in elo_history (blitz, duel, battle_royale) and missed one
-- that does (logo_quiz_hardcore). AnomalyFlagService reads elo_history to
-- compute sustained-accuracy flags, so cheating_flags must be a subset of
-- the modes that actually appear there — otherwise we either (a) crash on
-- insert (logo_quiz_hardcore case), or (b) silently no-op because the
-- elo_history filter returns zero rows (blitz/duel/BR case).
--
-- The AntiCheatMode TS type is being narrowed in the same PR to match.

ALTER TABLE cheating_flags DROP CONSTRAINT IF EXISTS cheating_flags_mode_check;

ALTER TABLE cheating_flags
  ADD CONSTRAINT cheating_flags_mode_check
  CHECK (mode IN ('solo', 'logo_quiz', 'logo_quiz_hardcore'));

COMMENT ON COLUMN cheating_flags.mode IS
  'Matches elo_history.mode (solo | logo_quiz | logo_quiz_hardcore). '
  'Modes without elo_history writes (blitz, duel, BR) cannot be flagged by '
  'AnomalyFlagService today — add them here only when those modes start '
  'writing to elo_history.';
