import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  AccuracyBreakdown,
  AnalyticsSummary,
  EloPoint,
  RawEloEvent,
  RawQuestionEvent,
} from './analytics.types';

const MIN_SAMPLE_FOR_RANKING = 5;

/**
 * Minimum gap between strongest and weakest accuracy before we show BOTH
 * callouts. Below this, showing "strongest" and "needs work" back-to-back
 * misleads the user — their play is actually well-balanced and the weakest
 * bucket is only trivially weaker than the strongest. Calibrated at 10pp
 * (0.10) based on the UX goal of only surfacing a "needs work" callout
 * when the contrast is informative.
 */
const MIN_ACCURACY_SPREAD_FOR_WEAKEST = 0.10;

/**
 * Bucket label used when a question event lacks the relevant dimension.
 * This happens for rows joined to question_pool via a null question_id
 * (LLM-fallback solo questions are not persisted to the pool, so their
 * elo_history row carries question_id=null and the join returns no
 * taxonomy fields). Not a data quality bug — it's the known fallback
 * path. Hidden from the user-facing breakdown lists.
 */
const UNKNOWN_BUCKET = 'unknown';

@Injectable()
export class AnalyticsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getForUser(userId: string, mode: string): Promise<AnalyticsSummary> {
    const [eloEvents, questionEvents, currentElo] = await Promise.all([
      this.supabase.getEloHistoryRaw(userId, mode),
      this.supabase.getQuestionEventsRaw(userId, mode),
      this.supabase.getCurrentEloByMode(userId, mode),
    ]);
    return this.aggregate(questionEvents, eloEvents, currentElo);
  }

  aggregate(
    questions: RawQuestionEvent[],
    elo: RawEloEvent[],
    currentElo: number,
  ): AnalyticsSummary {
    const total = questions.length;
    const correct = questions.filter((q) => q.correct).length;
    const accuracy = total === 0 ? 0 : correct / total;
    const peak_elo = elo.reduce(
      (m, e) => (e.elo_after > m ? e.elo_after : m),
      elo.length > 0 ? -Infinity : currentElo,
    );
    const uniqueDays = new Set(
      questions.map((q) => new Date(q.created_at).toISOString().slice(0, 10)),
    ).size;

    const elo_trajectory: EloPoint[] = elo
      .map((e) => ({ t: e.created_at, elo: e.elo_after }))
      .sort((a, b) => a.t.localeCompare(b.t));

    // User-facing breakdowns: the `UNKNOWN_BUCKET` fallback is a plumbing
    // artifact, not a meaningful category. Strip it from every dimension
    // before handing to the widget layer — an `Unknown 20% n=5` row is
    // noise the user can't act on.
    const by_difficulty = bucket(questions, (q) => q.difficulty);
    const by_era = stripUnknown(bucket(questions, (q) => q.era ?? UNKNOWN_BUCKET));
    const by_competition_type = stripUnknown(
      bucket(questions, (q) => q.competition_type ?? UNKNOWN_BUCKET),
    );
    const by_league_tier = stripUnknown(
      bucket(questions, (q) => (q.league_tier ? `tier_${q.league_tier}` : UNKNOWN_BUCKET)),
    );
    const by_category = stripUnknown(bucket(questions, (q) => q.category ?? UNKNOWN_BUCKET));

    // Rankable categories: enough sample size, not the unknown bucket.
    // After the list-level strip above, the `!== UNKNOWN_BUCKET` check here
    // is redundant but intentionally kept for defense-in-depth: ranking
    // logic must never point at the unknown bucket even if a future edit
    // reintroduces it into `by_category`.
    const rankable = by_category.filter(
      (b) => b.total >= MIN_SAMPLE_FOR_RANKING && b.bucket !== UNKNOWN_BUCKET,
    );

    const { strongest, weakest } = pickStrongestWeakest(rankable);

    return {
      totals: {
        questions_answered: total,
        correct,
        accuracy,
        current_elo: currentElo,
        peak_elo,
        days_active: uniqueDays,
      },
      elo_trajectory,
      by_difficulty,
      by_era,
      by_competition_type,
      by_league_tier,
      by_category,
      strongest,
      weakest,
    };
  }
}

/**
 * Pick the best and worst rankable buckets, with two guardrails so the
 * "needs work" callout only appears when it's informative:
 *
 *   1. **At least two distinct rankable buckets.** With only one qualifying
 *      category, strongest and weakest would resolve to the same bucket —
 *      useless to the user (was the original bug).
 *   2. **Accuracy spread ≥ MIN_ACCURACY_SPREAD_FOR_WEAKEST.** When a user is
 *      evenly balanced (all categories within 5pp of each other), labelling
 *      any of them "needs work" is misleading. We show only `strongest`.
 *
 * `strongest` is always returned when any rankable bucket exists — it's a
 * positive signal and safe to surface even for balanced players.
 */
function pickStrongestWeakest(
  rankable: AccuracyBreakdown[],
): { strongest: AccuracyBreakdown | null; weakest: AccuracyBreakdown | null } {
  if (rankable.length === 0) return { strongest: null, weakest: null };

  const sortedDesc = [...rankable].sort((a, b) => b.accuracy - a.accuracy);
  const strongest = sortedDesc[0];

  if (sortedDesc.length < 2) return { strongest, weakest: null };

  const weakest = sortedDesc[sortedDesc.length - 1];
  if (strongest.accuracy - weakest.accuracy < MIN_ACCURACY_SPREAD_FOR_WEAKEST) {
    return { strongest, weakest: null };
  }

  return { strongest, weakest };
}

function stripUnknown(breakdowns: AccuracyBreakdown[]): AccuracyBreakdown[] {
  return breakdowns.filter((b) => b.bucket !== UNKNOWN_BUCKET);
}

function bucket(
  questions: RawQuestionEvent[],
  keyFn: (q: RawQuestionEvent) => string,
): AccuracyBreakdown[] {
  const map = new Map<string, { total: number; correct: number }>();
  for (const q of questions) {
    const k = keyFn(q);
    const entry = map.get(k) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (q.correct) entry.correct += 1;
    map.set(k, entry);
  }
  return [...map.entries()]
    .map(([bucket, v]) => ({
      bucket,
      total: v.total,
      correct: v.correct,
      accuracy: v.total === 0 ? 0 : v.correct / v.total,
    }))
    .sort((a, b) => b.total - a.total);
}
