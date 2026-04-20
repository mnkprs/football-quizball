-- Phase 2 (partial): strip legacy `_embedding` key from the `question` jsonb.
--
-- Context from the schema audit on 2026-04-20:
--   - Top-level `question_pool.embedding` (pgvector USER-DEFINED type) is the
--     canonical home for vector embeddings.
--   - pool-seed.service.ts line 726 explicitly excludes `_embedding` from the
--     jsonb payload since the top-level column exists — but 507 rows from
--     before that exclusion still carry the duplicate inside jsonb.
--   - Verified: all 507 rows with jsonb `_embedding` also have the top-level
--     `embedding` column populated. No data loss.
--
-- Why this is the ONLY strip in this phase:
--   The audit flagged 10 candidate jsonb keys for removal (`category`,
--   `difficulty`, `id`, `points`, `source_url`, `image_url`, `_embedding`, and
--   4 duplicates inside `difficulty_factors`). Stripping the others safely
--   requires a coordinated refactor:
--     - 10 TS reader files probe jsonb paths that duplicate top-level columns
--       (e.g. `question.difficulty_factors?.answer_type`,
--        `logo-quiz.service.ts:311` uses `image_url:question->image_url`).
--     - The generator write path (`pool-seed.service.ts` line 720's
--       `question: { ...q }` spread) includes those keys implicitly.
--     - `questions.service.ts` lines 254-256 log `fame_score`,
--       `specificity_score`, `combinational_thinking_score` from
--       `difficulty_factors` — stripping those without updating the logger
--       would produce log noise.
--   That coordinated work is a separate effort; `_embedding` is the one
--   verifiably-dead key in this repo's current shape, so it ships alone.

UPDATE question_pool
SET question = question - '_embedding'
WHERE question ? '_embedding';
