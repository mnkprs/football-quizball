-- Anti-cheat anomaly flags.
-- Populated by AnomalyFlagService when a user's play pattern crosses a
-- sustained-high-accuracy or too-fast threshold. Non-blocking — the flag is
-- written asynchronously from the answer path; humans (or a follow-up
-- admin surface) review and mark resolved.

CREATE TABLE IF NOT EXISTS cheating_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN (
    'sustained_high_accuracy',
    'answer_too_fast_burst',
    'impossible_speed'
  )),
  mode TEXT NOT NULL CHECK (mode IN ('solo', 'logo_quiz', 'blitz', 'duel', 'battle_royale')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

COMMENT ON TABLE cheating_flags IS
  'Anti-cheat anomaly flags written asynchronously from the answer path. '
  'Non-blocking — humans or an admin surface review/resolve. '
  'Presence of a flag does NOT automatically affect ELO or leaderboard.';

COMMENT ON COLUMN cheating_flags.flag_type IS
  'sustained_high_accuracy: rolling-window accuracy far above human norm at HARD/EXPERT. '
  'answer_too_fast_burst: many sub-threshold submissions in a short window. '
  'impossible_speed: a single answer below the absolute floor.';

COMMENT ON COLUMN cheating_flags.evidence IS
  'Snapshot of the metrics that triggered the flag (accuracy, window size, '
  'difficulty mix, timings). Structure varies by flag_type; readers should '
  'be defensive.';

-- Primary access pattern: list unresolved flags per user, ordered newest first.
CREATE INDEX IF NOT EXISTS idx_cheating_flags_user_created
  ON cheating_flags(user_id, created_at DESC);

-- Admin surface filter: unresolved across all users, newest first.
CREATE INDEX IF NOT EXISTS idx_cheating_flags_unresolved
  ON cheating_flags(created_at DESC)
  WHERE resolved = false;

-- Dedup support: the flagger looks up recent same-type flags for this user
-- to avoid re-inserting identical alerts every few answers.
CREATE INDEX IF NOT EXISTS idx_cheating_flags_dedup
  ON cheating_flags(user_id, flag_type, created_at DESC);

-- RLS: service-role writes only; users cannot read their own flags.
-- (We explicitly don't want a cheater to know they've been flagged.)
ALTER TABLE cheating_flags ENABLE ROW LEVEL SECURITY;

-- No policies = no access for authenticated/anon roles. service_role bypasses RLS.
-- If/when an admin UI needs read access, add a restrictive policy keyed to an
-- admin role claim; do not grant via direct authenticated access.
