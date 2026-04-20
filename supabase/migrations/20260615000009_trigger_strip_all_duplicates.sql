-- Extend enforce_question_jsonb_shape to strip all 7 promoted/stripped keys,
-- not just the 5 from migration 006.
--
-- Context: Phase 2C's trigger stripped id, category, difficulty, points, and
-- difficulty_factors on every INSERT/UPDATE OF question. Phase 2D also
-- promoted source_url and image_url to top-level columns and bulk-stripped
-- them from jsonb — but the trigger didn't cover those two keys.
--
-- Concrete exposure: `pool-integrity-verifier.service.ts:139` writes
-- `source_url: vr.sourceUrl` into the jsonb payload of its UPDATE. Without
-- this trigger extension, that write lands in jsonb (which is supposed to be
-- clean) while the top-level `question_pool.source_url` column stays stale.
-- Result: split-brain source_url data.
--
-- This migration closes the window permanently. The integrity verifier still
-- needs a code-level fix to write to the top-level column (tracked in the
-- CHANGELOG), but until that ships, the trigger prevents the jsonb from
-- regrowing the duplicate.

CREATE OR REPLACE FUNCTION public.enforce_question_jsonb_shape()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.question IS NOT NULL THEN
    NEW.question := NEW.question
      - 'id' - 'category' - 'difficulty' - 'points'
      - 'difficulty_factors'
      - 'source_url' - 'image_url';
  END IF;
  RETURN NEW;
END;
$function$;
