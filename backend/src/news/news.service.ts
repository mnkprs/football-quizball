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

const QUESTIONS_PER_ROUND = 10;
const GRACE_PERIOD_MINUTES = 10;
const MAX_RSS_RETRIES = 3;

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private isIngesting = false;

  constructor(
    private readonly newsFetcher: NewsFetcherService,
    private readonly newsGenerator: NewsQuestionGenerator,
    private readonly supabaseService: SupabaseService,
    private readonly questionValidator: QuestionValidator,
    private readonly questionIntegrity: QuestionIntegrityService,
    private readonly answerValidator: AnswerValidator,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Fetches headlines, generates questions, and creates a new daily round.
   * Skips if an active round already exists.
   */
  async ingestNews(): Promise<{ added: number; skipped: number; roundId: string | null }> {
    if (this.isIngesting) {
      this.logger.warn('[ingestNews] Already ingesting, skipping');
      return { added: 0, skipped: 0, roundId: null };
    }

    // Check for active round
    const activeRound = await this.getActiveRound();
    if (activeRound) {
      this.logger.debug(`[ingestNews] Active round ${activeRound.id} exists, skipping`);
      return { added: 0, skipped: 0, roundId: activeRound.id };
    }

    this.isIngesting = true;
    let added = 0;
    let skipped = 0;
    let roundId: string | null = null;

    try {
      // Fetch headlines with retry
      const allHeadlines = await this.fetchHeadlinesWithRetry();
      if (allHeadlines.length === 0) {
        this.logger.warn('[ingestNews] No headlines fetched after retries');
        return { added: 0, skipped: 0, roundId: null };
      }

      // Filter out already-processed URLs
      const processedUrls = await this.getProcessedHeadlineUrls();
      const headlines = allHeadlines.filter((h) => !processedUrls.has(h.url));
      if (headlines.length === 0) {
        this.logger.debug('[ingestNews] All headlines already processed');
        return { added: 0, skipped: 0, roundId: null };
      }
      this.logger.debug(`[ingestNews] ${headlines.length} new headlines`);

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
          this.logger.debug(`[ingestNews] Integrity rejected ${rejected.length} questions`);
        }
      }

      // Deduplicate
      const dedupedQuestions = validQuestions.filter((q) => {
        const key = this.normalizeKey(q.question_text, q.correct_answer);
        if (existingKeys.has(key)) {
          skipped++;
          return false;
        }
        existingKeys.add(key);
        return true;
      });

      // Cap at QUESTIONS_PER_ROUND
      const roundQuestions = dedupedQuestions.slice(0, QUESTIONS_PER_ROUND);

      if (roundQuestions.length === 0) {
        this.logger.warn('[ingestNews] No valid questions to insert');
        return { added: 0, skipped, roundId: null };
      }

      if (roundQuestions.length < 5) {
        this.logger.warn(`[ingestNews] Only ${roundQuestions.length} questions, below minimum threshold`);
      }

      // Create the round
      const expiresAt = this.getEndOfUtcDay();
      const { data: roundData, error: roundError } = await this.supabaseService.client
        .from('news_rounds')
        .insert({ expires_at: expiresAt, question_count: roundQuestions.length })
        .select('id')
        .single();

      if (roundError || !roundData) {
        this.logger.error(`[ingestNews] Round insert error: ${roundError?.message}`);
        return { added: 0, skipped, roundId: null };
      }

      roundId = roundData.id;

      // Insert questions for the round
      const rows = roundQuestions.map((q) => ({
        generation_version: GENERATION_VERSION,
        question: this.toPoolQuestion(q),
        headline_url: q.source_url ?? null,
        round_id: roundId,
        expires_at: expiresAt,
      }));

      const { error: insertError } = await this.supabaseService.client
        .from('news_questions')
        .insert(rows);

      if (insertError) {
        this.logger.error(`[ingestNews] Question insert error: ${insertError.message}`);
        return { added: 0, skipped, roundId };
      }

      added = rows.length;
      this.logger.debug(`[ingestNews] Round ${roundId}: ${added} questions (${skipped} skipped)`);
    } finally {
      this.isIngesting = false;
    }

    return { added, skipped, roundId };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scheduledIngest() {
    const acquired = await this.redisService.acquireLock('lock:cron:news-ingest', 600);
    if (!acquired) return;
    try {
      this.logger.debug('[CRON] Daily news ingest: expiring old, then ingesting...');
      await this.expireOldNews();
      await this.ingestNews();
    } finally {
      await this.redisService.releaseLock('lock:cron:news-ingest');
    }
  }

  /** Deletes expired NEWS questions and empty rounds. */
  async expireOldNews(): Promise<number> {
    const { data, error } = await this.supabaseService.client.rpc('expire_news_questions');
    if (error) {
      this.logger.error(`[expireOldNews] Error: ${error.message}`);
      return 0;
    }
    const deleted = (data as number) ?? 0;
    if (deleted > 0) {
      this.logger.debug(`[expireOldNews] Deleted ${deleted} expired NEWS questions`);
    }
    return deleted;
  }

  /**
   * Returns metadata about the current round and user's progress.
   */
  async getMetadata(userId?: string): Promise<{
    round_id: string | null;
    questions_total: number;
    questions_remaining: number;
    expires_at: string | null;
    round_created_at: string | null;
    streak: number;
    max_streak: number;
  }> {
    const round = await this.getActiveRound();
    if (!round) {
      const streakInfo = userId ? await this.getStreakInfo(userId) : null;
      return {
        round_id: null,
        questions_total: 0,
        questions_remaining: 0,
        expires_at: null,
        round_created_at: null,
        streak: streakInfo?.current_streak ?? 0,
        max_streak: streakInfo?.max_streak ?? 0,
      };
    }

    let questionsRemaining = round.question_count;
    let streakInfo: { current_streak: number; max_streak: number } | null = null;

    if (userId) {
      const roundQuestionIds = await this.getRoundQuestionIds(round.id);
      if (roundQuestionIds.length > 0) {
        const { count, error } = await this.supabaseService.client
          .from('user_news_progress')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('question_id', roundQuestionIds);

        if (!error && count !== null) {
          questionsRemaining = Math.max(0, round.question_count - count);
        }
      }

      streakInfo = await this.getStreakInfo(userId);
    }

    return {
      round_id: round.id,
      questions_total: round.question_count,
      questions_remaining: questionsRemaining,
      expires_at: round.expires_at,
      round_created_at: round.created_at,
      streak: streakInfo?.current_streak ?? 0,
      max_streak: streakInfo?.max_streak ?? 0,
    };
  }

  /**
   * Returns unanswered questions from the current active round.
   */
  async getNewsQuestions(userId: string): Promise<Array<{
    id: string;
    question_text: string;
    fifty_fifty_hint: string | null;
    wrong_choices: string[] | null;
    source_url: string | null;
  }>> {
    const round = await this.getActiveRound();
    if (!round) return [];

    // Get IDs user already answered in this round
    const roundQuestionIds = await this.getRoundQuestionIds(round.id);
    const { data: answered } = await this.supabaseService.client
      .from('user_news_progress')
      .select('question_id')
      .eq('user_id', userId)
      .in('question_id', roundQuestionIds);

    const answeredIds = new Set((answered ?? []).map((r: { question_id: string }) => r.question_id));

    // Fetch unanswered questions
    const unansweredIds = roundQuestionIds.filter((id) => !answeredIds.has(id));
    if (unansweredIds.length === 0) return [];

    const { data, error } = await this.supabaseService.client
      .from('news_questions')
      .select('id, question')
      .in('id', unansweredIds);

    if (error) {
      this.logger.error(`[getNewsQuestions] Error: ${error.message}`);
      return [];
    }

    return (data ?? []).map((r: { id: string; question: Record<string, unknown> }) => ({
      id: r.id,
      question_text: r.question['question_text'] as string,
      fifty_fifty_hint: (r.question['fifty_fifty_hint'] as string | null) ?? null,
      wrong_choices: (r.question['wrong_choices'] as string[] | null) ?? null,
      source_url: (r.question['source_url'] as string | null) ?? null,
    }));
  }

  /**
   * Validates an answer, marks it answered, updates stats and streaks.
   * Includes a grace period for answers submitted shortly after round expiry.
   */
  async checkNewsAnswer(
    userId: string,
    questionId: string,
    answer: string,
  ): Promise<{ correct: boolean; correct_answer: string; explanation: string } | null> {
    // Fetch question with grace period
    const graceTime = new Date(Date.now() - GRACE_PERIOD_MINUTES * 60 * 1000).toISOString();
    const { data, error } = await this.supabaseService.client
      .from('news_questions')
      .select('question, round_id')
      .eq('id', questionId)
      .gt('expires_at', graceTime)
      .maybeSingle();

    if (error || !data) return null;

    const q = (data as { question: Record<string, string>; round_id: string }).question;
    const roundId = (data as { round_id: string }).round_id;

    const mockQuestion = {
      category: 'NEWS' as const,
      correct_answer: q['correct_answer'],
      question_text: q['question_text'],
    } as GeneratedQuestion;

    const correct = this.answerValidator.validate(mockQuestion, answer);

    // Record answer with ON CONFLICT DO NOTHING (prevents duplicate via unique constraint)
    const { data: inserted, error: insertError } = await this.supabaseService.client
      .from('user_news_progress')
      .upsert({
        user_id: userId,
        question_id: questionId,
        answered_at: new Date().toISOString(),
        correct,
      }, { onConflict: 'user_id,question_id', ignoreDuplicates: true })
      .select('question_id');

    // If no row was inserted (duplicate), return null
    if (insertError || !inserted || inserted.length === 0) return null;

    // Update profile stats
    await this.supabaseService.incrementQuestionStats(userId, correct ? 1 : 0);

    // Update mode stats
    await this.upsertModeStats(userId, correct);

    // Check if round is complete and update streak
    await this.checkAndUpdateStreak(userId, roundId);

    return {
      correct,
      correct_answer: q['correct_answer'],
      explanation: q['explanation'] ?? '',
    };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async getActiveRound(): Promise<{ id: string; expires_at: string; question_count: number; created_at: string } | null> {
    const { data, error } = await this.supabaseService.client
      .from('news_rounds')
      .select('id, expires_at, question_count, created_at')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as { id: string; expires_at: string; question_count: number; created_at: string };
  }

  private async getRoundQuestionIds(roundId: string): Promise<string[]> {
    const { data } = await this.supabaseService.client
      .from('news_questions')
      .select('id')
      .eq('round_id', roundId);

    return (data ?? []).map((r: { id: string }) => r.id);
  }

  private async getStreakInfo(userId: string): Promise<{ current_streak: number; max_streak: number } | null> {
    const { data } = await this.supabaseService.client
      .from('user_news_streaks')
      .select('current_streak, max_streak')
      .eq('user_id', userId)
      .maybeSingle();

    return data as { current_streak: number; max_streak: number } | null;
  }

  private async checkAndUpdateStreak(userId: string, roundId: string): Promise<void> {
    // Check if user has answered at least 1 question in this round
    const roundQuestionIds = await this.getRoundQuestionIds(roundId);
    if (roundQuestionIds.length === 0) return;

    const { count } = await this.supabaseService.client
      .from('user_news_progress')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('question_id', roundQuestionIds);

    if (!count || count === 0) return;

    // Get current streak state
    const { data: streak } = await this.supabaseService.client
      .from('user_news_streaks')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const currentStreak = streak as {
      current_streak: number;
      max_streak: number;
      last_round_id: string | null;
      total_rounds_played: number;
      total_correct: number;
      total_answered: number;
    } | null;

    // If already counted this round, skip
    if (currentStreak?.last_round_id === roundId) return;

    // Count correct answers in this round
    const { data: answers } = await this.supabaseService.client
      .from('user_news_progress')
      .select('correct')
      .eq('user_id', userId)
      .in('question_id', roundQuestionIds);

    const roundCorrect = (answers ?? []).filter((a: { correct: boolean }) => a.correct).length;
    const roundAnswered = (answers ?? []).length;

    // Determine if streak continues
    // Streak continues if the previous round was yesterday's round
    let newStreak = 1;
    if (currentStreak && currentStreak.last_round_id) {
      const { data: lastRound } = await this.supabaseService.client
        .from('news_rounds')
        .select('created_at')
        .eq('id', currentStreak.last_round_id)
        .maybeSingle();

      if (lastRound) {
        const lastDate = new Date(lastRound.created_at).toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (lastDate === yesterday) {
          newStreak = currentStreak.current_streak + 1;
        }
      }
    }

    const newMax = Math.max(newStreak, currentStreak?.max_streak ?? 0);

    await this.supabaseService.client
      .from('user_news_streaks')
      .upsert({
        user_id: userId,
        current_streak: newStreak,
        max_streak: newMax,
        last_round_id: roundId,
        total_rounds_played: (currentStreak?.total_rounds_played ?? 0) + 1,
        total_correct: (currentStreak?.total_correct ?? 0) + roundCorrect,
        total_answered: (currentStreak?.total_answered ?? 0) + roundAnswered,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
  }

  private async upsertModeStats(userId: string, correct: boolean): Promise<void> {
    // Atomic upsert with increment via RPC
    const { error } = await this.supabaseService.client.rpc('upsert_news_mode_stats', {
      p_user_id: userId,
      p_correct: correct ? 1 : 0,
    });

    if (error) {
      // Fallback: read-modify-write
      const { data: current } = await this.supabaseService.client
        .from('user_mode_stats')
        .select('questions_answered, correct_answers, games_played')
        .eq('user_id', userId)
        .eq('mode', 'news')
        .maybeSingle();

      await this.supabaseService.client
        .from('user_mode_stats')
        .upsert({
          user_id: userId,
          mode: 'news',
          questions_answered: ((current as { questions_answered: number } | null)?.questions_answered ?? 0) + 1,
          correct_answers: ((current as { correct_answers: number } | null)?.correct_answers ?? 0) + (correct ? 1 : 0),
          games_played: (current as { games_played: number } | null)?.games_played ?? 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,mode' });
    }
  }

  private async fetchHeadlinesWithRetry(): Promise<import('../common/interfaces/news.interface').NewsHeadline[]> {
    for (let attempt = 1; attempt <= MAX_RSS_RETRIES; attempt++) {
      const headlines = await this.newsFetcher.fetchHeadlines();
      if (headlines.length > 0) return headlines;
      if (attempt < MAX_RSS_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000;
        this.logger.warn(`[fetchHeadlinesWithRetry] Attempt ${attempt} failed, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    this.logger.error('[fetchHeadlinesWithRetry] All retries exhausted');
    return [];
  }

  private getEndOfUtcDay(): string {
    const now = new Date();
    const endOfDay = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23, 59, 59, 999,
    ));
    return endOfDay.toISOString();
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
        .map((r) => this.normalizeKey(r.question.question_text!, r.question.correct_answer!)),
    );
  }

  private async getProcessedHeadlineUrls(): Promise<Set<string>> {
    const { data, error } = await this.supabaseService.client
      .from('news_questions')
      .select('headline_url')
      .not('headline_url', 'is', null);

    if (error) {
      this.logger.error(`[getProcessedHeadlineUrls] Error: ${error.message}`);
      return new Set();
    }

    return new Set(
      (data as Array<{ headline_url: string }>).map((r) => r.headline_url),
    );
  }

  private normalizeKey(questionText: string, correctAnswer: string): string {
    const norm = (s: string) =>
      s.toLowerCase()
        .replace(/[''""?.,!:;]/g, '')
        .replace(/\b(a|an|the|which|who|what|in|for|of|to|did|was|is|has|had)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return `${norm(questionText)}|||${norm(correctAnswer)}`;
  }
}
