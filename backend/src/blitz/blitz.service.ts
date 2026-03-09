import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { SupabaseService } from '../supabase/supabase.service';
import { BlitzSession, BlitzQuestion, BlitzQuestionRef, BlitzAnswerResult } from './blitz.types';

const SESSION_TTL = 3600; // 1h
const BLITZ_DURATION_MS = 60_000;
const DRAW_COUNT = 50;   // enough for session + distractor pool
const SESSION_SIZE = 20;

@Injectable()
export class BlitzService {
  private readonly logger = new Logger(BlitzService.name);

  constructor(
    private cacheService: CacheService,
    private supabaseService: SupabaseService,
  ) {}

  private sessionKey(id: string) { return `blitz:${id}`; }

  private getSession(sessionId: string): BlitzSession {
    const session = this.cacheService.get<BlitzSession>(this.sessionKey(sessionId));
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
    const session = this.getSession(sessionId);
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
      next_question: nextQ ? this.toRef(nextQ) : null,
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
    const { data, error } = await this.supabaseService.client.rpc('draw_blitz_questions_v2', {
      p_count: DRAW_COUNT,
    });

    if (error) {
      this.logger.error(`[blitz] Pool draw error: ${error.message}`);
      return [];
    }

    const rows = (data ?? []) as Array<{
      id: string;
      category: string;
      difficulty_score: number;
      question: { question_text: string; correct_answer: string; wrong_choices?: string[] };
    }>;

    const sessionRows = rows.slice(0, SESSION_SIZE);
    const distractorPool = rows.slice(SESSION_SIZE);

    return sessionRows.map((row) => {
      const correctAnswer = row.question.correct_answer;
      const choices = this.buildChoices(correctAnswer, row.question.wrong_choices, row.category, distractorPool);
      return {
        poolRowId: row.id,
        question_text: row.question.question_text,
        correct_answer: correctAnswer,
        choices,
        category: row.category,
        difficulty: this.scoreToLabel(row.difficulty_score),
      };
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

  /** Build 3 choices: correct + 2 wrong. Prefer LLM wrong_choices when present, else pick from pool. */
  private buildChoices(
    correct: string,
    wrongChoices: string[] | undefined,
    category: string,
    pool: Array<{ category: string; question: { correct_answer: string } }>,
  ): string[] {
    const fromLlm = wrongChoices?.length === 2
      ? wrongChoices.filter((s) => s.trim().toLowerCase() !== correct.trim().toLowerCase()).slice(0, 2)
      : [];
    const distractors = fromLlm.length >= 2 ? fromLlm : this.pickChoicesFromPool(correct, category, pool);
    const choices = [correct, ...distractors.slice(0, 2)];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return choices;
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

    // Shuffle to avoid order bias — otherwise the first few answers in the pool
    // (e.g. Giovanni Simeone) get picked as distractors for almost every question
    const candidates = this.shuffle([...sameCat, ...others]);
    const distractors: string[] = [];
    const seen = new Set<string>([correct.toLowerCase()]);

    for (const c of candidates) {
      if (distractors.length >= 2) break;
      const ans = c.question.correct_answer;
      if (!seen.has(ans.toLowerCase())) {
        seen.add(ans.toLowerCase());
        distractors.push(ans);
      }
    }

    // Fallback: pad with generic football answers if pool was too small
    const fallbacks = ['FC Barcelona', 'Real Madrid', 'Manchester United', 'Liverpool', 'Bayern Munich', 'Juventus'];
    for (const f of fallbacks) {
      if (distractors.length >= 2) break;
      if (!seen.has(f.toLowerCase())) {
        seen.add(f.toLowerCase());
        distractors.push(f);
      }
    }

    return distractors.slice(0, 2);
  }
}
