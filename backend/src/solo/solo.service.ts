import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { SupabaseService } from '../supabase/supabase.service';
import { EloService } from './elo.service';
import { SoloQuestionGenerator } from './solo-question.generator';
import { SoloSession, SoloAnswerResult, TIME_LIMITS } from './solo.types';
import { AnswerValidator } from '../questions/validators/answer.validator';

const SESSION_TTL = 7200; // 2h

@Injectable()
export class SoloService {
  private readonly logger = new Logger(SoloService.name);

  constructor(
    private cacheService: CacheService,
    private supabaseService: SupabaseService,
    private eloService: EloService,
    private generator: SoloQuestionGenerator,
    private answerValidator: AnswerValidator,
  ) {}

  private sessionKey(id: string) { return `solo:${id}`; }

  private getSession(sessionId: string): SoloSession {
    const session = this.cacheService.get<SoloSession>(this.sessionKey(sessionId));
    if (!session) throw new NotFoundException('Solo session not found or expired');
    return session;
  }

  async startSession(userId: string): Promise<{ session_id: string; user_elo: number }> {
    const profile = await this.supabaseService.getProfile(userId);
    if (!profile) throw new NotFoundException('User profile not found');

    const sessionId = crypto.randomUUID();
    const session: SoloSession = {
      id: sessionId,
      userId,
      userElo: profile.elo,
      currentElo: profile.elo,
      currentQuestion: null,
      servedAt: null,
      questionsAnswered: 0,
      correctAnswers: 0,
      eloChanges: [],
      createdAt: new Date(),
    };
    this.cacheService.set(this.sessionKey(sessionId), session, SESSION_TTL);
    return { session_id: sessionId, user_elo: profile.elo };
  }

  async getNextQuestion(sessionId: string, userId: string): Promise<{
    question_id: string;
    question_text: string;
    difficulty: string;
    time_limit: number;
    questions_answered: number;
    current_elo: number;
  }> {
    const session = this.getSession(sessionId);
    if (session.userId !== userId) throw new ForbiddenException();

    const difficulty = this.eloService.getDifficultyForElo(session.currentElo);
    const question = await this.generator.generate(difficulty, session.currentElo);
    const now = new Date();

    session.currentQuestion = question;
    session.servedAt = now;
    this.cacheService.set(this.sessionKey(sessionId), session, SESSION_TTL);

    return {
      question_id: question.id,
      question_text: question.question_text,
      difficulty: question.difficulty,
      time_limit: TIME_LIMITS[question.difficulty],
      questions_answered: session.questionsAnswered,
      current_elo: session.currentElo,
    };
  }

  async submitAnswer(sessionId: string, userId: string, answer: string): Promise<SoloAnswerResult> {
    const session = this.getSession(sessionId);
    if (session.userId !== userId) throw new ForbiddenException();

    const question = session.currentQuestion;
    if (!question) throw new BadRequestException('No active question');
    if (!session.servedAt) throw new BadRequestException('Question not served yet');

    const timeLimit = TIME_LIMITS[question.difficulty];
    const elapsed = (Date.now() - new Date(session.servedAt).getTime()) / 1000;
    const timedOut = answer === 'TIMEOUT' || elapsed > timeLimit + 2; // 2s grace

    let correct = false;
    if (!timedOut) {
      // Use the existing answer validator logic — create a fake GeneratedQuestion
      correct = this.answerValidator.validate(
        { correct_answer: question.correct_answer, category: 'HISTORY' } as any,
        answer,
      );
    }

    const eloBefore = session.currentElo;
    const eloChange = this.eloService.calculate(eloBefore, question.difficulty, correct, timedOut);
    const eloAfter = this.eloService.applyChange(eloBefore, eloChange);

    session.currentElo = eloAfter;
    session.questionsAnswered += 1;
    if (correct) session.correctAnswers += 1;
    session.eloChanges.push(eloChange);
    session.currentQuestion = null;
    session.servedAt = null;
    this.cacheService.set(this.sessionKey(sessionId), session, SESSION_TTL);

    // Persist ELO change to Supabase
    await this.supabaseService.updateElo(userId, eloAfter);
    await this.supabaseService.insertEloHistory({
      user_id: userId,
      elo_before: eloBefore,
      elo_after: eloAfter,
      elo_change: eloChange,
      question_difficulty: question.difficulty,
      correct,
      timed_out: timedOut,
    });

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
  }> {
    const session = this.getSession(sessionId);
    if (session.userId !== userId) throw new ForbiddenException();

    // Increment games_played
    await this.supabaseService.incrementGamesPlayed(userId, session.questionsAnswered, session.correctAnswers);
    this.cacheService.del(this.sessionKey(sessionId));

    return {
      questions_answered: session.questionsAnswered,
      correct_answers: session.correctAnswers,
      elo_start: session.userElo,
      elo_end: session.currentElo,
      elo_delta: session.currentElo - session.userElo,
    };
  }
}
