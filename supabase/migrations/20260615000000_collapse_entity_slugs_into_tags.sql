-- Consolidate entity_slugs + tags into ONE field called `tags`.
--
-- Motivation: having both `tags` (LLM-written secondaries) and `entity_slugs`
-- (auto-union including subject_id/competition_id/nationality + tags) was
-- confusing. Since `tags ⊆ entity_slugs` always holds (proven empirically on
-- 1,950 tagged rows, 0 violations), the separate `tags` field is query-redundant.
--
-- After this migration: `tags` is the single canonical bag of slugs per question.
-- Classifier code is responsible for writing the full union (subject_id +
-- competition_id + nationality + secondary mentions) directly into tags on
-- insert/update. See corresponding pool-seed.service.ts + backfill-pool-taxonomy.ts
-- changes in the same PR.
--
-- Data migration: backfill existing rows to have `tags` = current entity_slugs value
-- before dropping entity_slugs. Zero data loss — union is a superset of tags.

-- Step 1: backfill tags to carry the full union (currently only holds secondaries).
-- Use entity_slugs as the source of truth since it's already the union.
UPDATE question_pool
SET tags = entity_slugs
WHERE entity_slugs IS NOT NULL
  AND array_length(entity_slugs, 1) > 0
  AND tags IS DISTINCT FROM entity_slugs;

-- Step 2: drop the old index + generated column.
DROP INDEX IF EXISTS idx_question_pool_entity_slugs;
ALTER TABLE question_pool DROP COLUMN IF EXISTS entity_slugs;

-- Step 3: drop the stale tags index (was sized for secondaries-only queries;
-- we create a fresh one matching the new semantics).
DROP INDEX IF EXISTS idx_question_pool_tags;

-- Step 4: GIN index on `tags` for entity-scoped mode filtering
-- (`'chelsea' = ANY(tags)`, `tags @> ARRAY[...]`, `tags && ARRAY[...]`).
CREATE INDEX IF NOT EXISTS idx_question_pool_tags
  ON question_pool USING GIN (tags);

-- Step 5: update column comment to reflect new role.
COMMENT ON COLUMN question_pool.tags IS
  'Canonical-slug bag for this question — the full set of entities it touches '
  '(subject + competition + nationality + secondary mentions). Written by '
  'the classifier as the union; queried directly for entity-scoped modes '
  '(e.g. WHERE ''chelsea'' = ANY(tags)). Replaces the previous split between '
  'tags (secondaries only) and entity_slugs (auto-union) — see migration '
  '20260615000000.';
