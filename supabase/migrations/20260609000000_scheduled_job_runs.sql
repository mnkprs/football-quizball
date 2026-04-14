-- Scheduled job coordination table.
--
-- Purpose: leader-election for cron jobs that fan out to many users.
-- Without this, @nestjs/schedule crons fire on every replica, causing
-- duplicate inserts (see: duplicated daily_challenge notifications).
--
-- Contract: the cron INSERTs (job_key, day_key). PK collision means
-- another replica already claimed today's run — caller must early-return.

CREATE TABLE scheduled_job_runs (
  job_key     text        NOT NULL,
  day_key     date        NOT NULL,
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_key, day_key)
);

-- Retention: job log entries older than 90 days are not useful.
-- Cleanup runs in NotificationsService cron.

-- One-time cleanup: deduplicate existing challenge_system rows so the unique
-- index below can be created. Keep earliest per (user_id, dayOfYear).
DELETE FROM notifications n
USING notifications n2
WHERE n.type = 'challenge_system'
  AND n2.type = 'challenge_system'
  AND n.user_id = n2.user_id
  AND n.metadata->>'dayOfYear' = n2.metadata->>'dayOfYear'
  AND n.created_at > n2.created_at;

-- Defense-in-depth: prevent duplicate daily_challenge notifications per user per day
-- even if a future bug bypasses the job-claim guard. Relies on metadata->>'dayOfYear'
-- being set by the producer.
CREATE UNIQUE INDEX idx_notifications_challenge_unique
  ON notifications (user_id, (metadata->>'dayOfYear'))
  WHERE type = 'challenge_system';
