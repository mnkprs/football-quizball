-- Add structured metadata columns to question_pool for analytics tagging.
-- All columns are nullable; existing rows remain untouched (bucket as "unknown" in analytics).

ALTER TABLE question_pool
  ADD COLUMN IF NOT EXISTS league_tier SMALLINT CHECK (league_tier BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS competition_type TEXT,
  ADD COLUMN IF NOT EXISTS era TEXT,
  ADD COLUMN IF NOT EXISTS event_year SMALLINT,
  ADD COLUMN IF NOT EXISTS nationality TEXT;

COMMENT ON COLUMN question_pool.league_tier IS '1=top-5 EU leagues, 2=other EU top flight, 3=other pro leagues, 4=lower divisions, 5=amateur/misc';
COMMENT ON COLUMN question_pool.competition_type IS 'domestic_league | domestic_cup | continental_club | international_national | youth | friendly | other';
COMMENT ON COLUMN question_pool.era IS 'pre_1990 | 1990s | 2000s | 2010s | 2020s';
COMMENT ON COLUMN question_pool.nationality IS 'ISO 3166-1 alpha-2 country code of primary subject (player nationality, etc.)';

CREATE INDEX IF NOT EXISTS idx_question_pool_era ON question_pool(era);
CREATE INDEX IF NOT EXISTS idx_question_pool_league_tier ON question_pool(league_tier);
