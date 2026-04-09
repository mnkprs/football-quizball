-- Online 2-Player Board Game: add columns for spectating & new game flow
-- The online_games table was created in 20260407000000_create_online_games.sql
-- with a different schema. This migration adds the columns needed for the
-- invite-code matchmaking, board storage, and live spectating flow.

-- New columns for the revised game model
ALTER TABLE online_games
  ADD COLUMN IF NOT EXISTS players              JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS current_player_index INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS board                JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS questions            JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS host_ready           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_ready          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS turn_state           JSONB,
  ADD COLUMN IF NOT EXISTS turn_started_at      TIMESTAMPTZ;

-- SECURITY: The questions column contains correct_answer for all 35 questions.
-- Players must NOT be able to SELECT it directly via the Supabase client or Realtime.
-- The backend uses service_role which bypasses these grants entirely.
REVOKE SELECT ON online_games FROM authenticated, anon;
GRANT SELECT (id, invite_code, host_id, guest_id, status, board_state, current_player_id,
  player_scores, player_meta, last_result, top5_progress, pool_question_ids, language,
  turn_deadline, created_at, updated_at, players, current_player_index, board,
  host_ready, guest_ready, turn_state, turn_started_at)
ON online_games TO authenticated;
