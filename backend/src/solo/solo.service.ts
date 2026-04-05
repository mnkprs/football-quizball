import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { SessionStoreService } from '../session/session-store.service';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionPoolService } from '../questions/question-pool.service';
import { EloService } from './elo.service';
import { SoloQuestionGenerator } from './solo-question.generator';
import { SoloSession, SoloAnswerResult, TIME_LIMITS } from './solo.types';
import { AnswerValidator } from '../questions/validators/answer.validator';
import { AchievementsService } from '../achievements/achievements.service';

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
  ) {}

  private sessionKey(id: string) { return `solo:${id}`; }

  private async getSession(sessionId: string): Promise<SoloSession> {
    const session = await this.sessionStore.get<SoloSession>(this.sessionKey(sessionId));
    if (!session) throw new NotFoundException('Solo session not found or expired');
    return session;
  }

  async startSession(userId: string): Promise<{ session_id: string; user_elo: number }> {
    const profile = await this.supabaseService.getProfile(userId);
    if (!profile) throw new NotFoundException('User profile not found');

    const sessionId = crypto.randomUUID();
    this.logger.log(JSON.stringify({ event: 'session_start', userId, userElo: profile.elo }));
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
    this.logger.log(JSON.stringify({
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
        this.logger.log(`[endSession] Returned ${returned} questions to pool for reuse`);
      }
    }

    // Increment games_played
    await this.supabaseService.incrementGamesPlayed(userId, session.questionsAnswered, session.correctAnswers);
    await this.sessionStore.del(this.sessionKey(sessionId));

    // Check achievements
    let newlyUnlocked: Array<{ id: string; name: string; description: string; icon: string; category: string }> = [];
    try {
      const profile = await this.supabaseService.getProfile(userId);
      if (profile) {
        const accuracy = session.questionsAnswered > 0
          ? Math.round((session.correctAnswers / session.questionsAnswered) * 100)
          : 0;
        const awardedIds = await this.achievementsService.checkAndAward(userId, {
          currentElo: session.currentElo,
          soloGamesPlayed: profile.games_played,
          soloAccuracy: accuracy,
        });
        newlyUnlocked = await this.achievementsService.getByIds(awardedIds);
      }
    } catch { /* don't break session end if achievements fail */ }

    this.logger.log(JSON.stringify({
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
