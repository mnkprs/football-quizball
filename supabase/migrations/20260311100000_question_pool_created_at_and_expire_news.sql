-- Add created_at to question_pool for NEWS expiry tracking.
ALTER TABLE question_pool
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Backfill existing rows
UPDATE question_pool SET created_at = now() WHERE created_at IS NULL;

-- RPC to expire NEWS questions older than 7 days.
CREATE OR REPLACE FUNCTION expire_news_questions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM question_pool
  WHERE category = 'NEWS'
    AND created_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
