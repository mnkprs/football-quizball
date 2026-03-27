import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EloService } from '../solo/elo.service';
import type { Difficulty } from '../common/interfaces/question.interface';
import type { LogoQuestion, LogoQuizAnswerResult } from './logo-quiz.types';

/**
 * Logo Quiz questions are seeded into question_pool with category='LOGO_QUIZ'.
 * The question JSONB shape:
 * {
 *   id: string,
 *   question_text: "Identify this football club from its logo",
 *   correct_answer: "Bayern Munich",
 *   explanation: "...",
 *   image_url: "https://...supabase.co/storage/.../easy.webp",
 *   category: "LOGO_QUIZ",
 *   difficulty: "EASY" | "MEDIUM" | "HARD",
 *   points: 10 | 20 | 30,
 *   meta: { slug, league, country, original_image_url }
 * }
 *
 * Mode-difficulty mapping:
 *   Logo Quiz standalone / Duel → EASY (image_url)
 *   Solo / BR / Blitz / 2P     → MEDIUM (medium_image_url)
 *   Mayhem                      → HARD (hard_image_url)
 */
@Injectable()
export class LogoQuizService {
  constructor(
    private supabaseService: SupabaseService,
    private eloService: EloService,
  ) {}

  /**
   * Get a random logo question at the given difficulty.
   * Draws from question_pool with category='LOGO_QUIZ'.
   */
  async getQuestion(
    userId: string,
    difficulty?: Difficulty,
  ): Promise<LogoQuestion> {
    // Get user's logo quiz ELO to determine difficulty
    const profile = await this.supabaseService.getProfile(userId);
    if (!profile) throw new NotFoundException('Profile not found');

    const logoElo = (profile as any).logo_quiz_elo ?? 1000;
    const diff = difficulty ?? this.eloService.getDifficultyForElo(logoElo);

    // Draw a question from the pool
    const client = (this.supabaseService as any).client;
    const { data, error } = await client.rpc('draw_questions', {
      p_category: 'LOGO_QUIZ',
      p_difficulty: diff,
      p_count: 1,
    });

    if (error || !data?.length) {
      // Fallback: try other difficulties
      for (const fallback of ['EASY', 'MEDIUM', 'HARD'] as Difficulty[]) {
        if (fallback === diff) continue;
        const { data: fb } = await client.rpc('draw_questions', {
          p_category: 'LOGO_QUIZ',
          p_difficulty: fallback,
          p_count: 1,
        });
        if (fb?.length) {
          const q = fb[0].question;
          return this.mapQuestion(q, fallback);
        }
      }
      throw new NotFoundException('No logo questions available');
    }

    const q = data[0].question;
    return this.mapQuestion(q, diff);
  }

  /**
   * Validate answer and update ELO.
   */
  async submitAnswer(
    userId: string,
    questionId: string,
    answer: string,
    timedOut = false,
  ): Promise<LogoQuizAnswerResult> {
    const profile = await this.supabaseService.getProfile(userId);
    if (!profile) throw new ForbiddenException('Profile not found');

    const logoElo = (profile as any).logo_quiz_elo ?? 1000;

    // Look up the question to get correct answer
    const client = (this.supabaseService as any).client;
    const { data } = await client
      .from('question_pool')
      .select('question, difficulty')
      .eq('category', 'LOGO_QUIZ')
      .filter('question->>id', 'eq', questionId)
      .limit(1)
      .single();

    if (!data) throw new NotFoundException('Question not found');

    const correctAnswer = data.question.correct_answer;
    const difficulty = data.difficulty as Difficulty;
    const correct = !timedOut && this.fuzzyMatch(answer, correctAnswer);

    // Calculate ELO change
    const eloChange = this.eloService.calculate(
      logoElo,
      difficulty,
      correct,
      timedOut,
      (profile as any).logo_quiz_games_played ?? 0,
    );
    const newElo = this.eloService.applyChange(logoElo, eloChange);

    // Atomic DB update
    await client.rpc('commit_logo_quiz_answer', {
      p_user_id: userId,
      p_elo_before: logoElo,
      p_elo_after: newElo,
      p_elo_change: eloChange,
      p_difficulty: difficulty,
      p_correct: correct,
      p_timed_out: timedOut,
    });

    return {
      correct,
      timed_out: timedOut,
      correct_answer: correctAnswer,
      elo_before: logoElo,
      elo_after: newElo,
      elo_change: eloChange,
    };
  }

