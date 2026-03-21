import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { NewsFetcherService } from './news-fetcher.service';
import { NewsQuestionGenerator } from './news-question.generator';
import { QuestionValidator } from '../questions/validators/question.validator';
import { QuestionIntegrityService } from '../questions/validators/question-integrity.service';
import { AnswerValidator } from '../questions/validators/answer.validator';
import { GeneratedQuestion } from '../questions/question.types';
import { GENERATION_VERSION } from '../questions/config/generation-version.config';
import { RedisService } from '../redis/redis.service';

const USER_QUEUE_MAX = 20;

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private isIngesting = false;

  constructor(
    private newsFetcher: NewsFetcherService,
    private newsGenerator: NewsQuestionGenerator,
    private supabaseService: SupabaseService,
    private questionValidator: QuestionValidator,
    private questionIntegrity: QuestionIntegrityService,
    private answerValidator: AnswerValidator,
    private redisService: RedisService,
  ) {}

  /**
   * Fetches headlines, generates questions, and inserts into news_questions.
   * Always runs — no early-exit pool-size guard.
   */
  async ingestNews(): Promise<{ added: number; skipped: number }> {
    if (this.isIngesting) {
      this.logger.warn('[ingestNews] Already ingesting, skipping');
      return { added: 0, skipped: 0 };
    }

    this.isIngesting = true;
    let added = 0;
    let skipped = 0;

    try {
      const headlines = await this.newsFetcher.fetchHeadlines();
      if (headlines.length === 0) {
        this.logger.warn('[ingestNews] No headlines fetched');
        return { added: 0, skipped: 0 };
      }

      const questions = await this.newsGenerator.generateFromHeadlines(headlines);
      const existingKeys = await this.getExistingQuestionKeys();

      let validQuestions = questions.filter((q) => {
        const { valid, reason } = this.questionValidator.validate(q);
        if (!valid) {
          this.logger.debug(`[ingestNews] Rejected: ${reason}`);
          skipped++;
          return false;
        }
        return true;
      });

      if (this.questionIntegrity.isEnabled) {
        const integrityResults = await Promise.all(
          validQuestions.map(async (q) => ({ q, result: await this.questionIntegrity.verify(q) })),
        );
        validQuestions = integrityResults.filter((r) => r.result.valid).map((r) => r.q);
        const rejected = integrityResults.filter((r) => !r.result.valid);
        if (rejected.length > 0) {
          skipped += rejected.length;
          this.logger.log(`[ingestNews] Integrity rejected ${rejected.length} NEWS questions`);
        }
      }

      const rows = validQuestions
        .filter((q) => {
          const key = `${q.question_text}|||${q.correct_answer}`;
          if (existingKeys.has(key)) {
            skipped++;
            return false;
          }
          existingKeys.add(key);
          return true;
        })
        .map((q) => ({
          generation_version: GENERATION_VERSION,
          question: this.toPoolQuestion(q),
        }));

      if (rows.length === 0) {
        this.logger.warn('[ingestNews] No valid questions to insert');
        return { added: 0, skipped };
      }

      const { error } = await this.supabaseService.client
        .from('news_questions')
        .insert(rows);

      if (error) {
        this.logger.error(`[ingestNews] Insert error: ${error.message}`);
        return { added: 0, skipped };
      }

      added = rows.length;
      this.logger.log(`[ingestNews] Inserted ${added} NEWS questions (${skipped} skipped)`);
    } finally {
      this.isIngesting = false;
    }

    return { added, skipped };
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async scheduledIngest() {
    const acquired = await this.redisService.acquireLock('lock:cron:news-ingest', 600);
    if (!acquired) return;
    try {
      this.logger.log('[CRON] News ingest (every 6h): expiring old, then ingesting...');
      await this.expireOldNews();
      await this.ingestNews();
    } finally {
      await this.redisService.releaseLock('lock:cron:news-ingest');
    }
  }

  /** Deletes NEWS questions older than 7 days. */
  async expireOldNews(): Promise<number> {
    const { data, error } = await this.supabaseService.client.rpc('expire_news_questions');
    if (error) {
      this.logger.error(`[expireOldNews] Error: ${error.message}`);
      return 0;
    }
    const deleted = (data as number) ?? 0;
    if (deleted > 0) {
      this.logger.log(`[expireOldNews] Deleted ${deleted} NEWS questions older than 7 days`);
    }
    return deleted;
  }

  private toPoolQuestion(q: GeneratedQuestion): object {
    return {
      id: q.id,
      question_text: q.question_text,
      correct_answer: q.correct_answer,
      fifty_fifty_hint: q.fifty_fifty_hint,
      fifty_fifty_applicable: q.fifty_fifty_applicable,
      explanation: q.explanation,
      image_url: q.image_url,
      category: q.category,
      difficulty: q.difficulty,
      points: q.points,
      wrong_choices: q.wrong_choices,
    };
  }

  async getMetadata(userId?: string): Promise<{ count: number; updatesAt: string }> {
    let count: number;
    if (userId) {
      const { count: userCount, error } = await this.supabaseService.client
        .from('user_news_progress')
        .select('question_id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('answered_at', null);
      count = error ? 0 : (userCount ?? 0);
    } else {
      count = await this.getNewsPoolCount();
    }

    const now = new Date();
    const nextHour = (Math.floor(now.getUTCHours() / 6) + 1) * 6;
    const updatesAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), nextHour));
    return { count, updatesAt: updatesAt.toISOString() };
  }

  private async getNewsPoolCount(): Promise<number> {
    const { count, error } = await this.supabaseService.client
      .from('news_questions')
      .select('id', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString());

    if (error) {
      this.logger.error(`[getNewsPoolCount] Error: ${error.message}`);
      return 0;
    }
    return count ?? 0;
  }

  /**
   * Returns assigned unanswered news questions for the user.
   * Assigns new questions (up to USER_QUEUE_MAX) if the user has capacity.
   */
  async getNewsQuestions(userId: string): Promise<Array<{ id: string; question_text: string; fifty_fifty_hint: string | null; source_url: string | null }>> {
    // Fetch current assignment state for this user
    const { data: progress, error: progressError } = await this.supabaseService.client
      .from('user_news_progress')
      .select('question_id, answered_at')
      .eq('user_id', userId);

    if (progressError) {
      this.logger.error(`[getNewsQuestions] Progress fetch error: ${progressError.message}`);
      return [];
    }

    const allAssigned = progress ?? [];
    const assignedIds = allAssigned.map((r: { question_id: string }) => r.question_id);
    const unansweredIds = allAssigned
      .filter((r: { answered_at: string | null }) => !r.answered_at)
      .map((r: { question_id: string }) => r.question_id);

    const capacity = USER_QUEUE_MAX - unansweredIds.length;

    // Assign new questions if user has capacity
    if (capacity > 0) {
      let query = this.supabaseService.client
        .from('news_questions')
        .select('id')
        .gt('expires_at', new Date().toISOString())
        .limit(capacity);

      if (assignedIds.length > 0) {
        query = query.not('id', 'in', `(${assignedIds.join(',')})`);
      }

      const { data: newQs } = await query;
      if (newQs && newQs.length > 0) {
        const insertRows = (newQs as Array<{ id: string }>).map((q) => ({
          user_id: userId,
          question_id: q.id,
        }));
        const { error: insertError } = await this.supabaseService.client
          .from('user_news_progress')
          .insert(insertRows);
        if (insertError) {
          this.logger.error(`[getNewsQuestions] Assignment insert error: ${insertError.message}`);
        } else {
          unansweredIds.push(...(newQs as Array<{ id: string }>).map((q) => q.id));
        }
      }
    }

    if (unansweredIds.length === 0) return [];

    // Fetch question details for unanswered assigned questions
    const { data, error } = await this.supabaseService.client
      .from('news_questions')
      .select('id, question')
      .in('id', unansweredIds)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      this.logger.error(`[getNewsQuestions] Question fetch error: ${error.message}`);
      return [];
    }

    return (data ?? []).map((r: { id: string; question: Record<string, string | null> }) => ({
      id: r.id,
      question_text: r.question['question_text'] as string,
      fifty_fifty_hint: (r.question['fifty_fifty_hint'] as string | null) ?? null,
      source_url: (r.question['source_url'] as string | null) ?? null,
    }));
  }

  /**
   * Validates an answer for a news question and marks it as answered.
   * Returns null if question not found or expired.
   */
  async checkNewsAnswer(userId: string, questionId: string, answer: string): Promise<{ correct: boolean; correct_answer: string; explanation: string } | null> {
    const { data, error } = await this.supabaseService.client
      .from('news_questions')
      .select('question')
      .eq('id', questionId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error || !data) return null;

    const q = (data as { question: Record<string, string> }).question;
    const mockQuestion = {
      category: 'NEWS' as const,
      correct_answer: q['correct_answer'],
      question_text: q['question_text'],
    } as import('../questions/question.types').GeneratedQuestion;

    const correct = this.answerValidator.validate(mockQuestion, answer);

    // Mark as answered in user progress
    await this.supabaseService.client
      .from('user_news_progress')
      .update({ answered_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('question_id', questionId);

    return {
      correct,
      correct_answer: q['correct_answer'],
      explanation: q['explanation'] ?? '',
    };
  }

  private async getExistingQuestionKeys(): Promise<Set<string>> {
    const { data, error } = await this.supabaseService.client
      .from('news_questions')
      .select('question');

    if (error) {
      this.logger.error(`[getExistingQuestionKeys] Error: ${error.message}`);
      return new Set();
    }

    return new Set(
      (data as Array<{ question: { question_text?: string; correct_answer?: string } }>)
        .filter((r) => r.question?.question_text && r.question?.correct_answer)
        .map((r) => `${r.question.question_text}|||${r.question.correct_answer}`),
    );
  }
}
