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

@Injectable()
export class AnalyticsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getForUser(userId: string): Promise<AnalyticsSummary> {
    const [eloEvents, questionEvents, currentElo] = await Promise.all([
      this.supabase.getEloHistoryRaw(userId),
      this.supabase.getQuestionEventsRaw(userId),
      this.supabase.getCurrentElo(userId),
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
    const peak_elo = elo.length > 0 ? Math.max(...elo.map((e) => e.elo_after)) : currentElo;
    const uniqueDays = new Set(
      questions.map((q) => q.created_at.slice(0, 10)),
    ).size;

    const elo_trajectory: EloPoint[] = elo
      .map((e) => ({ t: e.created_at, elo: e.elo_after }))
      .sort((a, b) => a.t.localeCompare(b.t));

    const by_difficulty = bucket(questions, (q) => q.difficulty);
    const by_era = bucket(questions, (q) => q.era ?? 'unknown');
    const by_competition_type = bucket(questions, (q) => q.competition_type ?? 'unknown');
    const by_league_tier = bucket(questions, (q) =>
      q.league_tier ? `tier_${q.league_tier}` : 'unknown',
    );
    const by_category = bucket(questions, (q) => q.category ?? 'unknown');

    const rankable = by_category.filter(
      (b) => b.total >= MIN_SAMPLE_FOR_RANKING && b.bucket !== 'unknown',
    );
    const strongest =
      rankable.length > 0 ? [...rankable].sort((a, b) => b.accuracy - a.accuracy)[0] : null;
    const weakest =
      rankable.length > 0 ? [...rankable].sort((a, b) => a.accuracy - b.accuracy)[0] : null;

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
