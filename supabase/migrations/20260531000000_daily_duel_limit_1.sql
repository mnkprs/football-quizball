-- Change daily duel limit from 3 to 1 for free users
CREATE OR REPLACE FUNCTION increment_daily_duel(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
  v_reset_at DATE;
BEGIN
  SELECT daily_duels_played, daily_duels_reset_at
  INTO v_count, v_reset_at
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  -- Auto-reset if new day
  IF v_reset_at < CURRENT_DATE THEN
    v_count := 0;
  END IF;

  -- Check limit before incrementing
  IF v_count >= 1 THEN
    RETURN -1;
  END IF;

  -- Increment
  UPDATE profiles
  SET daily_duels_played = v_count + 1,
      daily_duels_reset_at = CURRENT_DATE
  WHERE id = p_user_id;

  RETURN v_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
