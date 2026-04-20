import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SessionStoreService } from '../session/session-store.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AchievementsService } from '../achievements/achievements.service';
import { XpService } from '../xp/xp.service';
import { XP_VALUES } from '../xp/xp.constants';
import { BlitzSession, BlitzQuestion, BlitzQuestionRef, BlitzAnswerResult } from './blitz.types';

const SESSION_TTL = 3600; // 1h
const BLITZ_DURATION_MS = 60_000;
const DRAW_COUNT = 70;   // enough for the fastest possible 60s session

@Injectable()
export class BlitzService {
  private readonly logger = new Logger(BlitzService.name);

  constructor(
    private readonly sessionStore: SessionStoreService,
    private readonly supabaseService: SupabaseService,
    private readonly achievementsService: AchievementsService,
    private readonly xpService: XpService,
  ) {}

  private sessionKey(id: string) { return `blitz:${id}`; }

  private async getSession(sessionId: string): Promise<BlitzSession> {
    const session = await this.sessionStore.get<BlitzSession>(this.sessionKey(sessionId));
    if (!session) throw new NotFoundException('Blitz session not found or expired');
    return session;
  }

  private toRef(q: BlitzQuestion): BlitzQuestionRef {
    return {
      question_id: q.poolRowId,
      question_text: q.question_text,
      choices: q.choices,
      category: q.category,
      difficulty: q.difficulty,
    };
  }

  async startSession(userId: string): Promise<{
    session_id: string;
    time_limit: number;
    first_question: BlitzQuestionRef;
  }> {
    const profile = await this.supabaseService.getProfile(userId);
    if (!profile) throw new NotFoundException('User profile not found');

    // Check if user has seen ≥95% of the pool — reset if so
    const [totalCount, seenCount] = await Promise.all([
      this.supabaseService.countBlitzPool(),
      this.supabaseService.countUserSeenBlitz(userId),
    ]);
    if (totalCount > 0 && seenCount / totalCount >= 0.95) {
      await this.supabaseService.client.rpc('reset_blitz_seen_for_user', { p_user_id: userId });
      this.logger.debug(`[blitz] Reset seen pool for ${userId} (exhausted ${seenCount}/${totalCount})`);
    }

    const questions = await this.drawBlitzQuestions(userId);
    if (questions.length === 0) {
      throw new NotFoundException('Not enough questions in pool for Blitz mode. Please try again later.');
    }

    const sessionId = crypto.randomUUID();
    const session: BlitzSession = {
      id: sessionId,
      userId,
      username: profile.username,
      questions,
      drawnIds: questions.map((q) => q.poolRowId),
      currentIndex: 0,
      score: 0,
      totalAnswered: 0,
      startTime: Date.now(),
      saved: false,
    };
    await this.sessionStore.set(this.sessionKey(sessionId), session, SESSION_TTL);
    this.logger.debug(JSON.stringify({ event: 'blitz_session_start', userId, questionCount: questions.length }));

    return {
      session_id: sessionId,
      time_limit: 60,
      first_question: this.toRef(questions[0]),
    };
  }

  async submitAnswer(
    sessionId: string,
    userId: string,
    answer: string,
  ): Promise<BlitzAnswerResult> {
    const session = await this.getSession(sessionId);
    if (session.userId !== userId) throw new ForbiddenException();

    const elapsed = Date.now() - session.startTime;
    const timeUp = elapsed >= BLITZ_DURATION_MS;

    const question = session.questions[session.currentIndex];
    let correct = false;

    if (question && !timeUp) {
      // Multiple choice: exact match (case-insensitive trim)
      correct = answer.trim().toLowerCase() === question.correct_answer.trim().toLowerCase();
    }

    if (question) {
      session.score += correct ? 1 : 0;
      session.totalAnswered += 1;
      session.currentIndex += 1;
      // Fire-and-forget: award XP for the answer
      void this.xpService.awardForAnswer(userId, correct, 'blitz').catch((err) =>
        this.logger.warn(`[blitz] XP award failed: ${err?.message}`),
      );
      // Fire-and-forget: bump per-question outcome counters. Blitz doesn't time
      // out individual answers (the whole session has a 60s timer), so timed_out=false.
      void this.supabaseService.recordAnswerOutcome(question.poolRowId, correct, false, null).catch(() => {});
    }

    const nextQ = timeUp || session.currentIndex >= session.questions.length
      ? null
      : session.questions[session.currentIndex];

    if (timeUp && !session.saved) {
      session.saved = true;
      // Mark only answered questions as seen
      const answeredIds = session.drawnIds.slice(0, session.totalAnswered);
      if (answeredIds.length > 0) {
        await this.supabaseService.client.rpc('mark_blitz_questions_seen', {
          p_user_id: userId,
          p_question_ids: answeredIds,
        });
      }
      await this.supabaseService.upsertMaxBlitzScore(userId, session.score, session.totalAnswered);
      this.logger.debug(`[blitz] Saved score for ${session.username}: ${session.score}/${session.totalAnswered}`);
    }

    await this.sessionStore.set(this.sessionKey(sessionId), session, SESSION_TTL);

    return {
      correct,
      correct_answer: question?.correct_answer ?? '',
      score: session.score,
      total_answered: session.totalAnswered,
      time_up: timeUp,
      next_question: nextQ ? this.toRef(nextQ) : null,
    };
  }

