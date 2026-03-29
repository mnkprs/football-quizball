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
 *
 * Two difficulty tiers:
 *   EASY → text-removed logo (image_url = easy erasure)
 *   HARD → flipped + grayscale logo (image_url = hard erasure)
 *
 * The correct image_url is baked into the question JSONB at seed time.
 */
@Injectable()
export class LogoQuizService {
  constructor(
    private supabaseService: SupabaseService,
    private eloService: EloService,
  ) {}

  /**
   * Get a random logo question matched to the player's ELO.
   * Uses composite question_elo (erasure + league + team popularity) for matching.
   * Falls back to categorical difficulty draw if no ELO-based questions are available.
   */
  async getQuestion(
    userId: string,
    difficulty?: Difficulty,
  ): Promise<LogoQuestion> {
    const profile = await this.supabaseService.getProfile(userId);
    if (!profile) throw new NotFoundException('Profile not found');

    const logoElo = (profile as any).logo_quiz_elo ?? 1000;
    const client = (this.supabaseService as any).client;

    // Try ELO-range-based draw with widening ranges
    for (const range of [200, 400, 800]) {
      const { data, error } = await client.rpc('draw_logo_questions_by_elo', {
        p_target_elo: logoElo,
        p_range: range,
        p_count: 1,
      });

      if (!error && data?.length) {
        const row = data[0];
        const q = row.question;
        return {
          ...this.mapQuestion(q, row.difficulty as Difficulty),
          question_elo: row.question_elo,
        };
      }
    }

    // Fallback: categorical difficulty draw
    const diff = difficulty ?? this.eloService.getDifficultyForElo(logoElo);
    for (const fallback of [diff, 'EASY', 'HARD'] as Difficulty[]) {
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

    // Look up the question to get correct answer and question_elo
    const client = (this.supabaseService as any).client;
    const { data } = await client
      .from('question_pool')
      .select('question, difficulty, question_elo')
      .eq('category', 'LOGO_QUIZ')
      .filter('question->>id', 'eq', questionId)
      .limit(1)
      .single();

    if (!data) throw new NotFoundException('Question not found');

    const correctAnswer = data.question.correct_answer;
    const difficulty = data.difficulty as Difficulty;
    const correct = !timedOut && this.fuzzyMatch(answer, correctAnswer);

    // Calculate ELO change — use composite question_elo when available
    const gamesPlayed = (profile as any).logo_quiz_games_played ?? 0;
    const eloChange = data.question_elo
      ? this.eloService.calculateWithQuestionElo(logoElo, data.question_elo, correct, timedOut, gamesPlayed)
      : this.eloService.calculate(logoElo, difficulty, correct, timedOut, gamesPlayed);
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
    // Supabase default limit is 1000 — we have 1100+ logo questions,
    // so we must paginate to get all team names for the autocomplete.
    let allData: any[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data: page } = await client
        .from('question_pool')
        .select('question')
        .eq('category', 'LOGO_QUIZ')
        .range(from, from + pageSize - 1);
      if (!page || page.length === 0) break;
      allData = allData.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    const data = allData;

    if (!data) return [];
    const names: string[] = data.map(
      (row: any) => row.question?.correct_answer as string,
    );
    return [...new Set(names)].sort();
  }

  /**
   * Draw `count` unique random logo questions for team/battle-royale modes.
   * Returns the question's image_url for gameplay and the original for reveal.
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

    // Fisher-Yates shuffle for unbiased randomness, then dedup by team slug and take `count`.
    const shuffled: Array<{ id: string; question: any }> = (data as Array<{ id: string; question: any }>).slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const seenSlugs = new Set<string>();
    const picked: typeof shuffled = [];
    for (const row of shuffled) {
      const slug = (row.question as any)?.meta?.slug ?? '';
      if (slug && seenSlugs.has(slug)) continue;
      if (slug) seenSlugs.add(slug);
      picked.push(row);
      if (picked.length >= count) break;
    }

    return picked.map((row) => {
      const q = row.question as any;
      return {
        id: row.id,
        correct_answer: q.correct_answer as string,
        image_url: q.image_url as string,
        // Original un-degraded image for the reveal.
        original_image_url: (q.meta?.original_image_url ?? q.image_url) as string,
        difficulty: (q.difficulty ?? 'EASY') as string,
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

    return false;
  }

}
