-- Backfill generation_version using created_at and git commit dates.
-- Version boundaries from: git log --format="%ad %h %s" --date=iso-strict -- backend/src/questions/
-- Times in UTC (commit 262f69a 21:58+02 = 19:58 UTC).

-- First, revert the previous blanket backfill for rows we can now version by date
-- (no-op if already run; we overwrite with date-based version)

UPDATE question_pool
SET generation_version = CASE
  WHEN created_at IS NULL THEN '0.0.0-legacy'
  WHEN created_at < '2026-03-08 19:58:16+00' THEN '0.6.0-legacy'   -- before 262f69a: bell-curve decay
  WHEN created_at < '2026-03-09 09:13:21+00' THEN '0.7.0'          -- 262f69a: difficulty scoring overhaul
  WHEN created_at < '2026-03-09 10:30:05+00' THEN '0.8.0'          -- 2108f5a: major LLM diversity overhaul
  WHEN created_at < '2026-03-09 16:39:05+00' THEN '0.8.1'          -- f5ad03a: minority scale
  WHEN created_at < '2026-03-11 15:14:54+00' THEN '0.8.2'          -- 539433d: tune difficulty weights
  WHEN created_at < '2026-03-12 07:39:14+00' THEN '0.9.0'          -- 00e2d61: DB-backed answer type modifiers
  WHEN created_at < '2026-03-12 10:04:46+00' THEN '0.9.1'          -- 6c5cc07: bias toward easier questions
  ELSE '1.0.0'                                                     -- current
END
WHERE generation_version = '0.0.0-legacy' OR generation_version IS NULL;
