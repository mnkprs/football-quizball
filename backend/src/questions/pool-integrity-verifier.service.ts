import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionIntegrityService } from './validators/question-integrity.service';
import { RedisService } from '../redis/redis.service';
import {
  GeneratedQuestion,
  QuestionCategory,
  Difficulty,
} from './config';

@Injectable()
export class PoolIntegrityVerifierService {
  private readonly logger = new Logger(PoolIntegrityVerifierService.name);

  constructor(
    private supabaseService: SupabaseService,
    private questionIntegrity: QuestionIntegrityService,
    private redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Verifies the integrity of pool questions using LLM-based fact-checking.
   * Requires ENABLE_INTEGRITY_VERIFICATION=true.
   * - Fixes questions with wrong answers (correctedAnswer / correctedTop5).
   * - Deletes hallucinated questions (valid: false).
   */
  async verifyPoolIntegrity(options: {
    limit?: number;
    category?: QuestionCategory;
    version?: string;
    apply?: boolean;
    questionIds?: string[];
  }): Promise<{
    scanned: number;
    fixed: number;
    failed: number;
    deleted: number;
    corrections: Array<{ id: string; from: string; to: string; fields?: string[] }>;
    failures: Array<{ id: string; reason: string; question: string }>;
  }> {
    if (!this.questionIntegrity.isEnabled) {
      throw new Error(
        'ENABLE_INTEGRITY_VERIFICATION must be true. Set it in .env to run integrity verification.',
      );
    }

    const THROTTLE_MS = 3000;
    const limit = options.limit ?? 10_000;
    const failures: Array<{ id: string; reason: string; question: string }> = [];
    const corrections: Array<{ id: string; from: string; to: string; fields?: string[] }> = [];
    let scanned = 0;

    let query = this.supabaseService.client
      .from('question_pool')
      .select('id, category, difficulty, question')
      .neq('category', 'NEWS');

    if (options.questionIds?.length) {
      // Verify only the specified questions (e.g. from a seed-pool run)
      query = query.in('id', options.questionIds);
    } else {
      query = query.order('id', { ascending: true }).limit(limit);
      if (options.category) {
        query = query.eq('category', options.category);
      }
      if (options.version?.trim()) {
        query = query.eq('generation_version', options.version.trim());
      }
    }

    const { data: rows, error } = await query;
    if (error) {
      throw new Error(`[verifyPoolIntegrity] Fetch error: ${error.message}`);
    }

    const poolRows = (rows ?? []) as Array<{ id: string; category: string; difficulty: string; question: GeneratedQuestion }>;

    for (let i = 0; i < poolRows.length; i++) {
      const row = poolRows[i];
      const q: GeneratedQuestion = {
        ...row.question,
        category: row.category as QuestionCategory,
        difficulty: row.difficulty as Difficulty,
      };

      const vr = await this.questionIntegrity.verify(q);
      scanned += 1;

      if (!vr.valid) {
        failures.push({
          id: row.id,
          reason: vr.reason ?? 'Unknown',
          question: q.question_text?.slice(0, 80) ?? '',
        });
        this.logger.warn(`[verifyPoolIntegrity] Failed: ${row.id} — ${vr.reason}`);
      } else if (
        vr.correctedAnswer ||
        vr.correctedTop5 ||
        vr.correctedQuestionText ||
        vr.correctedExplanation ||
        (vr.correctedMeta && Object.keys(vr.correctedMeta).length > 0) ||
        vr.sourceUrl
      ) {
        const from = q.correct_answer ?? '';
        const to = vr.correctedAnswer ?? (vr.correctedTop5 ? vr.correctedTop5.map((e) => e.name).join(', ') : from);
        const fields = [
          from !== to && 'answer',
          vr.correctedQuestionText && 'question_text',
          vr.correctedExplanation && 'explanation',
          vr.correctedMeta && Object.keys(vr.correctedMeta).length > 0 && 'meta',
          vr.sourceUrl && 'source_url',
        ].filter(Boolean) as string[];
        corrections.push({ id: row.id, from, to, fields });
        this.logger.log(`[verifyPoolIntegrity] Fix: ${row.id} — ${fields.join(', ')} (answer: "${from}" → "${to}")`);

        if (options.apply) {
          const baseMeta = { ...(q.meta ?? {}) };
          const sanitizedCorrectedMeta =
            vr.correctedMeta && Object.keys(vr.correctedMeta).length > 0
              ? this.sanitizeCorrectedMeta(vr.correctedMeta, row.category)
              : vr.correctedMeta;
          const mergedMeta =
            sanitizedCorrectedMeta && Object.keys(sanitizedCorrectedMeta).length > 0
              ? { ...baseMeta, ...sanitizedCorrectedMeta }
              : baseMeta;
          const finalMeta =
            vr.correctedTop5 && row.category === 'TOP_5' ? { ...mergedMeta, top5: vr.correctedTop5 } : mergedMeta;
          const hasMetaChange =
            (vr.correctedMeta && Object.keys(vr.correctedMeta).length > 0) || (vr.correctedTop5 && row.category === 'TOP_5');

          const updatedQuestion: GeneratedQuestion = {
            ...row.question,
            ...(to && { correct_answer: to }),
            ...(vr.correctedQuestionText && { question_text: vr.correctedQuestionText }),
            ...(vr.correctedExplanation && { explanation: vr.correctedExplanation }),
            ...(hasMetaChange && { meta: finalMeta }),
            ...(vr.sourceUrl && { source_url: vr.sourceUrl }),
          };
          const { error: updErr } = await this.supabaseService.client
            .from('question_pool')
            .update({ question: updatedQuestion })
            .eq('id', row.id);
          if (updErr) {
            this.logger.error(`[verifyPoolIntegrity] Update error ${row.id}: ${updErr.message}`);
          }
        }
      }

      if ((i + 1) % 5 === 0) {
        await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
    }

    let deleted = 0;
    if (options.apply && failures.length > 0) {
      const ids = failures.map((f) => f.id);
      const BATCH_SIZE = 50;
      const deleteErrors: string[] = [];
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const { error: delErr } = await this.supabaseService.client
          .from('question_pool')
          .delete()
          .in('id', batch);
        if (delErr) {
          this.logger.error(`[verifyPoolIntegrity] Delete error (batch ${i / BATCH_SIZE + 1}): ${delErr.message}`);
          deleteErrors.push(delErr.message);
          continue;
        }
        deleted += batch.length;
      }
      if (deleted > 0) {
        this.logger.log(`[verifyPoolIntegrity] Deleted ${deleted} hallucinated questions`);
      }
      if (deleteErrors.length > 0) {
        this.logger.warn(`[verifyPoolIntegrity] ${deleteErrors.length} delete batch(es) failed — some hallucinated questions may remain`);
      }
    }

    if (options.apply && corrections.length > 0) {
      this.logger.log(`[verifyPoolIntegrity] Fixed ${corrections.length} questions with wrong answers`);
    }

    return {
      scanned,
      fixed: corrections.length,
      failed: failures.length,
      deleted,
      corrections,
      failures,
    };
  }

  /**
   * Weekly re-verification of PLAYER_ID questions whose last career entry is still "Present".
   * These go stale when players transfer. Runs every Sunday at 03:00.
   * No-op when ENABLE_INTEGRITY_VERIFICATION is not set.
   */
  async reverifyActiveCareerQuestions(): Promise<void> {
    if (this.configService.get<string>('DISABLE_POOL_CRON') === '1') return;
    if (!this.questionIntegrity.isEnabled) return;

    const acquired = await this.redisService.acquireLock('lock:cron:reverify-careers', 1800);
    if (!acquired) return;
    try {
      this.logger.log('[cron] Re-verifying active-career PLAYER_ID questions');

      const { data: rows, error } = await this.supabaseService.client
        .from('question_pool')
        .select('id, category, difficulty, question')
        .eq('category', 'PLAYER_ID');

      if (error) {
        this.logger.error(`[cron] reverifyActiveCareer fetch error: ${error.message}`);
        return;
      }

      // Only re-check questions where the last career entry is still "Present" — these can go stale
      const activeRows = (rows ?? []).filter((row) => {
        const career = row.question?.meta?.career as Array<{ to: string }> | undefined;
        return Array.isArray(career) && career.length > 0 && career[career.length - 1]?.to === 'Present';
      });

      if (activeRows.length === 0) {
        this.logger.log('[cron] reverifyActiveCareer: no active-career questions found');
        return;
      }

      this.logger.log(`[cron] reverifyActiveCareer: checking ${activeRows.length} questions`);
      const ids = activeRows.map((r) => r.id);
      const result = await this.verifyPoolIntegrity({ questionIds: ids, apply: true });
      this.logger.log(
        `[cron] reverifyActiveCareer done — scanned: ${result.scanned}, fixed: ${result.fixed}, deleted: ${result.deleted}`,
      );
    } finally {
      await this.redisService.releaseLock('lock:cron:reverify-careers');
    }
  }

  /**
   * Strips LLM hallucination where correctedMeta is wrapped in a category-named key
   * e.g. { "PLAYER_ID": { "career": [...] } } → { "career": [...] }
   */
  private sanitizeCorrectedMeta(correctedMeta: Record<string, unknown>, category: string): Record<string, unknown> {
    const keys = Object.keys(correctedMeta);
    if (
      keys.length === 1 &&
      keys[0] === category &&
      typeof correctedMeta[category] === 'object' &&
      correctedMeta[category] !== null
    ) {
      return correctedMeta[category] as Record<string, unknown>;
    }
    return correctedMeta;
  }
}
