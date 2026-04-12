-- Add XP columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1;

-- XP history audit table
CREATE TABLE IF NOT EXISTS xp_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount integer NOT NULL,
  source text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xp_history_user ON xp_history(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_history_created ON xp_history(created_at DESC);

-- RLS: own-read only for xp_history (same pattern as elo_history)
ALTER TABLE xp_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own xp_history"
  ON xp_history FOR SELECT
  USING (auth.uid() = user_id);

-- RPC for atomic XP award (read-modify-write in a single transaction)
CREATE OR REPLACE FUNCTION award_xp(
  p_user_id uuid,
  p_amount integer,
  p_source text,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_xp integer;
  v_old_level integer;
  v_new_xp integer;
  v_new_level integer;
BEGIN
  -- Lock the row to prevent concurrent XP awards from racing
  SELECT xp, level INTO v_old_xp, v_old_level
    FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  v_new_xp := v_old_xp + p_amount;

  -- Calculate level: XP_needed(level) = floor(100 * level^1.5)
  v_new_level := 1;
  WHILE floor(100 * power(v_new_level + 1, 1.5)) <= v_new_xp LOOP
    v_new_level := v_new_level + 1;
  END LOOP;

  UPDATE profiles SET xp = v_new_xp, level = v_new_level WHERE id = p_user_id;

  INSERT INTO xp_history (user_id, amount, source, metadata)
  VALUES (p_user_id, p_amount, p_source, p_metadata);

  RETURN jsonb_build_object(
    'xp_gained', p_amount,
    'total_xp', v_new_xp,
    'level', v_new_level,
    'leveled_up', v_new_level > v_old_level
  );
END;
$$;
