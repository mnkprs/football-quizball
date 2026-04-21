-- device_tokens: stores FCM push tokens per user/device.
-- UNIQUE on token ensures a token is always owned by exactly one user
-- (handles device handoff between accounts).

CREATE TABLE IF NOT EXISTS device_tokens (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       text        NOT NULL UNIQUE,
  platform    text        NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_device_tokens_user_id ON device_tokens (user_id);

-- RLS
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read their own tokens
CREATE POLICY "Users can read own tokens"
  ON device_tokens FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own tokens
CREATE POLICY "Users can insert own tokens"
  ON device_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own tokens (for upsert reassignment)
CREATE POLICY "Users can update own tokens"
  ON device_tokens FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own tokens
CREATE POLICY "Users can delete own tokens"
  ON device_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass for backend push fan-out
-- (service_role key bypasses RLS automatically in Supabase)
