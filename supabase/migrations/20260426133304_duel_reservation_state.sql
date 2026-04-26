-- Floating duel queue widget — reservation state
-- Plan: ~/.gstack/projects/mnkprs-football-quizball/instashop-main-design-20260426-114852.md
--
-- Adds the 'reserved' state to duel_games to support the 10s tap-to-enter
-- match-found window between matchmaking and active gameplay. Both players
-- must call POST /api/duel/:id/accept inside the window or the no-show
-- forfeits (-5 ELO, no opponent gain).
--
-- Schema additions (locked by /plan-eng-review decisions 1A, 1B, 4A):
--   • status CHECK extended with 'reserved'
--   • host_accepted_at TIMESTAMPTZ — NULL means not yet accepted (1A)
--   • guest_accepted_at TIMESTAMPTZ — NULL means not yet accepted (1A)
--   • reserved_at TIMESTAMPTZ — set when matchmaker transitions waiting→reserved.
--     Cron sweep (1B) computes deadline = reserved_at + 10s for the WHERE clause.
--   • idx_duel_games_queue partial index broadened from waiting-only to
--     waiting+reserved (4A) so cleanup sweep doesn't seq-scan.
--   • Two partial UNIQUE indexes enforce S0b global queue exclusivity at the
--     DB layer (defense-in-depth beyond the app-level singleton guard).
--
-- Note: not using CONCURRENTLY because (a) this is a small operational table
-- (active games only — finished games are kept but read traffic stays low),
-- (b) Supabase wraps each migration in a transaction by default and
-- CONCURRENTLY cannot run inside a transaction, and (c) the brief lock during
-- deploy is acceptable for a feature shipping for the first time.

-- 1. Extend status CHECK to allow 'reserved'.
ALTER TABLE duel_games
  DROP CONSTRAINT duel_games_status_check;

ALTER TABLE duel_games
  ADD CONSTRAINT duel_games_status_check
    CHECK (status IN ('waiting','reserved','active','finished','abandoned'));

-- 2. Acceptance tracking + reservation timestamp.
ALTER TABLE duel_games
  ADD COLUMN host_accepted_at  TIMESTAMPTZ,
  ADD COLUMN guest_accepted_at TIMESTAMPTZ,
  ADD COLUMN reserved_at       TIMESTAMPTZ;

-- 3. Broaden the matchmaker queue index to also cover the reserved state so
--    the cron cleanup query (WHERE status='reserved' AND reserved_at < ...)
--    uses an index instead of seq-scanning duel_games.
DROP INDEX IF EXISTS idx_duel_games_queue;

CREATE INDEX idx_duel_games_queue
  ON duel_games (status)
  WHERE status IN ('waiting','reserved');

-- 4. Global queue exclusivity (S0b). One queue per user across all game_types.
--    Invite-code games are excluded — they're a separate flow that allows
--    coexistence with queue games (per existing duel.service singleton-guard
--    behavior at duel.service.ts:184).
CREATE UNIQUE INDEX idx_duel_games_host_one_active
  ON duel_games (host_id)
  WHERE status IN ('waiting','reserved') AND invite_code IS NULL;

CREATE UNIQUE INDEX idx_duel_games_guest_one_active
  ON duel_games (guest_id)
  WHERE status IN ('waiting','reserved')
    AND invite_code IS NULL
    AND guest_id IS NOT NULL;
