import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { SessionStoreService } from '../session/session-store.service';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionPoolService } from '../questions/question-pool.service';
import { EloService } from './elo.service';
import { SoloQuestionGenerator } from './solo-question.generator';
import { SoloSession, SoloAnswerResult, TIME_LIMITS } from './solo.types';
import { AnswerValidator } from '../questions/validators/answer.validator';
import { AchievementsService } from '../achievements/achievements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { XpService } from '../xp/xp.service';
import { XP_VALUES } from '../xp/xp.constants';

const SESSION_TTL = 7200; // 2h

@Injectable()
export class SoloService {
  private readonly logger = new Logger(SoloService.name);

  constructor(
    private readonly sessionStore: SessionStoreService,
    private readonly supabaseService: SupabaseService,
    private readonly questionPoolService: QuestionPoolService,
    private readonly eloService: EloService,
    private readonly generator: SoloQuestionGenerator,
    private readonly answerValidator: AnswerValidator,
    private readonly achievementsService: AchievementsService,
    private readonly notificationsService: NotificationsService,
    private readonly xpService: XpService,
  ) {}

  private sessionKey(id: string) { return `solo:${id}`; }

  private async checkLeaderboardDisplacement(userId: string, oldElo: number, newElo: number): Promise<void> {
    // Only check if ELO actually increased
    if (newElo <= oldElo) return;

    const top10 = await this.supabaseService.getLeaderboard(10);

    // Find the user directly displaced: highest ELO in top 10 that is
    // below newElo but was above oldElo (i.e., someone we actually passed)
    const displaced = top10.find(
      (entry) => entry.id !== userId && entry.elo < newElo && entry.elo >= oldElo,
    );

    if (!displaced) return;

    // Dedup: check if we already notified this user about being displaced by us recently
    const existing = await this.supabaseService.client
      .from('notifications')
      .select('id')
      .eq('user_id', displaced.id)
      .eq('type', 'leaderboard_displaced')
      .gte('created_at', new Date(Date.now() - 24 * 3600000).toISOString())
      .limit(1);

    if (existing.data && existing.data.length > 0) return;

    const profile = await this.supabaseService.getProfile(userId);
    const username = profile?.username ?? 'Someone';

    await this.notificationsService.create({
      userId: displaced.id,
      type: 'leaderboard_displaced',
      title: `You were overtaken on Solo!`,
      body: `${username} passed you with ${newElo} ELO`,
      icon: '🏆',
      route: '/leaderboard',
      metadata: { displacedBy: userId, displacedByName: username, newElo },
    });
  }

  private async getSession(sessionId: string): Promise<SoloSession> {
    const session = await this.sessionStore.get<SoloSession>(this.sessionKey(sessionId));
    if (!session) throw new NotFoundException('Solo session not found or expired');
    return session;
  }

  async startSession(userId: string): Promise<{ session_id: string; user_elo: number }> {
    const profile = await this.supabaseService.getProfile(userId);
    if (!profile) throw new NotFoundException('User profile not found');

    const sessionId = crypto.randomUUID();
    this.logger.debug(JSON.stringify({ event: 'session_start', userId, userElo: profile.elo }));
    const session: SoloSession = {
      id: sessionId,
      userId,
      userElo: profile.elo,
      currentElo: profile.elo,
      currentQuestion: null,
      servedAt: null,
      questionsAnswered: 0,
      correctAnswers: 0,
      profileQuestionsAnswered: profile.questions_answered ?? 0,
      eloChanges: [],
      drawnQuestionIds: [],
      createdAt: new Date(),
    };
    await this.sessionStore.set(this.sessionKey(sessionId), session, SESSION_TTL);
    return { session_id: sessionId, user_elo: profile.elo };
  }