  async endSession(sessionId: string, userId: string): Promise<{
    score: number;
    total_answered: number;
    newly_unlocked: Array<{ id: string; name: string; description: string; icon: string; category: string }>;
  }> {
    const session = await this.getSession(sessionId);
    if (session.userId !== userId) throw new ForbiddenException();

    if (!session.saved) {
      session.saved = true;
      const answeredIds = session.drawnIds.slice(0, session.totalAnswered);
      if (answeredIds.length > 0) {
        await this.supabaseService.client.rpc('mark_blitz_questions_seen', {
          p_user_id: userId,
          p_question_ids: answeredIds,
        });
      }
      await this.supabaseService.upsertMaxBlitzScore(userId, session.score, session.totalAnswered);
    }

    // Increment profile-level questions_answered / correct_answers
    await this.supabaseService.incrementQuestionStats(userId, session.score, session.totalAnswered);

    // Award BLITZ_COMPLETE XP for finishing a session
    void this.xpService.award(userId, 'blitz_complete', XP_VALUES.BLITZ_COMPLETE, { mode: 'blitz' }).catch((err) =>
      this.logger.warn(`[blitz] BLITZ_COMPLETE XP award failed: ${err?.message}`),
    );

    await this.sessionStore.del(this.sessionKey(sessionId));
    this.logger.debug(JSON.stringify({ event: 'blitz_session_end', userId, score: session.score, totalAnswered: session.totalAnswered }));

    let newlyUnlocked: Array<{ id: string; name: string; description: string; icon: string; category: string }> = [];
    try {
      const { current_daily_streak: dailyStreak } = await this.supabaseService.updateDailyStreak(userId);
      const totalQuestions = await this.supabaseService.incrementTotalQuestions(userId, session.totalAnswered);
      const modesPlayed = await this.supabaseService.addModePlayed(userId, 'blitz');

      const awardedIds = await this.achievementsService.checkAndAward(userId, {
        blitzBestScore: session.score,
        dailyStreak,
        totalQuestionsAllModes: totalQuestions,
        modesPlayed,
      });
      newlyUnlocked = await this.achievementsService.getByIds(awardedIds);
    } catch { /* don't break session end if achievements fail */ }

    return { score: session.score, total_answered: session.totalAnswered, newly_unlocked: newlyUnlocked };
  }

  getLeaderboard(): Promise<any[]> {
    return this.supabaseService.getBlitzLeaderboard(5);
  }

  getMyLeaderboardEntry(userId: string): Promise<any> {
    return this.supabaseService.getBlitzLeaderboardEntryForUser(userId);
  }

  async getMyBlitzStats(userId: string): Promise<{ bestScore: number; totalGames: number; rank: number | null }> {
    const stats = await this.supabaseService.getBlitzStatsForUser(userId);
    return stats ?? { bestScore: 0, totalGames: 0, rank: null };
  }

