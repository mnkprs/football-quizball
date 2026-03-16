import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { SupabaseService } from '../supabase/supabase.service';
import { EloService } from '../solo/elo.service';
import type { Difficulty } from '../questions/question.types';

const SESSION_TTL = 7200;

interface MayhemQuestion {
  id: string;
  question_text: string;
  correct_answer: string;
  explanation: string;
  difficulty: Difficulty;
}

interface MayhemSession {
  id: string;
  userId: string;
  userElo: number;
  currentElo: number;
  language: string;
  currentQuestion: MayhemQuestion | null;
  servedAt: Date | null;
  questionsAnswered: number;
  correctAnswers: number;
  createdAt: Date;
}

@Injectable()
export class MayhemSessionService {
  private readonly logger = new Logger(MayhemSessionService.name);

  constructor(
    private cacheService: CacheService,
    private supabaseService: SupabaseService,
    private eloService: EloService,
  ) {}

  private sessionKey(id: string) { return `mayhem:${id}`; }

  private getSession(sessionId: string): MayhemSession {
    const session = this.cacheService.get<MayhemSession>(this.sessionKey(sessionId));
    if (!session) throw new NotFoundException('Mayhem session not found or expired');
    return session;
  }

  async startSession(userId: string, language = 'en'): Promise<{ session_id: string; user_elo: number }> {
    const stats = await this.supabaseService.getMayhemStats(userId);
    const userElo = stats?.current_elo ?? 1000;

    const sessionId = crypto.randomUUID();
    const session: MayhemSession = {
      id: sessionId,
      userId,
      userElo,
      currentElo: userElo,
      language,
      currentQuestion: null,
      servedAt: null,
      questionsAnswered: 0,
      correctAnswers: 0,
      createdAt: new Date(),
    };
    this.cacheService.set(this.sessionKey(sessionId), session, SESSION_TTL);
    return { session_id: sessionId, user_elo: userElo };
  }

  async submitAnswer(
    sessionId: string,
    userId: string,
    questionId: string,
    selectedAnswer: string,
    lang = 'en',
  ): Promise<{
    correct: boolean;
    timed_out: boolean;
    correct_answer: string;
    explanation: string;
    elo_before: number;
    elo_after: number;
    elo_change: number;
    questions_answered: number;
    correct_answers: number;
    current_elo: number;
  }> {
    const session = this.getSession(sessionId);
    if (session.userId !== userId) throw new ForbiddenException();

    // Fetch the question to verify answer
    const { data, error } = await (this.supabaseService.client as any)
      .from('mayhem_questions')
      .select('question, translations')
      .eq('id', questionId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error || !data) throw new NotFoundException('Question not found or expired');

    const q = (data as { question: Record<string, string>; translations?: Record<string, Record<string, string>> }).question;
    const t = lang !== 'en' ? (data as { translations?: Record<string, Record<string, string>> }).translations?.[lang] : undefined;

    const correctAnswer = t?.['correct_answer'] ?? q['correct_answer'] ?? '';
    const explanation = t?.['explanation'] ?? q['explanation'] ?? '';
    const rawDifficulty = (q['difficulty'] as string | undefined)?.toUpperCase();
    const difficulty: Difficulty = (rawDifficulty === 'EASY' || rawDifficulty === 'MEDIUM' || rawDifficulty === 'HARD')
      ? rawDifficulty
      : 'MEDIUM';

    const timedOut = selectedAnswer === 'TIMEOUT';
    const correct = !timedOut && selectedAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();

    const eloBefore = session.currentElo;
    const eloChange = this.eloService.calculate(eloBefore, difficulty, correct, timedOut);
    const eloAfter = this.eloService.applyChange(eloBefore, eloChange);

    session.currentElo = eloAfter;
    session.questionsAnswered += 1;
    if (correct) session.correctAnswers += 1;
    session.currentQuestion = null;
    session.servedAt = null;
    this.cacheService.set(this.sessionKey(sessionId), session, SESSION_TTL);

    return {
      correct,
      timed_out: timedOut,
      correct_answer: correctAnswer,
      explanation,
      elo_before: eloBefore,
      elo_after: eloAfter,
      elo_change: eloChange,
      questions_answered: session.questionsAnswered,
      correct_answers: session.correctAnswers,
      current_elo: eloAfter,
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

    // Persist stats to DB
    await this.supabaseService.upsertMayhemStats(userId, {
      current_elo: session.currentElo,
      max_elo: session.currentElo,
      best_session_score: session.correctAnswers,
      games_played_increment: 1,
      questions_increment: session.questionsAnswered,
      correct_increment: session.correctAnswers,
    });

    this.cacheService.del(this.sessionKey(sessionId));

    return {
      questions_answered: session.questionsAnswered,
      correct_answers: session.correctAnswers,
      elo_start: session.userElo,
      elo_end: session.currentElo,
      elo_delta: session.currentElo - session.userElo,
    };
  }

  async getLeaderboard(): Promise<Array<{
    user_id: string; username: string; current_elo: number; max_elo: number; games_played: number;
  }>> {
    return this.supabaseService.getMayhemLeaderboard(10);
  }

  async getMyEntry(userId: string): Promise<{
    user_id: string; username: string; current_elo: number; max_elo: number;
    games_played: number; rank: number; best_session_score: number;
  } | null> {
    const [stats, profile, rank] = await Promise.all([
      this.supabaseService.getMayhemStats(userId),
      this.supabaseService.getProfile(userId),
      this.supabaseService.getMayhemRank(userId),
    ]);
    if (!profile || !stats) return null;
    return {
      user_id: userId,
      username: profile.username,
      current_elo: stats.current_elo,
      max_elo: stats.max_elo,
      games_played: stats.games_played,
      rank,
      best_session_score: stats.best_session_score,
    };
  }
}
