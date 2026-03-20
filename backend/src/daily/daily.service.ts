import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { LlmService } from '../llm/llm.service';
import { TodayGenerator } from './today.generator';
import { RedisService } from '../redis/redis.service';
import type { DailyQuestionRef, DailyQuestionTranslation } from '../common/interfaces/daily.interface';

@Injectable()
export class DailyService implements OnModuleInit {
  private readonly logger = new Logger(DailyService.name);

  constructor(
    private supabaseService: SupabaseService,
    private todayGenerator: TodayGenerator,
    private llmService: LlmService,
    private redisService: RedisService,
  ) {}

  onModuleInit() {
    this.logger.log('[INIT] Daily: checking today\'s questions...');
    this.pregenerateToday().catch((err) =>
      this.logger.error(`[INIT] Daily pre-generate failed: ${(err as Error).message}`),
    );
  }

  /**
   * Returns today's questions from DB. Same set for all users.
   * Fetches instantly when pre-generated; falls back to generate+save if missing.
   * Generates and caches if not yet created.
   */
  async getTodaysQuestions(): Promise<DailyQuestionRef[]> {
    const today = this.getTodayDateStr();
    const existing = await this.fetchForDate(today);
    if (existing.length > 0) {
      return existing;
    }

    this.logger.log(`[getTodaysQuestions] No questions for ${today}, generating...`);
    const generated = await this.todayGenerator.generateForDate(
      new Date().getDate(),
      new Date().getMonth() + 1,
    );

    if (generated.length === 0) {
      return [];
    }

    const translations = await this.translateQuestions(generated);
    await this.saveForDate(today, generated, translations);
    return this.buildQuestionRefs(generated, translations);
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async pregenerateTodayCron() {
    const acquired = await this.redisService.acquireLock('lock:cron:daily-pregenerate', 600);
    if (!acquired) return;
    try {
      this.logger.log('[CRON] Daily pre-generate (1AM): running...');
      return this.pregenerateToday();
    } finally {
      await this.redisService.releaseLock('lock:cron:daily-pregenerate');
    }
  }

  async pregenerateToday(): Promise<void> {
    const today = this.getTodayDateStr();
    const existing = await this.fetchForDate(today);
    if (existing.length > 0) {
      this.logger.log(`[pregenerateToday] ${today} already has questions, skipping`);
      return;
    }

    this.logger.log(`[pregenerateToday] generating for ${today}`);
    const generated = await this.todayGenerator.generateForDate(
      new Date().getDate(),
      new Date().getMonth() + 1,
    );

    if (generated.length > 0) {
      const translations = await this.translateQuestions(generated);
      await this.saveForDate(today, generated, translations);
      this.logger.log(`[pregenerateToday] saved ${generated.length} questions for ${today}`);
    }
  }

  /**
   * Returns metadata for today's daily challenge (count, next reset time).
   * Does not trigger generation — returns 0 if not yet created.
   */
  async getMetadata(): Promise<{ count: number; resetsAt: string }> {
    const today = this.getTodayDateStr();
    const existing = await this.fetchForDate(today);
    const count = existing.length;

    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const resetsAt = tomorrow.toISOString();

    return { count, resetsAt };
  }

  private getTodayDateStr(): string {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  private buildQuestionRefs(
    questions: Array<{ question_text: string; correct_answer: string; wrong_choices: string[]; explanation: string }>,
    translations: Array<{ el?: DailyQuestionTranslation }> = [],
  ): DailyQuestionRef[] {
    return questions.map((q, i) => {
      const choices = [q.correct_answer, ...q.wrong_choices.slice(0, 2)];
      for (let k = choices.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [choices[k], choices[j]] = [choices[j], choices[k]];
      }
      return {
        question_text: q.question_text,
        correct_answer: q.correct_answer,
        choices,
        explanation: q.explanation,
        translations: translations[i] ?? undefined,
      };
    });
  }

  private async translateQuestions(
    questions: Array<{ question_text: string; explanation: string }>,
  ): Promise<Array<{ el?: DailyQuestionTranslation }>> {
    try {
      const strings = questions.map((q) => ({ question_text: q.question_text, explanation: q.explanation }));
      const greek = await this.llmService.translateToGreek(strings);
      return greek.map((t) => ({ el: { question_text: t.question_text, explanation: t.explanation } }));
    } catch (err) {
      this.logger.warn(`[translateQuestions] Greek translation failed: ${(err as Error).message}`);
      return questions.map(() => ({}));
    }
  }

  private async fetchForDate(dateStr: string): Promise<DailyQuestionRef[]> {
    const { data, error } = await this.supabaseService.client
      .from('daily_questions')
      .select('questions, translations')
      .eq('question_date', dateStr)
      .maybeSingle();

    if (error || !data?.questions) {
      return [];
    }

    const raw = data.questions as Array<{ question_text: string; correct_answer: string; wrong_choices: string[]; explanation: string }>;
    const translations = (data.translations ?? []) as Array<{ el?: DailyQuestionTranslation }>;
    return this.buildQuestionRefs(raw, translations);
  }

  private async saveForDate(
    dateStr: string,
    questions: Array<{ question_text: string; correct_answer: string; wrong_choices: string[]; explanation: string }>,
    translations: Array<{ el?: DailyQuestionTranslation }> = [],
  ): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('daily_questions')
      .upsert({ question_date: dateStr, questions, translations }, { onConflict: 'question_date' });

    if (error) {
      this.logger.error(`[saveForDate] Insert error: ${error.message}`);
    }
  }
}
