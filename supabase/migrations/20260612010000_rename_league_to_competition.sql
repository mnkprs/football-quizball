-- league_id was too narrow — questions can be scoped to tournaments/trophies
-- (UEFA Champions League, FIFA World Cup, Copa del Rey) that aren't "leagues".
-- Rename to competition_id; it now accepts league OR trophy canonical slugs.
-- competition_type (separate column from 20260609100000) keeps the abstraction level.

ALTER TABLE question_pool RENAME COLUMN league_id TO competition_id;
ALTER INDEX idx_question_pool_league_id RENAME TO idx_question_pool_competition_id;

COMMENT ON COLUMN question_pool.competition_id IS
  'Canonical slug of the specific competition scoping this question. '
  'May reference a league slug (e.g. "premier-league", "serie-a") OR a '
  'trophy/tournament slug (e.g. "uefa-champions-league", "fifa-world-cup"). '
  'Use competition_type for the abstraction level.';
