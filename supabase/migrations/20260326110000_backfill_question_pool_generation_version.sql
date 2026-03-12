-- Backfill generation_version for existing questions (inserted before versioning was added).
-- Uses '0.0.0-legacy' to mark pre-versioning questions. New inserts will use the current version from code.

UPDATE question_pool
SET generation_version = '0.0.0-legacy'
WHERE generation_version IS NULL;
