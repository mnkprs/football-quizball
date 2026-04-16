-- Make drift visible: when a question is written with a competition_id that
-- doesn't exist in competition_metadata, the trigger previously did nothing
-- silently (PL/pgSQL leaves SELECT INTO targets unchanged when no row matches).
-- That meant league_tier + competition_type stayed NULL forever with no signal.
-- Now we RAISE WARNING so unknown competitions surface in Supabase logs and
-- future extraction-review passes catch them.

CREATE OR REPLACE FUNCTION sync_question_pool_competition_meta()
RETURNS TRIGGER AS $$
DECLARE
  matched_tier SMALLINT;
  matched_type TEXT;
  found BOOLEAN := false;
BEGIN
  IF NEW.competition_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cm.tier, cm.competition_type
  INTO matched_tier, matched_type
  FROM competition_metadata cm
  WHERE cm.id = NEW.competition_id;

  IF FOUND THEN
    NEW.league_tier      := COALESCE(NEW.league_tier, matched_tier);
    NEW.competition_type := COALESCE(NEW.competition_type, matched_type);
  ELSE
    RAISE WARNING 'sync_question_pool_competition_meta: competition_id "%" has no row in competition_metadata — league_tier / competition_type will remain whatever NEW supplied (likely NULL). Run pool:extract-competitions + seed to fix.', NEW.competition_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_question_pool_competition_meta() IS
  'Populates question_pool.league_tier + competition_type from competition_metadata when competition_id is set. Classifier-provided values win (COALESCE prefers NEW over lookup) so a model override is still possible. Emits RAISE WARNING for unknown competition_ids so silent drift is visible in logs.';