  /**
   * Get all team names for the searchable select.
   */
  async getTeamNames(): Promise<string[]> {
    const client = (this.supabaseService as any).client;
    const { data } = await client
      .from('question_pool')
      .select('question')
      .eq('category', 'LOGO_QUIZ')
      .eq('difficulty', 'EASY'); // one per team

    if (!data) return [];
    const names: string[] = data.map(
      (row: any) => row.question?.correct_answer as string,
    );
    return [...new Set(names)].sort();
  }

  /**
   * Draw `count` unique random logo questions for team/battle-royale modes.
   * Returns the medium (degraded) image URL for gameplay and the original for reveal.
   * The question JSONB shape is documented at the top of this file.
   */
  async drawLogosForTeamMode(count: number): Promise<
    Array<{
      id: string;
      correct_answer: string;
      image_url: string;
      original_image_url: string;
      difficulty: string;
      meta: { slug: string; league: string; country: string };
    }>
  > {
    const client = (this.supabaseService as any).client;

    // Over-fetch so the random shuffle has enough candidates.
    const { data, error } = await client
      .from('question_pool')
      .select('id, question')
      .eq('category', 'LOGO_QUIZ')
      .limit(count * 4);

    if (error || !data || data.length === 0) {
      throw new NotFoundException('No logo questions available');
    }

    // Shuffle in-place then take the first `count` entries.
    const shuffled: Array<{ id: string; question: any }> = (data as Array<{ id: string; question: any }>)
      .slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, count);

    return shuffled.map((row) => {
      const q = row.question as any;
      return {
        id: row.id,
        correct_answer: q.correct_answer as string,
        // Prefer medium (degraded) URL for gameplay; fall back to image_url.
        image_url: (q.medium_image_url ?? q.image_url) as string,
        // Original un-degraded image for the reveal.
        original_image_url: (q.meta?.original_image_url ?? q.image_url) as string,
        difficulty: (q.difficulty ?? 'MEDIUM') as string,
        meta: {
          slug: (q.meta?.slug ?? '') as string,
          league: (q.meta?.league ?? '') as string,
          country: (q.meta?.country ?? '') as string,
        },
      };
    });
  }

  private mapQuestion(q: any, difficulty: Difficulty): LogoQuestion {
    return {
      id: q.id,
      team_name: q.correct_answer,
      slug: q.meta?.slug ?? '',
      league: q.meta?.league ?? '',
      country: q.meta?.country ?? '',
      difficulty,
      image_url: q.image_url,
      original_image_url: q.meta?.original_image_url ?? '',
    };
  }

  /**
   * Fuzzy match team name: normalize, check exact match, then Levenshtein.
   * Allows partial match (last word, first word).
   */
  public fuzzyMatch(submitted: string, correct: string): boolean {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();

    const a = normalize(submitted);
    const b = normalize(correct);

    if (!a) return false;

    // Exact match
    if (a === b) return true;

    // Check if submitted matches any word group (e.g. "Bayern" matches "Bayern Munich")
    const bWords = b.split(/\s+/);
    if (bWords.length > 1) {
      // Match last word (e.g. "Munich" for "Bayern Munich")
      if (a === bWords[bWords.length - 1]) return true;
      // Match first word
      if (a === bWords[0]) return true;
      // Match without common prefixes (FC, AC, etc.)
      const prefixes = ['fc', 'ac', 'as', 'sc', 'rc', 'cd', 'ca', 'cf', 'us', 'ss', 'sv', 'vfl', 'tsv', 'bsc', 'fk'];
      const stripped = bWords.filter((w) => !prefixes.includes(w)).join(' ');
      if (a === stripped) return true;
    }

    // Levenshtein distance
    const maxDist = a.length <= 4 ? 1 : a.length <= 8 ? 2 : 3;
    return this.levenshtein(a, b) <= maxDist;
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length,
      n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
  }
}
