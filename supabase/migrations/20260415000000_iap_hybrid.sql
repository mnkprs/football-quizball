-- IAP Hybrid Monetization: subscription ($2.99/mo) + lifetime ($9.99) one-time
-- Replaces Stripe-based subscription system with native Apple IAP / Google Play Billing

-- Purchase tracking columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS purchase_type TEXT
  CHECK (purchase_type IN ('subscription', 'lifetime'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_lifetime_owned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS iap_platform TEXT
  CHECK (iap_platform IN ('ios', 'android'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS iap_transaction_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS iap_original_transaction_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_purchased_at TIMESTAMPTZ;

-- Daily duel rate limiting (3 free/day, unlimited for Pro)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_duels_played INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_duels_reset_at DATE NOT NULL DEFAULT CURRENT_DATE;

-- Atomic daily duel increment with auto-reset at midnight
CREATE OR REPLACE FUNCTION increment_daily_duel(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE profiles
  SET daily_duels_played = CASE
    WHEN daily_duels_reset_at < CURRENT_DATE THEN 1
    ELSE daily_duels_played + 1
  END,
  daily_duels_reset_at = CURRENT_DATE
  WHERE id = p_user_id
  RETURNING daily_duels_played INTO v_count;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper to get remaining daily duels (returns 0-3 for free users)
CREATE OR REPLACE FUNCTION get_daily_duels_remaining(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_played INTEGER;
  v_reset_at DATE;
BEGIN
  SELECT daily_duels_played, daily_duels_reset_at
  INTO v_played, v_reset_at
  FROM profiles WHERE id = p_user_id;

  -- If reset date is before today, counter is effectively 0
  IF v_reset_at < CURRENT_DATE THEN
    RETURN 3;
  END IF;

  RETURN GREATEST(0, 3 - v_played);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
