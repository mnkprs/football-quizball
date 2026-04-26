-- Duel mode: charge-on-start + 3-strike no-show cooldown.
--
-- Behavior shift:
--   • Old: daily_duels_played was incremented at queue-join time, so a free
--     user who never accepted a found match still burned their daily trial.
--   • New: the trial is consumed only when the match actually starts (status
--     flips to 'active'), via consume_duel_trial(). Reserved-state no-shows
--     and queue leaves are penalized via consecutive_no_show_duels instead.
--
-- After 3 consecutive no-shows the user is blocked from joining the random
-- matchmaking queue for 24h (duel_queue_blocked_until). The counter resets
-- to 0 the moment they actually start a match.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS consecutive_no_show_duels INTEGER NOT NULL DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS duel_queue_blocked_until TIMESTAMPTZ;

-- Read-only quota probe used by DuelProGuard. Auto-resets the daily counter
-- when the stored reset date is stale, so callers always see today's state.
CREATE OR REPLACE FUNCTION check_duel_quota(p_user_id UUID)
RETURNS TABLE(remaining INTEGER, blocked_until TIMESTAMPTZ) AS $$
DECLARE
  v_count INTEGER;
  v_reset_at DATE;
  v_blocked TIMESTAMPTZ;
BEGIN
  SELECT daily_duels_played, daily_duels_reset_at, duel_queue_blocked_until
  INTO v_count, v_reset_at, v_blocked
  FROM profiles WHERE id = p_user_id;

  IF v_reset_at IS NULL OR v_reset_at < CURRENT_DATE THEN
    v_count := 0;
  END IF;

  -- Limit is 1/day. Surface remaining as max(0, 1 - count).
  remaining := GREATEST(0, 1 - COALESCE(v_count, 0));
  -- Treat already-elapsed blocks as cleared so callers don't have to compare.
  IF v_blocked IS NOT NULL AND v_blocked <= NOW() THEN
    blocked_until := NULL;
  ELSE
    blocked_until := v_blocked;
  END IF;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Authoritative consume called when a match transitions to 'active'. Returns
-- the new daily count, or -1 if the user was already at their daily limit
-- (defensive; guard should have caught this, but a race could let two games
-- activate within the same day for a free user with quota=1).
--
-- Also resets consecutive_no_show_duels to 0 — the user showed up for a
-- match, so the streak is broken regardless of what happens next in-game.
CREATE OR REPLACE FUNCTION consume_duel_trial(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
  v_reset_at DATE;
BEGIN
  SELECT daily_duels_played, daily_duels_reset_at
  INTO v_count, v_reset_at
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF v_reset_at IS NULL OR v_reset_at < CURRENT_DATE THEN
    v_count := 0;
  END IF;

  IF v_count >= 1 THEN
    -- Always reset the streak even if we couldn't consume — they did show up.
    UPDATE profiles
    SET consecutive_no_show_duels = 0
    WHERE id = p_user_id;
    RETURN -1;
  END IF;

  UPDATE profiles
  SET daily_duels_played = v_count + 1,
      daily_duels_reset_at = CURRENT_DATE,
      consecutive_no_show_duels = 0
  WHERE id = p_user_id;

  RETURN v_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record a reservation no-show (timer expired without accept, or explicit
-- leave from 'reserved' before accepting). Returns the new blocked_until
-- timestamp when the third strike trips the 24h cooldown, NULL otherwise.
-- Resets the strike counter after tripping the cooldown so the next streak
-- starts fresh once the block expires.
CREATE OR REPLACE FUNCTION record_duel_no_show(p_user_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_count INTEGER;
  v_blocked TIMESTAMPTZ;
BEGIN
  SELECT consecutive_no_show_duels INTO v_count
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  v_count := COALESCE(v_count, 0) + 1;

  IF v_count >= 3 THEN
    v_blocked := NOW() + INTERVAL '24 hours';
    UPDATE profiles
    SET consecutive_no_show_duels = 0,
        duel_queue_blocked_until = v_blocked
    WHERE id = p_user_id;
    RETURN v_blocked;
  END IF;

  UPDATE profiles
  SET consecutive_no_show_duels = v_count
  WHERE id = p_user_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
