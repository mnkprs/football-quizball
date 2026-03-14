-- Table: per-user question seen history
CREATE TABLE IF NOT EXISTS blitz_user_seen_questions (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES blitz_question_pool(id) ON DELETE CASCADE,
  seen_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_busq_user_id ON blitz_user_seen_questions (user_id);

-- RPC: draw questions the user hasn't seen yet
CREATE OR REPLACE FUNCTION draw_blitz_questions_for_user(
  p_user_id uuid,
  p_count   int DEFAULT 70
)
RETURNS TABLE (id uuid, category text, difficulty_score smallint, question jsonb, translations jsonb)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT bqp.id, bqp.category::text, bqp.difficulty_score, bqp.question,
         COALESCE(bqp.translations, '{}'::jsonb) AS translations
  FROM blitz_question_pool bqp
  WHERE bqp.category IN ('HISTORY', 'GEOGRAPHY', 'GOSSIP', 'PLAYER_ID')
    AND bqp.id NOT IN (
      SELECT question_id FROM blitz_user_seen_questions WHERE user_id = p_user_id
    )
  ORDER BY random()
  LIMIT p_count;
$$;

-- RPC: batch-mark questions as seen for a user
CREATE OR REPLACE FUNCTION mark_blitz_questions_seen(
  p_user_id     uuid,
  p_question_ids uuid[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO blitz_user_seen_questions (user_id, question_id)
  SELECT p_user_id, unnest(p_question_ids)
  ON CONFLICT DO NOTHING;
$$;

-- RPC: reset seen history for a user (95% exhaustion trigger)
CREATE OR REPLACE FUNCTION reset_blitz_seen_for_user(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM blitz_user_seen_questions WHERE user_id = p_user_id;
$$;
