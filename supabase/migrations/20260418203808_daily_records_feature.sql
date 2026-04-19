-- Daily Records feature: solo_session_summaries + records_current matview + refresh fn
--
-- NOTE (recovery): this migration was previously applied directly to prod via
-- MCP apply_migration but the file was never committed to the repo, causing
-- `supabase db push` to fail sync check. Reconstructed here from
-- supabase_migrations.schema_migrations.statements to restore local↔remote
-- parity. DDL is idempotent (IF NOT EXISTS / OR REPLACE / ON CONFLICT DO NOTHING)
-- so re-applying against prod is a no-op.

CREATE TABLE IF NOT EXISTS solo_session_summaries (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mode                TEXT        NOT NULL CHECK (mode IN ('solo', 'logo_solo')),
  max_streak          INT         NOT NULL DEFAULT 0,
  questions_answered  INT         NOT NULL,
  correct_count       INT         NOT NULL,
  accuracy            NUMERIC     GENERATED ALWAYS AS (
    CASE WHEN questions_answered > 0
      THEN (correct_count::numeric / questions_answered::numeric)
      ELSE 0
    END
  ) STORED,
  elo_delta           INT         NOT NULL DEFAULT 0,
  ended_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solo_session_summaries_mode_ended
  ON solo_session_summaries (mode, ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_solo_session_summaries_user_ended
  ON solo_session_summaries (user_id, ended_at DESC);

ALTER TABLE solo_session_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_session_summaries_own_read" ON solo_session_summaries
  FOR SELECT USING (auth.uid() = user_id);


INSERT INTO app_settings (key, value) VALUES
  ('records.solo_accuracy_min_daily',   '50'),
  ('records.solo_accuracy_min_weekly',  '250'),
  ('records.logo_accuracy_min_daily',   '50'),
  ('records.logo_accuracy_min_weekly',  '250'),
  ('records.duel_matches_min_daily',    '10'),
  ('records.duel_matches_min_weekly',   '25')
ON CONFLICT (key) DO NOTHING;


CREATE MATERIALIZED VIEW IF NOT EXISTS records_current AS
WITH
bounds AS (
  SELECT 'daily'::text  AS window_type, date_trunc('day',  now()) AS window_start
  UNION ALL
  SELECT 'weekly'::text AS window_type, date_trunc('week', now()) AS window_start
),

floors AS (
  SELECT
    (SELECT value::int FROM app_settings WHERE key = 'records.solo_accuracy_min_daily')   AS solo_acc_daily,
    (SELECT value::int FROM app_settings WHERE key = 'records.solo_accuracy_min_weekly')  AS solo_acc_weekly,
    (SELECT value::int FROM app_settings WHERE key = 'records.logo_accuracy_min_daily')   AS logo_acc_daily,
    (SELECT value::int FROM app_settings WHERE key = 'records.logo_accuracy_min_weekly')  AS logo_acc_weekly,
    (SELECT value::int FROM app_settings WHERE key = 'records.duel_matches_min_daily')    AS duel_min_daily,
    (SELECT value::int FROM app_settings WHERE key = 'records.duel_matches_min_weekly')   AS duel_min_weekly
),

streak_king AS (
  SELECT DISTINCT ON (b.window_type)
    'streak_king'::text  AS record_type,
    b.window_type,
    'solo'::text         AS scope_mode,
    s.user_id,
    s.max_streak::numeric AS value,
    NULL::int            AS sample_size
  FROM solo_session_summaries s
  CROSS JOIN bounds b
  WHERE s.mode = 'solo'
    AND s.ended_at >= b.window_start
    AND s.max_streak > 0
  ORDER BY b.window_type, s.max_streak DESC, s.ended_at ASC
),

precision_solo AS (
  SELECT DISTINCT ON (b.window_type)
    'precision_solo'::text AS record_type,
    b.window_type,
    'solo'::text           AS scope_mode,
    agg.user_id,
    ROUND(agg.total_correct::numeric / NULLIF(agg.total_qs, 0) * 100, 1) AS value,
    agg.total_qs           AS sample_size
  FROM bounds b
  CROSS JOIN floors f
  JOIN LATERAL (
    SELECT user_id,
           SUM(correct_count)      AS total_correct,
           SUM(questions_answered) AS total_qs
    FROM solo_session_summaries
    WHERE mode = 'solo' AND ended_at >= b.window_start
    GROUP BY user_id
    HAVING SUM(questions_answered) >= CASE b.window_type
                                        WHEN 'daily'  THEN f.solo_acc_daily
                                        WHEN 'weekly' THEN f.solo_acc_weekly
                                      END
  ) agg ON TRUE
  ORDER BY b.window_type,
           (agg.total_correct::numeric / NULLIF(agg.total_qs,0)) DESC,
           agg.total_qs DESC
),

climber_solo AS (
  SELECT DISTINCT ON (b.window_type)
    'climber_solo'::text  AS record_type,
    b.window_type,
    'solo'::text          AS scope_mode,
    agg.user_id,
    agg.elo_gain::numeric AS value,
    NULL::int             AS sample_size
  FROM bounds b
  JOIN LATERAL (
    SELECT user_id, SUM(elo_delta) AS elo_gain
    FROM solo_session_summaries
    WHERE mode = 'solo' AND ended_at >= b.window_start
    GROUP BY user_id
    HAVING SUM(elo_delta) > 0
  ) agg ON TRUE
  ORDER BY b.window_type, agg.elo_gain DESC
),

logo_hunter AS (
  SELECT DISTINCT ON (b.window_type)
    'logo_hunter'::text        AS record_type,
    b.window_type,
    'logo_solo'::text          AS scope_mode,
    agg.user_id,
    agg.total_correct::numeric AS value,
    NULL::int                  AS sample_size
  FROM bounds b
  JOIN LATERAL (
    SELECT user_id, SUM(correct_count) AS total_correct
    FROM solo_session_summaries
    WHERE mode = 'logo_solo' AND ended_at >= b.window_start
    GROUP BY user_id
    HAVING SUM(correct_count) > 0
  ) agg ON TRUE
  ORDER BY b.window_type, agg.total_correct DESC
),

logo_precision AS (
  SELECT DISTINCT ON (b.window_type)
    'logo_precision'::text AS record_type,
    b.window_type,
    'logo_solo'::text      AS scope_mode,
    agg.user_id,
    ROUND(agg.total_correct::numeric / NULLIF(agg.total_qs, 0) * 100, 1) AS value,
    agg.total_qs           AS sample_size
  FROM bounds b
  CROSS JOIN floors f
  JOIN LATERAL (
    SELECT user_id,
           SUM(correct_count)      AS total_correct,
           SUM(questions_answered) AS total_qs
    FROM solo_session_summaries
    WHERE mode = 'logo_solo' AND ended_at >= b.window_start
    GROUP BY user_id
    HAVING SUM(questions_answered) >= CASE b.window_type
                                        WHEN 'daily'  THEN f.logo_acc_daily
                                        WHEN 'weekly' THEN f.logo_acc_weekly
                                      END
  ) agg ON TRUE
  ORDER BY b.window_type,
           (agg.total_correct::numeric / NULLIF(agg.total_qs,0)) DESC,
           agg.total_qs DESC
),

duel_champion AS (
  SELECT DISTINCT ON (b.window_type)
    'duel_champion'::text AS record_type,
    b.window_type,
    'duel'::text          AS scope_mode,
    agg.user_id,
    ROUND(agg.wins::numeric / NULLIF(agg.matches, 0) * 100, 1) AS value,
    agg.matches           AS sample_size
  FROM bounds b
  CROSS JOIN floors f
  JOIN LATERAL (
    SELECT
      player.user_id,
      COUNT(*)                                              AS matches,
      COUNT(*) FILTER (WHERE mh.winner_id = player.user_id) AS wins
    FROM match_history mh
    JOIN duel_games dg ON dg.id::text = mh.game_ref_id
    CROSS JOIN LATERAL (VALUES (mh.player1_id), (mh.player2_id)) player(user_id)
    WHERE mh.game_ref_type = 'duel'
      AND mh.played_at    >= b.window_start
      AND mh.is_bot_match  = FALSE
      AND dg.invite_code  IS NULL
      AND dg.game_type     = 'standard'
      AND player.user_id   IS NOT NULL
    GROUP BY player.user_id
    HAVING COUNT(*) >= CASE b.window_type
                         WHEN 'daily'  THEN f.duel_min_daily
                         WHEN 'weekly' THEN f.duel_min_weekly
                       END
  ) agg ON TRUE
  ORDER BY b.window_type,
           (agg.wins::numeric / NULLIF(agg.matches,0)) DESC,
           agg.matches DESC
),

logo_duel_champion AS (
  SELECT DISTINCT ON (b.window_type)
    'logo_duel_champion'::text AS record_type,
    b.window_type,
    'logo_duel'::text          AS scope_mode,
    agg.user_id,
    ROUND(agg.wins::numeric / NULLIF(agg.matches, 0) * 100, 1) AS value,
    agg.matches                AS sample_size
  FROM bounds b
  CROSS JOIN floors f
  JOIN LATERAL (
    SELECT
      player.user_id,
      COUNT(*)                                              AS matches,
      COUNT(*) FILTER (WHERE mh.winner_id = player.user_id) AS wins
    FROM match_history mh
    JOIN duel_games dg ON dg.id::text = mh.game_ref_id
    CROSS JOIN LATERAL (VALUES (mh.player1_id), (mh.player2_id)) player(user_id)
    WHERE mh.game_ref_type = 'duel'
      AND mh.played_at    >= b.window_start
      AND mh.is_bot_match  = FALSE
      AND dg.invite_code  IS NULL
      AND dg.game_type     = 'logo'
      AND player.user_id   IS NOT NULL
    GROUP BY player.user_id
    HAVING COUNT(*) >= CASE b.window_type
                         WHEN 'daily'  THEN f.duel_min_daily
                         WHEN 'weekly' THEN f.duel_min_weekly
                       END
  ) agg ON TRUE
  ORDER BY b.window_type,
           (agg.wins::numeric / NULLIF(agg.matches,0)) DESC,
           agg.matches DESC
)

SELECT record_type, window_type, scope_mode, user_id, value, sample_size FROM streak_king
UNION ALL SELECT record_type, window_type, scope_mode, user_id, value, sample_size FROM precision_solo
UNION ALL SELECT record_type, window_type, scope_mode, user_id, value, sample_size FROM climber_solo
UNION ALL SELECT record_type, window_type, scope_mode, user_id, value, sample_size FROM logo_hunter
UNION ALL SELECT record_type, window_type, scope_mode, user_id, value, sample_size FROM logo_precision
UNION ALL SELECT record_type, window_type, scope_mode, user_id, value, sample_size FROM duel_champion
UNION ALL SELECT record_type, window_type, scope_mode, user_id, value, sample_size FROM logo_duel_champion;

CREATE UNIQUE INDEX IF NOT EXISTS idx_records_current_unique
  ON records_current (record_type, window_type);


CREATE OR REPLACE FUNCTION refresh_records_current()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY records_current;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_records_current() TO authenticated, service_role;
