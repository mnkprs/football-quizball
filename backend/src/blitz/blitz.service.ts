import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AnswerValidator } from '../questions/validators/answer.validator';
import { BlitzSession, BlitzQuestion, BlitzAnswerResult } from './blitz.types';

const SESSION_TTL = 3600; // 1h
const BLITZ_DURATION_MS = 60_000;
const DRAW_COUNT = 30;
const SESSION_SIZE = 20;

@Injectable()
export class BlitzService {
  private readonly logger = new Logger(BlitzService.name);

  constructor(
    private cacheService: CacheService,
    private supabaseService: SupabaseService,
    private answerValidator: AnswerValidator,
  ) {}

  private sessionKey(id: string) { return `blitz:${id}`; }

  private getSession(sessionId: string): BlitzSession {
    const session = this.cacheService.get<BlitzSession>(this.sessionKey(sessionId));
    if (!session) throw new NotFoundException('Blitz session not found or expired');
    return session;
  }

  async startSession(userId: string): Promise<{
    session_id: string;
    time_limit: number;
    first_question: { question_id: string; question_text: string; category: string; difficulty: string };
  }> {
    const profile = await this.supabaseService.getProfile(userId);
    if (!profile) throw new NotFoundException('User profile not found');

    const questions = await this.drawBlitzQuestions();
    if (questions.length === 0) {
      throw new NotFoundException('Not enough questions in pool for Blitz mode. Please try again later.');
    }

    const sessionId = crypto.randomUUID();
    const session: BlitzSession = {
      id: sessionId,
      userId,
      username: profile.username,
      questions,
      currentIndex: 0,
      score: 0,
      totalAnswered: 0,
      startTime: Date.now(),
      saved: false,
    };
    this.cacheService.set(this.sessionKey(sessionId), session, SESSION_TTL);

    const first = questions[0];
    return {
      session_id: sessionId,
      time_limit: 60,
      first_question: {
        question_id: first.poolRowId,
        question_text: first.question_text,
        category: first.category,
        difficulty: first.difficulty,
      },
    };
  }

  async submitAnswer(
    sessionId: string,
    userId: string,
    answer: string,
  ): Promise<BlitzAnswerResult> {
    const session = this.getSession(sessionId);
    if (session.userId !== userId) throw new ForbiddenException();

    const elapsed = Date.now() - session.startTime;
    const timeUp = elapsed >= BLITZ_DURATION_MS;

    const question = session.questions[session.currentIndex];
    let correct = false;

    if (question && !timeUp) {
      correct = this.answerValidator.validate(
        { correct_answer: question.correct_answer, category: question.category } as any,
        answer,
      );
    }

    if (question) {
      session.score += correct ? 1 : 0;
      session.totalAnswered += 1;
      session.currentIndex += 1;
    }

    const nextQ = timeUp || session.currentIndex >= session.questions.length
      ? null
      : session.questions[session.currentIndex];

    if (timeUp && !session.saved) {
      session.saved = true;
      await this.supabaseService.insertBlitzScore({
        user_id: userId,
        username: session.username,
        score: session.score,
        total_answered: session.totalAnswered,
      });
      this.logger.log(`[blitz] Saved score for ${session.username}: ${session.score}/${session.totalAnswered}`);
    }

    this.cacheService.set(this.sessionKey(sessionId), session, SESSION_TTL);

    return {
      correct,
      correct_answer: question?.correct_answer ?? '',
      score: session.score,
      total_answered: session.totalAnswered,
      time_up: timeUp,
      next_question: nextQ
        ? {
            question_id: nextQ.poolRowId,
            question_text: nextQ.question_text,
            category: nextQ.category,
            difficulty: nextQ.difficulty,
          }
        : null,
    };
  }

  async endSession(sessionId: string, userId: string): Promise<{
    score: number;
    total_answered: number;
  }> {
    const session = this.getSession(sessionId);
    if (session.userId !== userId) throw new ForbiddenException();

    if (!session.saved) {
      session.saved = true;
      await this.supabaseService.insertBlitzScore({
        user_id: userId,
        username: session.username,
        score: session.score,
        total_answered: session.totalAnswered,
      });
    }

    this.cacheService.del(this.sessionKey(sessionId));
    return { score: session.score, total_answered: session.totalAnswered };
  }

  async getLeaderboard(): Promise<any[]> {
    return this.supabaseService.getBlitzLeaderboard(20);
  }

  private async drawBlitzQuestions(): Promise<BlitzQuestion[]> {
    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('id, category, difficulty, question')
      .neq('category', 'TOP_5')
      .in('difficulty', ['EASY', 'MEDIUM'])
      .limit(DRAW_COUNT);

    if (error) {
      this.logger.error(`[blitz] Pool query error: ${error.message}`);
      return [];
    }

    const rows = (data ?? []) as Array<{
      id: string;
      category: string;
      difficulty: string;
      question: { question_text: string; correct_answer: string };
    }>;

    // Fisher-Yates shuffle
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }

    return rows.slice(0, SESSION_SIZE).map((row) => ({
      poolRowId: row.id,
      question_text: row.question.question_text,
      correct_answer: row.question.correct_answer,
      category: row.category,
      difficulty: row.difficulty,
    }));
  }
}