  async getNextQuestion(sessionId: string, userId: string): Promise<{
    question_id: string;
    question_text: string;
    category: string;
    difficulty: string;
    points: number;
    time_limit: number;
    questions_answered: number;
    current_elo: number;
  }> {
    const session = await this.getSession(sessionId);
    if (session.userId !== userId) throw new ForbiddenException();

    const difficulty = this.eloService.getDifficultyForElo(session.currentElo);
    const seenIds = await this.supabaseService.getSeenQuestionIds(userId).catch(() => [] as string[]);
    const question = await this.generator.generate(difficulty, session.currentElo, seenIds);
    const now = new Date();

    session.currentQuestion = question;
    session.drawnQuestionIds.push(question.id);
    session.servedAt = now;
    await this.sessionStore.set(this.sessionKey(sessionId), session, SESSION_TTL);

    // Fire-and-forget: record this question as seen for user dedup
    void this.supabaseService.recordSeenQuestion(userId, question.id).catch((err) =>
      this.logger.warn(`[getNextQuestion] recordSeenQuestion failed: ${err?.message}`),
    );

    return {
      question_id: question.id,
      question_text: question.question_text,
      category: question.category,
      difficulty: question.difficulty,
      points: question.points,
      time_limit: TIME_LIMITS[question.difficulty],
      questions_answered: session.questionsAnswered,
      current_elo: session.currentElo,
    };
  }

  async submitAnswer(sessionId: string, userId: string, answer: string): Promise<SoloAnswerResult> {
    const session = await this.getSession(sessionId);
    if (session.userId !== userId) throw new ForbiddenException();

    const question = session.currentQuestion;
    if (!question) throw new BadRequestException('No active question');
    if (!session.servedAt) throw new BadRequestException('Question not served yet');

    const timeLimit = TIME_LIMITS[question.difficulty];
    const elapsed = (Date.now() - new Date(session.servedAt).getTime()) / 1000;
    const timedOut = answer === 'TIMEOUT' || elapsed > timeLimit + 2; // 2s grace

    let correct = false;
    if (!timedOut) {
      correct = await this.answerValidator.validateAsync(
        { correct_answer: question.correct_answer, category: question.category } as any,
        answer,
      );
    }

    const eloBefore = session.currentElo;
    const totalQuestionsAnswered = session.profileQuestionsAnswered + session.questionsAnswered;
    const eloChange = this.eloService.calculate(eloBefore, question.difficulty, correct, timedOut, totalQuestionsAnswered);
    const eloAfter = this.eloService.applyChange(eloBefore, eloChange);

    session.currentElo = eloAfter;
    session.questionsAnswered += 1;
    if (correct) session.correctAnswers += 1;
    session.eloChanges.push(eloChange);
    session.currentQuestion = null;
    session.servedAt = null;

    // Atomic DB write: updates elo + inserts history in a single transaction
    await Promise.all([
      this.sessionStore.set(this.sessionKey(sessionId), session, SESSION_TTL),
      this.supabaseService.commitSoloAnswer({
        user_id: userId,
        elo_before: eloBefore,
        elo_after: eloAfter,
        elo_change: eloChange,
        difficulty: question.difficulty,
        correct,
        timed_out: timedOut,
      }),
    ]);

    // Award XP for the answer (and streak bonus on correct). Non-critical: failures fall through with zeros.
    const xpResult = await this.xpService.awardForAnswer(userId, correct, 'solo');
    let streakBonusAmount: number | undefined;
    if (correct) {
      const streakResult = await this.xpService.awardStreakBonus(userId, session.correctAnswers, 'solo');
      if (streakResult) {
        streakBonusAmount = streakResult.xp_gained;
        xpResult.total_xp = streakResult.total_xp;
        xpResult.level = streakResult.level;
        xpResult.leveled_up = xpResult.leveled_up || streakResult.leveled_up;
      }
    }

    this.logger.debug(JSON.stringify({
      event: 'answer_submitted',
      userId,
      correct,
      timedOut,
      difficulty: question.difficulty,
      elo_change: eloChange,
      elo_after: eloAfter,
    }));

    return {
      correct,
      timed_out: timedOut,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      elo_before: eloBefore,
      elo_after: eloAfter,
      elo_change: eloChange,
      questions_answered: session.questionsAnswered,
      correct_answers: session.correctAnswers,
      xp: {
        xp_gained: xpResult.xp_gained + (streakBonusAmount ?? 0),
        total_xp: xpResult.total_xp,
        level: xpResult.level,
        leveled_up: xpResult.leveled_up,
        ...(streakBonusAmount ? { streak_bonus: streakBonusAmount } : {}),
      },
    };
  }

