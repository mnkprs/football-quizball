import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { TodayGenerator } from './today.generator';

export interface DailyQuestionRef {
  question_text: string;
  correct_answer: string;
  choices: string[];
  explanation: string;
}

@Injectable()
export class DailyService implements OnModuleInit {
  private readonly logger = new Logger(DailyService.name);

  constructor(
    private supabaseService: SupabaseService,
    private todayGenerator: TodayGenerator,
  ) {}

  onModuleInit() {
    this.logger.log('[INIT] Daily: checking today\'s questions...');
    this.pregenerateToday(false).catch((err) =>
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

    const questions = this.buildQuestionRefs(generated);
    await this.saveForDate(today, generated);
    return questions;
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async pregenerateTodayCron() {
    this.logger.log('[CRON] Daily pre-generate (1AM): running...');
    return this.pregenerateToday(true);
  }

  async pregenerateToday(fromCron = false): Promise<void> {
    const prefix = fromCron ? '[CRON] Daily (1AM)' : '[INIT] Daily';
    const today = this.getTodayDateStr();
    const existing = await this.fetchForDate(today);
    if (existing.length > 0) {
      this.logger.log(`${prefix}: ${today} already has questions, skipping`);
      return;
    }

    this.logger.log(`${prefix}: generating for ${today}`);
    const generated = await this.todayGenerator.generateForDate(
      new Date().getDate(),
      new Date().getMonth() + 1,
    );

    if (generated.length > 0) {
      await this.saveForDate(today, generated);
      this.logger.log(`${prefix}: saved ${generated.length} questions for ${today}`);
    }
  }

  private getTodayDateStr(): string {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  private buildQuestionRefs(questions: Array<{ question_text: string; correct_answer: string; wrong_choices: string[]; explanation: string }>): DailyQuestionRef[] {
    return questions.map((q) => {
      const choices = [q.correct_answer, ...q.wrong_choices.slice(0, 2)];
      for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
      }
      return {
        question_text: q.question_text,
        correct_answer: q.correct_answer,
        choices,
        explanation: q.explanation,
      };
    });
  }

  private async fetchForDate(dateStr: string): Promise<DailyQuestionRef[]> {
    const { data, error } = await this.supabaseService.client
      .from('daily_questions')
      .select('questions')
      .eq('question_date', dateStr)
      .maybeSingle();

    if (error || !data?.questions) {
      return [];
    }

    const raw = data.questions as Array<{ question_text: string; correct_answer: string; wrong_choices: string[]; explanation: string }>;
    return this.buildQuestionRefs(raw);
  }

  private async saveForDate(
    dateStr: string,
    questions: Array<{ question_text: string; correct_answer: string; wrong_choices: string[]; explanation: string }>,
  ): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('daily_questions')
      .upsert({ question_date: dateStr, questions }, { onConflict: 'question_date' });

    if (error) {
      this.logger.error(`[saveForDate] Insert error: ${error.message}`);
    }
  }
}
