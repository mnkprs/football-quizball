-- competition_metadata: single source of truth for league / trophy / award facts.
-- Referenced by question_pool.competition_id. A trigger auto-fills the legacy
-- denormalised columns (league_tier, competition_type) on insert/update so the
-- classifier no longer has to produce them — and we avoid drift.
--
-- entity_type is finer-grained than the canonical-entities "type":
--   league  — any competitive league (domestic or continental league phase)
--   trophy  — knockout cup / tournament trophy
--   award   — individual honour (Ballon d'Or, Golden Boot). Not a competition
--             per se, but useful for themed modes, so we keep them here for
--             discoverability. Tier stays NULL for awards.

CREATE TABLE IF NOT EXISTS competition_metadata (
  id                TEXT PRIMARY KEY,
  entity_type       TEXT NOT NULL CHECK (entity_type IN ('league','trophy','award')),
  display_name      TEXT NOT NULL,
  tier              SMALLINT CHECK (tier IS NULL OR tier BETWEEN 1 AND 5),
  competition_type  TEXT CHECK (competition_type IS NULL OR competition_type IN
    ('domestic_league','domestic_cup','continental_club','international_national','youth','friendly','other')),
  country_code      TEXT CHECK (country_code IS NULL OR country_code ~ '^[a-z]{2}$'),
  founded_year      SMALLINT CHECK (founded_year IS NULL OR (founded_year BETWEEN 1850 AND 2100)),
  defunct_year      SMALLINT CHECK (defunct_year IS NULL OR (defunct_year BETWEEN 1850 AND 2100)),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  competition_metadata     IS 'Canonical facts for every league / trophy / award referenced by question_pool.competition_id.';
COMMENT ON COLUMN competition_metadata.tier             IS '1..5 prestige rank (1 = top-5 EU or UCL/FWC). NULL for awards and unclassified.';
COMMENT ON COLUMN competition_metadata.competition_type IS 'Abstract category: domestic_league | domestic_cup | continental_club | international_national | youth | friendly | other.';
COMMENT ON COLUMN competition_metadata.country_code     IS 'ISO alpha-2 host country for domestic competitions. NULL for continental/international.';
COMMENT ON COLUMN competition_metadata.defunct_year     IS 'Year the competition ended / was rebranded. NULL for active competitions.';

CREATE INDEX IF NOT EXISTS idx_competition_metadata_tier         ON competition_metadata(tier);
CREATE INDEX IF NOT EXISTS idx_competition_metadata_type         ON competition_metadata(competition_type);
CREATE INDEX IF NOT EXISTS idx_competition_metadata_country      ON competition_metadata(country_code);
CREATE INDEX IF NOT EXISTS idx_competition_metadata_entity_type  ON competition_metadata(entity_type);

-- Trigger: when a question row has a competition_id, copy tier + competition_type
-- from competition_metadata into the denormalised columns. Skips if the
-- metadata is missing or if the competition_id is an award (tier is NULL there).
CREATE OR REPLACE FUNCTION sync_question_pool_competition_meta()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.competition_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(NEW.league_tier, cm.tier),
    COALESCE(NEW.competition_type, cm.competition_type)
  INTO NEW.league_tier, NEW.competition_type
  FROM competition_metadata cm
  WHERE cm.id = NEW.competition_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_question_pool_competition_meta() IS
  'Populates question_pool.league_tier + competition_type from competition_metadata when competition_id is set. Classifier-provided values win (COALESCE prefers NEW over lookup) so a model override is still possible.';

DROP TRIGGER IF EXISTS trg_sync_competition_meta ON question_pool;
CREATE TRIGGER trg_sync_competition_meta
  BEFORE INSERT OR UPDATE OF competition_id ON question_pool
  FOR EACH ROW
  EXECUTE FUNCTION sync_question_pool_competition_meta();
