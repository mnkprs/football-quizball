-- Fix-forward for record_answer_outcome: don't accumulate response_ms on timeouts.
--
-- The column comment on total_response_ms says "Divide by (times_correct +
-- times_wrong) for average". The denominator excludes times_timed_out — so the
-- numerator has to as well, or the average is meaningless.
--
-- Concrete failure mode: solo.service.ts passes `Math.round(elapsed * 1000)` as
-- response_ms even when `answer === 'TIMEOUT'`. A session suspended for a week
-- and returning a TIMEOUT would add 604,800,000 ms to the sum. With no
-- corresponding increment to the denominator, one abandoned session could
-- corrupt the running "avg response time" for a question indefinitely.
--
-- Fix: gate the response_ms accumulation on NOT p_timed_out. Callers can still
-- pass whatever elapsed value they have — the RPC ignores it when the answer
-- timed out.

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
  UPDATE question_pool
  SET times_correct     = times_correct   + CASE WHEN p_correct AND NOT p_timed_out THEN 1 ELSE 0 END,
      times_timed_out   = times_timed_out + CASE WHEN p_timed_out THEN 1 ELSE 0 END,
      times_wrong       = times_wrong     + CASE WHEN NOT p_correct AND NOT p_timed_out THEN 1 ELSE 0 END,
      total_response_ms = total_response_ms + CASE
                            WHEN p_timed_out THEN 0
                            ELSE GREATEST(COALESCE(p_response_ms, 0), 0)
                          END
  WHERE id = p_question_id
     OR (question ? 'id' AND (question->>'id')::uuid = p_question_id);
$function$;