  async endSession(sessionId: string, userId: string): Promise<{
    questions_answered: number;
    correct_answers: number;
    elo_start: number;
    elo_end: number;
    elo_delta: number;
    newly_unlocked: Array<{ id: string; name: string; description: string; icon: string; category: string }>;
  }> {
    const session = await this.getSession(sessionId);
    if (session.userId !== userId) throw new ForbiddenException();

    // Return drawn questions to pool so they can be reused in future sessions
    if (session.drawnQuestionIds.length > 0) {
      const returned = await this.questionPoolService.returnUnansweredToPool(session.drawnQuestionIds);
      if (returned > 0) {
        this.logger.debug(`[endSession] Returned ${returned} questions to pool for reuse`);
      }
    }

    // Increment games_played
    await this.supabaseService.incrementGamesPlayed(userId, session.questionsAnswered, session.correctAnswers);

    // Award XP for completing a solo session
    await this.xpService.award(userId, 'solo_complete', XP_VALUES.SOLO_COMPLETE, { mode: 'solo' });

    await this.sessionStore.del(this.sessionKey(sessionId));

    // Check achievements
    let newlyUnlocked: Array<{ id: string; name: string; description: string; icon: string; category: string }> = [];
    try {
      const profile = await this.supabaseService.getProfile(userId);
      if (profile) {
        const accuracy = session.questionsAnswered > 0
          ? Math.round((session.correctAnswers / session.questionsAnswered) * 100)
          : 0;

        const { current_daily_streak: dailyStreak, awarded_today: dailyStreakAwardedToday } = await this.supabaseService.updateDailyStreak(userId);
        // Daily streak XP: only on first activity of the day
        if (dailyStreakAwardedToday && dailyStreak > 0) {
          await this.xpService.award(userId, 'daily_streak', XP_VALUES.DAILY_STREAK, { streak: dailyStreak });
        }
        const totalQuestions = await this.supabaseService.incrementTotalQuestions(userId, session.questionsAnswered);
        const currentStreak = await this.supabaseService.getCorrectStreak(userId);
        await this.supabaseService.updateMaxCorrectStreak(userId, currentStreak);
        const modesPlayed = await this.supabaseService.addModePlayed(userId, 'solo');
        const perfectSession = session.questionsAnswered >= 5 && session.correctAnswers === session.questionsAnswered;

        const awardedIds = await this.achievementsService.checkAndAward(userId, {
          currentElo: session.currentElo,
          soloGamesPlayed: profile.games_played,
          soloAccuracy: accuracy,
          currentStreak,
          maxCorrectStreak: currentStreak,
          dailyStreak,
          totalQuestionsAllModes: totalQuestions,
          modesPlayed,
          perfectSoloSession: perfectSession,
        });
        newlyUnlocked = await this.achievementsService.getByIds(awardedIds);

        // Fire-and-forget: send achievement notifications
        for (const ach of newlyUnlocked) {
          void this.notificationsService.create({
            userId,
            type: 'achievement_unlocked',
            title: 'Achievement unlocked!',
            body: `${ach.name} — ${ach.description}`,
            icon: ach.icon || '🏅',
            route: '/profile',
            metadata: { achievementId: ach.id, achievementName: ach.name },
          }).catch((err) =>
            this.logger.warn(`[endSession] achievement notification failed: ${err?.message}`),
          );
        }
      }
    } catch { /* don't break session end if achievements fail */ }

    // Fire-and-forget: check leaderboard displacement (once per session, not per answer)
    if (session.currentElo !== session.userElo) {
      void this.checkLeaderboardDisplacement(userId, session.userElo, session.currentElo).catch((err) =>
        this.logger.warn(`[endSession] leaderboard displacement check failed: ${err?.message}`),
      );
    }

    this.logger.debug(JSON.stringify({
      event: 'session_end',
      userId,
      questionsAnswered: session.questionsAnswered,
      correctAnswers: session.correctAnswers,
      elo_start: session.userElo,
      elo_end: session.currentElo,
      elo_delta: session.currentElo - session.userElo,
    }));

    return {
      questions_answered: session.questionsAnswered,
      correct_answers: session.correctAnswers,
      elo_start: session.userElo,
      elo_end: session.currentElo,
      elo_delta: session.currentElo - session.userElo,
      newly_unlocked: newlyUnlocked,
    };
  }
}
