-- Remove duplicate entries from wrong_choices arrays in blitz_question_pool.
-- Keeps first occurrence per normalized value (lower(trim())).
-- Run: psql $DATABASE_URL -f supabase/scripts/dedupe_blitz_wrong_choices.sql
-- Or: Supabase Dashboard > SQL Editor

UPDATE blitz_question_pool b
SET question = jsonb_set(
  b.question,
  '{wrong_choices}',
  (
    SELECT jsonb_agg(choice ORDER BY first_ord)
    FROM (
      SELECT (array_agg(choice ORDER BY ord))[1] AS choice, min(ord) AS first_ord
      FROM (
        SELECT trim(elem::text) AS choice, row_number() OVER () AS ord
        FROM jsonb_array_elements_text(b.question->'wrong_choices') AS elem
      ) t
      GROUP BY lower(trim(choice))
    ) t
  )
)
WHERE b.question ? 'wrong_choices'
  AND jsonb_array_length(b.question->'wrong_choices') > 0;
