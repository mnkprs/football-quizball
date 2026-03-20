-- Battle Royale mode: multi-player live quiz, first to answer MC questions fastest wins
-- All players in a room share the same 20 questions; live leaderboard via Realtime

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE battle_royale_rooms (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code    TEXT UNIQUE,           -- 6-char code; null for queue-matched rooms
  host_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'waiting'
                   CHECK (status IN ('waiting', 'active', 'finished')),
  questions      JSONB NOT NULL DEFAULT '[]',   -- shared MC questions (correct_answer server-side)
  question_count INT  NOT NULL DEFAULT 20,
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  language       TEXT NOT NULL DEFAULT 'en',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE battle_royale_players (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id                UUID NOT NULL REFERENCES battle_royale_rooms(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  username               TEXT NOT NULL,
  score                  INT  NOT NULL DEFAULT 0,
  current_question_index INT  NOT NULL DEFAULT 0,
  finished_at            TIMESTAMPTZ,   -- set when player answers all questions
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX idx_br_rooms_host    ON battle_royale_rooms (host_id, status);
CREATE INDEX idx_br_rooms_waiting ON battle_royale_rooms (status) WHERE status = 'waiting';
CREATE INDEX idx_br_players_room  ON battle_royale_players (room_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE battle_royale_rooms   ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_royale_players ENABLE ROW LEVEL SECURITY;

-- Rooms: anyone can read (leaderboard visibility); insert by host only
CREATE POLICY "br_rooms_public_read"  ON battle_royale_rooms   FOR SELECT USING (true);
CREATE POLICY "br_rooms_host_insert"  ON battle_royale_rooms   FOR INSERT WITH CHECK (auth.uid() = host_id);

-- Players: public read for leaderboard; insert your own row
CREATE POLICY "br_players_public_read"  ON battle_royale_players FOR SELECT USING (true);
CREATE POLICY "br_players_self_insert"  ON battle_royale_players FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Mutations via service role key (backend bypasses RLS)

-- ── Realtime ────────────────────────────────────────────────────────────────────

ALTER TABLE battle_royale_rooms   REPLICA IDENTITY FULL;
ALTER TABLE battle_royale_players REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE battle_royale_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE battle_royale_players;

-- ── RPC: draw N random Blitz questions (no per-user seen filter) ──────────────

CREATE OR REPLACE FUNCTION draw_blitz_questions_random(
  p_count    int DEFAULT 20,
  p_language text DEFAULT 'en'
)
RETURNS TABLE (id uuid, category text, difficulty_score smallint, question jsonb, translations jsonb)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT bqp.id,
         bqp.category::text,
         bqp.difficulty_score,
         bqp.question,
         COALESCE(bqp.translations, '{}'::jsonb) AS translations
  FROM blitz_question_pool bqp
  WHERE bqp.category IN ('HISTORY', 'GEOGRAPHY', 'GOSSIP', 'PLAYER_ID')
  ORDER BY random()
  LIMIT p_count;
$$;
