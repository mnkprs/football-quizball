-- Create notifications table
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  icon        text,
  route       text,
  metadata    jsonb DEFAULT '{}',
  read        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- Index for fetching user's notifications (newest first)
CREATE INDEX idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- Partial index for unread count queries
CREATE INDEX idx_notifications_user_unread
  ON notifications (user_id) WHERE read = false;

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-delete notifications older than 30 days (runs daily at 3am UTC)
SELECT cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * *',
  $$DELETE FROM notifications WHERE created_at < now() - interval '30 days'$$
);