  /**
   * Draw N random Blitz-style questions (4 choices, MC) for a Battle Royale room.
   * Uses question_pool — no per-user seen tracking.
   */
  async drawForRoom(n: number = 20): Promise<BlitzQuestion[]> {
    const { data, error } = await this.supabaseService.client.rpc(
      'draw_blitz_from_question_pool',
      { p_count: n, p_language: 'en' },
    );
    if (error) {
      this.logger.error(`[battle-royale] Pool draw error: ${error.message}`);
      return [];
    }
    type PoolRow = {
      id: string;
      category: string;
      raw_score: number;
      question: { question_text: string; correct_answer: string; wrong_choices?: string[]; meta?: Record<string, unknown> };
    };
    const rows = (data ?? []) as PoolRow[];
    return rows.map((row) => {
      const correctAnswer = row.question.correct_answer;
      const otherRows = rows.filter((r) => r.id !== row.id);
      const choices = this.buildChoices(correctAnswer, row.question.wrong_choices, row.category, otherRows);
      return {
        poolRowId: row.id,
        question_text: row.question.question_text,
        correct_answer: correctAnswer,
        choices,
        category: row.category,
        difficulty: this.scoreToLabel(row.raw_score),
        meta: row.question.meta,
      };
    });
  }

  private async drawBlitzQuestions(userId: string): Promise<BlitzQuestion[]> {
    const { data, error } = await this.supabaseService.client.rpc(
      'draw_blitz_for_user_from_question_pool',
      { p_user_id: userId, p_count: DRAW_COUNT },
    );

    if (error) {
      this.logger.error(`[blitz] Pool draw error: ${error.message}`);
      return [];
    }

    const rows = (data ?? []) as Array<{
      id: string;
      category: string;
      raw_score: number;
      question: { question_text: string; correct_answer: string; wrong_choices?: string[] };
    }>;

    // All rows serve as both session questions and distractor pool for each other
    return rows.map((row) => {
      const correctAnswer = row.question.correct_answer;
      const otherRows = rows.filter((r) => r.id !== row.id);
      const choices = this.buildChoices(correctAnswer, row.question.wrong_choices, row.category, otherRows);
      return {
        poolRowId: row.id,
        question_text: row.question.question_text,
        correct_answer: correctAnswer,
        choices,
        category: row.category,
        difficulty: this.scoreToLabel(row.raw_score),
      };
    });
  }

  /** Deduplicate strings by normalized value (lowercase), keeping first occurrence. */
  private dedupeStrings(arr: string[]): string[] {
    const seen = new Set<string>();
    return arr.filter((s) => {
      const key = s.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private shuffle<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  private scoreToLabel(score: number): string {
    if (score <= 33) return 'EASY';
    if (score <= 66) return 'MEDIUM';
    return 'HARD';
  }

  /** Build 4 choices: correct + 3 wrong. Prefer LLM wrong_choices when present, else pick from pool. */
  private buildChoices(
    correct: string,
    wrongChoices: string[] | undefined,
    category: string,
    pool: Array<{ category: string; question: { correct_answer: string } }>,
  ): string[] {
    const normCorrect = correct.trim().toLowerCase();
    const fromLlm = wrongChoices?.length
      ? this.dedupeStrings(
          wrongChoices
            .filter((s) => s.trim().toLowerCase() !== normCorrect)
            .map((s) => s.trim())
            .filter(Boolean),
        ).slice(0, 3)
      : [];
    const distractors = fromLlm.length >= 3 ? fromLlm : this.pickChoicesFromPool(correct, category, pool);
    return this.shuffle([correct, ...distractors.slice(0, 3)]);
  }

  private pickChoicesFromPool(
    correct: string,
    category: string,
    pool: Array<{ category: string; question: { correct_answer: string } }>,
  ): string[] {
    // Prefer distractors from same category, then any category
    const sameCat = pool.filter(
      (r) => r.category === category && r.question.correct_answer.toLowerCase() !== correct.toLowerCase(),
    );
    const others = pool.filter(
      (r) => r.category !== category && r.question.correct_answer.toLowerCase() !== correct.toLowerCase(),
    );

    // Shuffle to avoid order bias
    const candidates = this.shuffle([...sameCat, ...others]);
    const distractors: string[] = [];
    const seen = new Set<string>([correct.toLowerCase()]);

    for (const c of candidates) {
      if (distractors.length >= 3) break;
      const ans = c.question.correct_answer;
      if (!seen.has(ans.toLowerCase())) {
        seen.add(ans.toLowerCase());
        distractors.push(ans);
      }
    }

    // Fallback: pad with generic football answers if pool was too small
    const fallbacks = ['FC Barcelona', 'Real Madrid', 'Manchester United', 'Liverpool', 'Bayern Munich', 'Juventus'];
    for (const f of fallbacks) {
      if (distractors.length >= 3) break;
      if (!seen.has(f.toLowerCase())) {
        seen.add(f.toLowerCase());
        distractors.push(f);
      }
    }

    return distractors.slice(0, 3);
  }
}
