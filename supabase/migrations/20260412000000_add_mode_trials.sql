-- Per-mode trial columns: 1 BR trial, 2 duel trials
ALTER TABLE profiles
  ADD COLUMN trial_battle_royale_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN trial_duel_used INTEGER NOT NULL DEFAULT 0;

-- RPC: atomically increment battle royale trial counter
CREATE OR REPLACE FUNCTION increment_trial_battle_royale(p_user_id UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE profiles
     SET trial_battle_royale_used = trial_battle_royale_used + 1
   WHERE id = p_user_id;
$$;

-- RPC: atomically increment duel trial counter
CREATE OR REPLACE FUNCTION increment_trial_duel(p_user_id UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE profiles
     SET trial_duel_used = trial_duel_used + 1
   WHERE id = p_user_id;
$$;
