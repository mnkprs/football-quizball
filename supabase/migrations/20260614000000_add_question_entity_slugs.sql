-- Flattened canonical-slug index on question_pool for entity-scoped modes
-- (e.g. "Chelsea quiz", "Drogba quiz", "UCL quiz").
--
-- Unions the three existing tag-bearing fields into a single TEXT[] so that
-- entity-mode queries collapse from
--
--   WHERE subject_id = 'chelsea' OR competition_id = 'chelsea' OR 'chelsea' = ANY(tags)
--
-- into
--
--   WHERE 'chelsea' = ANY(entity_slugs)
--
-- GENERATED ALWAYS ... STORED = always in sync with the source fields, no
-- triggers, no backfill drift. GIN index keeps lookups fast.

-- Nationality (ISO alpha-2, e.g. 'ar') is included intentionally: it shares
-- the country-slug namespace but is DISTINCT from national-team slugs. The
-- canonical list keeps these separate:
--   country::ar        → "Argentina" (nationality code)
--   team::argentina    → "Argentina" (national team)
-- So 'ar' = ANY(entity_slugs) draws player-nationality questions, while
-- 'argentina' = ANY(entity_slugs) draws Argentina-NT questions — no collision.
ALTER TABLE question_pool
  ADD COLUMN IF NOT EXISTS entity_slugs TEXT[]
    GENERATED ALWAYS AS (
      array_remove(
        (ARRAY[subject_id]::TEXT[]) ||
        (ARRAY[competition_id]::TEXT[]) ||
        (ARRAY[nationality]::TEXT[]) ||
        COALESCE(tags, ARRAY[]::TEXT[]),
        NULL
      )
    ) STORED;

COMMENT ON COLUMN question_pool.entity_slugs IS
  'Auto-generated flattened union of subject_id + competition_id + nationality + tags. '
  'Primary filter for entity-scoped mode queries. Read-only — source fields are '
  'subject_id, competition_id, nationality, tags. Country codes (nationality) and '
  'national-team slugs are distinct namespaces in canonical-entities.';

CREATE INDEX IF NOT EXISTS idx_question_pool_entity_slugs
  ON question_pool USING GIN (entity_slugs);
