-- era was redundant with event_year. Convert it into a STORED generated
-- column derived from event_year so it self-maintains and nothing in
-- analytics code has to change (era is still a real column you can SELECT,
-- GROUP BY, and index — just no longer writable).
--
-- Postgres requires dropping the existing column first; since the trigger
-- for competition metadata only writes league_tier and competition_type,
-- dropping era is safe — no trigger touches it.

ALTER TABLE question_pool DROP COLUMN IF EXISTS era;

ALTER TABLE question_pool ADD COLUMN era TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN event_year IS NULL            THEN NULL
      WHEN event_year < 1990             THEN 'pre_1990'
      WHEN event_year < 2000             THEN '1990s'
      WHEN event_year < 2010             THEN '2000s'
      WHEN event_year < 2020             THEN '2010s'
      ELSE                                    '2020s'
    END
  ) STORED;

COMMENT ON COLUMN question_pool.era IS
  'Generated column: derived from event_year. pre_1990 | 1990s | 2000s | 2010s | 2020s | NULL. Cannot be written directly; update event_year.';

-- The old era index was dropped with the column; recreate on the generated one.
CREATE INDEX IF NOT EXISTS idx_question_pool_era ON question_pool(era);
