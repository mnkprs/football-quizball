ALTER TABLE profiles
  ADD COLUMN is_pro BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN trial_games_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN stripe_customer_id TEXT,
  ADD COLUMN stripe_subscription_id TEXT;
