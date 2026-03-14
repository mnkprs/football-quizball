-- Online 1v1 async multiplayer games
CREATE TABLE online_games (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code       TEXT UNIQUE,                         -- 6-char, null for queue-matched games
  host_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  guest_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'waiting'
                      CHECK (status IN ('waiting','queued','active','finished','abandoned')),
  board_state       JSONB NOT NULL DEFAULT '{}',
  current_player_id UUID,
  player_scores     JSONB NOT NULL DEFAULT '[0,0]',      -- [host_score, guest_score]
  player_meta       JSONB NOT NULL DEFAULT              -- lifeline/doubler per player
    '{"host":{"lifelineUsed":false,"doubleUsed":false},"guest":{"lifelineUsed":false,"doubleUsed":false}}',
  last_result       JSONB,
  top5_progress     JSONB NOT NULL DEFAULT '{}',
  pool_question_ids TEXT[] NOT NULL DEFAULT '{}',
  language          TEXT NOT NULL DEFAULT 'en',
  turn_deadline     TIMESTAMPTZ,                         -- current player must act by this time
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_online_games_host   ON online_games (host_id, status);
CREATE INDEX idx_online_games_guest  ON online_games (guest_id, status);
CREATE INDEX idx_online_games_queue  ON online_games (status) WHERE status = 'queued';

ALTER TABLE online_games ENABLE ROW LEVEL SECURITY;

-- Players can read their own games
CREATE POLICY "players_select" ON online_games
  FOR SELECT USING (auth.uid() = host_id OR auth.uid() = guest_id);

-- Host can create
CREATE POLICY "host_insert" ON online_games
  FOR INSERT WITH CHECK (auth.uid() = host_id);

-- Mutations via service role key only (backend bypasses RLS)

-- Realtime
ALTER TABLE online_games REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE online_games;

-- Helper RPC for premium enforcement
CREATE OR REPLACE FUNCTION count_active_online_games(p_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::INTEGER FROM online_games
  WHERE status IN ('waiting','queued','active')
    AND (host_id = p_user_id OR guest_id = p_user_id);
$$;
