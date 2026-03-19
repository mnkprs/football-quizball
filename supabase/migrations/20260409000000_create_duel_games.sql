-- Head-to-Head Duel mode: synchronous 1v1, first to 5 correct answers wins
CREATE TABLE duel_games (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code                  TEXT UNIQUE,                            -- 6-char code, null for queue-matched
  host_id                      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  guest_id                     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status                       TEXT NOT NULL DEFAULT 'waiting'
                                 CHECK (status IN ('waiting','active','finished','abandoned')),
  questions                    JSONB NOT NULL DEFAULT '[]',            -- full questions incl. correct_answer (server-side only)
  current_question_index       INT NOT NULL DEFAULT 0,
  current_question_answered_by TEXT,                                   -- 'host' | 'guest' | null (CAS lock)
  host_ready                   BOOLEAN NOT NULL DEFAULT false,
  guest_ready                  BOOLEAN NOT NULL DEFAULT false,
  scores                       JSONB NOT NULL DEFAULT '{"host":0,"guest":0}',
  question_results             JSONB NOT NULL DEFAULT '[]',            -- per-question: { index, winner, question_text, correct_answer }
  pool_question_ids            TEXT[] NOT NULL DEFAULT '{}',
  language                     TEXT NOT NULL DEFAULT 'en',
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_duel_games_host   ON duel_games (host_id, status);
CREATE INDEX idx_duel_games_guest  ON duel_games (guest_id, status);
CREATE INDEX idx_duel_games_queue  ON duel_games (status) WHERE status = 'waiting';

ALTER TABLE duel_games ENABLE ROW LEVEL SECURITY;

-- Players can read their own duel games
CREATE POLICY "duel_players_select" ON duel_games
  FOR SELECT USING (auth.uid() = host_id OR auth.uid() = guest_id);

-- Host can create
CREATE POLICY "duel_host_insert" ON duel_games
  FOR INSERT WITH CHECK (auth.uid() = host_id);

-- All mutations go through backend (service role key bypasses RLS)

-- Realtime: broadcast row changes to subscribed clients
ALTER TABLE duel_games REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE duel_games;
