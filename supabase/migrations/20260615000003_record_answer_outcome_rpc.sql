-- Phase 4: per-answer outcome RPC.
--
-- `record_answer_outcome` is called fire-and-forget from the 7 TS answer paths
-- (game, solo, blitz, duel, online-game, battle-royale, logo-quiz) after the
-- correctness is scored. Purely additive: no other RPC is modified.
--
-- Why a separate RPC (not baked into commit_solo_answer / commit_logo_quiz_answer):
--   - Game, blitz, duel, online-game, battle-royale don't use commit_*_answer
--     at all — they just update Redis session state + insert into match_history.
--   - Keeping the per-answer counter write in its own RPC gives every mode a
--     single, consistent call site regardless of whether there's also an
--     elo_history / profile ELO update happening.
--   - Failure of this RPC must NOT block game flow. Callers wrap in .catch().
--
-- Edge cases:
--   - p_question_id = NULL → no-op (WHERE id = NULL matches nothing).
--   - Unknown id → no-op (WHERE clause fails).
--   - p_response_ms NULL or negative → clamped to 0 via GREATEST(COALESCE(...), 0).

CREATE OR REPLACE FUNCTION public.record_answer_outcome(
  p_question_id uuid,
  p_correct     boolean,
  p_timed_out   boolean DEFAULT false,
  p_response_ms integer DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $function$
  -- Accept either the question_pool row id OR the inner jsonb question.id.
  -- LOGO_QUIZ rows (2206 of them) have divergent ids — the manually-entered
  -- logo keeps its own id inside the jsonb while the pool row has its own uuid.
  -- Callers that only have one form handy don't need to care which one it is.
  UPDATE question_pool
  SET times_correct     = times_correct   + CASE WHEN p_correct AND NOT p_timed_out THEN 1 ELSE 0 END,
      times_timed_out   = times_timed_out + CASE WHEN p_timed_out THEN 1 ELSE 0 END,
      times_wrong       = times_wrong     + CASE WHEN NOT p_correct AND NOT p_timed_out THEN 1 ELSE 0 END,
      total_response_ms = total_response_ms + GREATEST(COALESCE(p_response_ms, 0), 0)
  WHERE id = p_question_id
     OR (question ? 'id' AND (question->>'id')::uuid = p_question_id);
$function$;

COMMENT ON FUNCTION public.record_answer_outcome(uuid, boolean, boolean, integer) IS
  'Increments per-question outcome counters. Called fire-and-forget from every answer-submit path. Never blocks gameplay — failure is logged but swallowed by callers.';
