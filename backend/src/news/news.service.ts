import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { LlmService } from '../llm/llm.service';
import { NewsFetcherService } from './news-fetcher.service';
import { NewsQuestionGenerator } from './news-question.generator';
import { QuestionValidator } from '../questions/validators/question.validator';
import { GeneratedQuestion } from '../questions/question.types';
import { GENERATION_VERSION } from '../questions/config/generation-version.config';

const NEWS_POOL_TARGET = 10;

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private isIngesting = false;

  constructor(
    private newsFetcher: NewsFetcherService,
    private newsGenerator: NewsQuestionGenerator,
    private supabaseService: SupabaseService,
    private llmService: LlmService,
    private questionValidator: QuestionValidator,
  ) {}

  /**
   * Fetches headlines, generates questions, and inserts into question_pool.
   * Skips if already ingesting or pool has enough NEWS questions.
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
      const current = await this.getNewsPoolCount();
      if (current >= NEWS_POOL_TARGET) {
        this.logger.log(`[ingestNews] Pool has ${current} NEWS questions, skipping`);
        return { added: 0, skipped: 0 };
      }

      const headlines = await this.newsFetcher.fetchHeadlines();
      if (headlines.length === 0) {
        this.logger.warn('[ingestNews] No headlines fetched');
        return { added: 0, skipped: 0 };
      }

      const questions = await this.newsGenerator.generateFromHeadlines(headlines);
      const existingKeys = await this.getExistingQuestionKeys();

      const rows = questions
        .filter((q) => {
          const { valid, reason } = this.questionValidator.validate(q);
          if (!valid) {
            this.logger.debug(`[ingestNews] Rejected: ${reason}`);
            skipped++;
            return false;
          }
          const key = `${q.question_text}|||${q.correct_answer}`;
          if (existingKeys.has(key)) {
            skipped++;
            return false;
          }
          existingKeys.add(key);
          return true;
        })
        .map((q) => ({
          category: 'NEWS',
          difficulty: 'MEDIUM',
          used: false,
          generation_version: GENERATION_VERSION,
          question: this.toPoolQuestion(q),
        }));

      if (rows.length === 0) {
        this.logger.warn('[ingestNews] No valid questions to insert');
        return { added: 0, skipped };
      }

      type PoolQuestion = { question_text: string; explanation?: string };
      const toPoolQ = (q: unknown) => q as PoolQuestion;
      let translations: Array<{ question_text: string; explanation: string }> = rows.map((r) => ({
        question_text: toPoolQ(r.question).question_text,
        explanation: toPoolQ(r.question).explanation ?? '',
      }));
      try {
        translations = await this.llmService.translateToGreek(translations);
      } catch (err) {
        this.logger.warn(`[ingestNews] Greek translation failed, inserting without translations: ${(err as Error).message}`);
      }

      const rowsWithTranslations = rows.map((r, i) => ({
        ...r,
        translations: {
          el: {
            question_text: translations[i]?.question_text ?? toPoolQ(r.question).question_text,
            explanation: translations[i]?.explanation ?? toPoolQ(r.question).explanation ?? '',
          },
        },
      }));

      const { error } = await this.supabaseService.client
        .from('question_pool')
        .insert(rowsWithTranslations);

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
    this.logger.log('[CRON] News ingest (every 6h): checking pool, expiring old...');
    await this.expireOldNews();
    await this.ingestNews();
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

  private async getNewsPoolCount(): Promise<number> {
    const { count, error } = await this.supabaseService.client
      .from('question_pool')
      .select('id', { count: 'exact', head: true })
      .eq('category', 'NEWS')
      .eq('used', false);

    if (error) {
      this.logger.error(`[getNewsPoolCount] Error: ${error.message}`);
      return 0;
    }
    return count ?? 0;
  }

  private async getExistingQuestionKeys(): Promise<Set<string>> {
    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('question')
      .eq('category', 'NEWS');

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
