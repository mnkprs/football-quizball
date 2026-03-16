-- Game session store for solo, blitz, and mayhem modes.
-- Replaces in-process NodeCache so sessions survive across backend instances/restarts.

CREATE TABLE IF NOT EXISTS game_sessions (
  key         TEXT        PRIMARY KEY,
  data        JSONB       NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast expired-session cleanup (future scheduled job or pruning on read)
CREATE INDEX game_sessions_expires_at_idx ON game_sessions(expires_at);

-- Service role bypasses RLS; no user-facing access needed
ALTER TABLE game_sessions DISABLE ROW LEVEL SECURITY;
