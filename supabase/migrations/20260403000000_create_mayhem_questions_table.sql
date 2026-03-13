CREATE TABLE mayhem_questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question          jsonb NOT NULL,
  translations      jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  generation_version text,
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX idx_mayhem_questions_expires_at ON mayhem_questions (expires_at);
CREATE INDEX idx_mayhem_questions_created_at ON mayhem_questions (created_at DESC);

CREATE OR REPLACE FUNCTION expire_mayhem_questions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted integer;
BEGIN
  DELETE FROM mayhem_questions WHERE expires_at < now();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;
