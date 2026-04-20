import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

/**
 * Modes that AnomalyFlagService can operate on. Must stay aligned with
 * `elo_history.mode` (migration 20260611000000) because checkSustainedAccuracy
 * reads that table — filtering on a mode that never appears there would
 * silently return zero rows and never fire a flag.
 *
 * To add a mode: ensure its commit_*_answer RPC writes the new value to
 * elo_history.mode, widen elo_history.mode CHECK, widen cheating_flags.mode
 * CHECK, then add it here. The order matters — widen the reader last.
 */
export type AntiCheatMode = 'solo' | 'logo_quiz' | 'logo_quiz_hardcore';
export type FlagType = 'sustained_high_accuracy' | 'answer_too_fast_burst' | 'impossible_speed';

/**
 * Detection thresholds. Tuned to be intentionally conservative — false
 * positives are damaging (an innocent top player gets flagged) while false
 * negatives only delay detection (the flagger keeps running on every answer).
 *
 * We gate by difficulty: the sustained-high-accuracy test only fires on
 * HARD/EXPERT answers because EASY accuracy above 90% is achievable by
 * genuinely knowledgeable players without cheating. At HARD/EXPERT the
 * human ceiling is closer to 70-80% — sustained >90% is a strong signal.
 */
export interface SustainedAccuracyThresholds {
  windowSize: number;       // how many recent HARD/EXPERT answers to look at
  accuracyThreshold: number; // 0..1 — trigger when correct_rate exceeds this
  dedupWindowHours: number; // suppress re-flagging within this window
}

export const SUSTAINED_DEFAULTS: SustainedAccuracyThresholds = {
  windowSize: 20,
  accuracyThreshold: 0.9,
  dedupWindowHours: 24,
};

/**
 * Write an anti-cheat flag for a user without blocking the answer path.
 * All methods are intentionally fire-and-forget safe (never throw into the
 * caller) — a flagger outage must never break gameplay.
 */
@Injectable()
export class AnomalyFlagService {
  private readonly logger = new Logger(AnomalyFlagService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Called after a solo answer is committed. Looks back at elo_history for
   * recent HARD/EXPERT outcomes; if accuracy exceeds threshold over the
   * window, records a sustained_high_accuracy flag.
   *
   * Never throws. Failures are logged and swallowed.
   */
  async checkSustainedAccuracy(
    userId: string,
    mode: AntiCheatMode,
    thresholds: SustainedAccuracyThresholds = SUSTAINED_DEFAULTS,
  ): Promise<void> {
    try {
      // elo_history is shared across modes; filter to avoid cross-mode noise.
      // `mode` column is populated by commit_*_answer RPCs (see migration
      // 20260611000001_rpcs_mode_param). Rows predating that migration have
      // NULL mode; we skip those defensively.
      const { data: history, error } = await this.supabase.client
        .from('elo_history')
        .select('correct, question_difficulty, created_at, mode')
        .eq('user_id', userId)
        .eq('mode', mode)
        .in('question_difficulty', ['HARD', 'EXPERT'])
        .order('created_at', { ascending: false })
        .limit(thresholds.windowSize);

      if (error) {
        this.logger.warn(`[anomaly] history fetch failed: ${error.message}`);
        return;
      }
      if (!history || history.length < thresholds.windowSize) return;

      const correctCount = history.filter((h) => h.correct).length;
      const accuracy = correctCount / history.length;
      if (accuracy < thresholds.accuracyThreshold) return;

      // Dedup: skip if a same-type flag exists within the dedup window.
      const since = new Date(Date.now() - thresholds.dedupWindowHours * 3_600_000).toISOString();
      const { data: recent } = await this.supabase.client
        .from('cheating_flags')
        .select('id')
        .eq('user_id', userId)
        .eq('flag_type', 'sustained_high_accuracy')
        .eq('mode', mode)
        .gte('created_at', since)
        .limit(1);

      if (recent && recent.length > 0) return;

      const { error: insertError } = await this.supabase.client
        .from('cheating_flags')
        .insert({
          user_id: userId,
          flag_type: 'sustained_high_accuracy',
          mode,
          evidence: {
            window_size: history.length,
            correct: correctCount,
            accuracy,
            difficulty_breakdown: this.breakdown(history),
            oldest_observation: history[history.length - 1]?.created_at,
            newest_observation: history[0]?.created_at,
          },
        });

      if (insertError) {
        this.logger.warn(`[anomaly] flag insert failed: ${insertError.message}`);
        return;
      }

      this.logger.warn(JSON.stringify({
        event: 'cheating_flag_raised',
        userId,
        mode,
        flag_type: 'sustained_high_accuracy',
        accuracy,
        window_size: history.length,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[anomaly] checkSustainedAccuracy failed: ${msg}`);
    }
  }

  private breakdown(history: Array<{ correct: boolean; question_difficulty: string }>): Record<string, { total: number; correct: number }> {
    const out: Record<string, { total: number; correct: number }> = {};
    for (const row of history) {
      const key = row.question_difficulty;
      if (!out[key]) out[key] = { total: 0, correct: 0 };
      out[key].total += 1;
      if (row.correct) out[key].correct += 1;
    }
    return out;
  }
}
