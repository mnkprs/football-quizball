import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EloService } from '../solo/elo.service';
import { AchievementsService } from '../achievements/achievements.service';
import { CacheService } from '../cache/cache.service';
import { XpService } from '../xp/xp.service';
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
  private static readonly FREE_LOGO_POOL_SIZE = 100;
  private static readonly CUTOFF_CACHE_KEY = 'logo:free_pool_cutoff';
  private static readonly CUTOFF_CACHE_TTL = 3600; // 1 hour

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eloService: EloService,
    private readonly achievementsService: AchievementsService,
    private readonly cacheService: CacheService,
    private readonly xpService: XpService,
  ) {}

  async getFreePoolCutoff(): Promise<number | null> {
    const cached = await this.cacheService.get<number>(LogoQuizService.CUTOFF_CACHE_KEY);
    if (cached !== undefined) return cached;

    const { data, error } = await this.supabaseService.client.rpc('get_free_logo_cutoff', {
      p_pool_size: LogoQuizService.FREE_LOGO_POOL_SIZE,
    });

    if (error || data === null || data === undefined) return null;
    const cutoff = data as number;
    await this.cacheService.set(LogoQuizService.CUTOFF_CACHE_KEY, cutoff, LogoQuizService.CUTOFF_CACHE_TTL);
    return cutoff;
  }

  /**
   * Get a random logo question matched to the player's ELO.
   * Uses composite question_elo (erasure + league + team popularity) for matching.
   * Falls back to categorical difficulty draw if no ELO-based questions are available.
   */
  async getQuestion(
    userId: string,
    difficulty?: Difficulty,
    hardcore = false,
  ): Promise<LogoQuestion> {
    const profile = await this.supabaseService.getProfile(userId);
    if (!profile) throw new NotFoundException('Profile not found');

    // Determine if user is pro — if not, restrict to free pool
    const proStatus = await this.supabaseService.getProStatus(userId);
    const isPro = proStatus?.is_pro ?? false;
    const maxElo = isPro ? null : await this.getFreePoolCutoff();

    const logoElo = hardcore ? profile.logo_quiz_hardcore_elo : profile.logo_quiz_elo;
    const client = this.supabaseService.client;

    // Try ELO-range-based draw with widening ranges
    for (const range of [200, 400, 800]) {
      const { data, error } = await client.rpc('draw_logo_questions_by_elo', {
        p_target_elo: logoElo,
        p_range: range,
        p_count: 1,
        p_max_elo: maxElo,
      });

      if (!error && data?.length) {
        const row = data[0];
        const q = row.question;
        return {
          ...this.mapQuestion(q, row.difficulty as Difficulty, hardcore),
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
        p_max_elo: maxElo,
      });
      if (fb?.length) {
        const q = fb[0].question;
        return this.mapQuestion(q, fallback, hardcore);
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
    hardcore = false,
  ): Promise<LogoQuizAnswerResult> {
    const profile = await this.supabaseService.getProfile(userId);
    if (!profile) throw new ForbiddenException('Profile not found');

    const logoElo = hardcore ? profile.logo_quiz_hardcore_elo : profile.logo_quiz_elo;

    // Look up the question to get correct answer, question_elo, and the pool row's
    // primary key (needed for elo_history.question_id FK — distinct from the JSONB's
    // inner id that the client sends).
    const client = this.supabaseService.client;
    const { data } = await client
      .from('question_pool')
      .select('id, question, difficulty, question_elo')
      .eq('category', 'LOGO_QUIZ')
      .filter('question->>id', 'eq', questionId)
      .limit(1)
      .single();

    if (!data) throw new NotFoundException('Question not found');

    const correctAnswer = data.question.correct_answer;
    const difficulty = data.difficulty as Difficulty;
    const correct = !timedOut && this.fuzzyMatch(answer, correctAnswer);

    // Calculate ELO change — use composite question_elo when available
    const gamesPlayed = hardcore ? profile.logo_quiz_hardcore_games_played : profile.logo_quiz_games_played;
    const eloChange = data.question_elo
      ? this.eloService.calculateWithQuestionElo(logoElo, data.question_elo, correct, timedOut, gamesPlayed)
      : this.eloService.calculate(logoElo, difficulty, correct, timedOut, gamesPlayed);
    let newElo = this.eloService.applyChange(logoElo, eloChange);

    // Clamp ELO at free pool cutoff for non-pro users
    let eloCapped = false;
    const proStatus = await this.supabaseService.getProStatus(userId);
    const isPro = proStatus?.is_pro ?? false;
    if (!isPro) {
      const cutoff = await this.getFreePoolCutoff();
      if (cutoff !== null && newElo > cutoff) {
        newElo = cutoff;
        eloCapped = true;
      }
    }

    // Atomic DB update — use the correct RPC for normal vs hardcore
    const rpcName = hardcore ? 'commit_logo_quiz_hardcore_answer' : 'commit_logo_quiz_answer';
    const rpcMode = hardcore ? 'logo_quiz_hardcore' : 'logo_quiz';
    const { error: rpcError } = await client.rpc(rpcName, {
      p_user_id: userId,
      p_elo_before: logoElo,
      p_elo_after: newElo,
      p_elo_change: newElo - logoElo,
      p_difficulty: difficulty,
      p_correct: correct,
      p_timed_out: timedOut,
      p_question_id: data.id,
      p_mode: rpcMode,
    });

    if (rpcError) {
      console.error(`${rpcName} RPC failed:`, rpcError);
      // Fallback: direct update if RPC fails
      const eloCol = hardcore ? 'logo_quiz_hardcore_elo' : 'logo_quiz_elo';
      const gamesCol = hardcore ? 'logo_quiz_hardcore_games_played' : 'logo_quiz_games_played';
      await client
        .from('profiles')
        .update({ [eloCol]: newElo, [gamesCol]: gamesPlayed + 1 })
        .eq('id', userId);
    }

    // Increment profile-level questions_answered / correct_answers
    await this.supabaseService.incrementQuestionStats(userId, correct ? 1 : 0);

    // Fire-and-forget: award XP for the answer
    void this.xpService.awardForAnswer(userId, correct, 'logo_quiz').catch(() => {});

    // Track logo quiz correct count for achievements
    if (correct) {
      void this.supabaseService.incrementLogoQuizCorrect(userId).catch(() => {});
    }

    return {
      correct,
      timed_out: timedOut,
      correct_answer: correctAnswer,
      elo_before: logoElo,
      elo_after: newElo,
      elo_change: newElo - logoElo,
      ...(eloCapped ? { elo_capped: true } : {}),
    };
  }

  async checkAchievements(userId: string, sessionCorrect = 0): Promise<{
    newly_unlocked: Array<{ id: string; name: string; description: string; icon: string; category: string }>;
  }> {
    try {
      const profile = await this.supabaseService.getProfile(userId);
      if (!profile) return { newly_unlocked: [] };
      const { current_daily_streak: dailyStreak } = await this.supabaseService.updateDailyStreak(userId);
      const modesPlayed = await this.supabaseService.addModePlayed(userId, 'logo_quiz');

      const awardedIds = await this.achievementsService.checkAndAward(userId, {
        currentElo: profile.logo_quiz_elo,
        // Only evaluate logo-quiz-correct achievements when the session contributed correct answers
        logoQuizCorrect: sessionCorrect > 0 ? profile.logo_quiz_correct : 0,
        dailyStreak,
        modesPlayed,
      });
      const newlyUnlocked = await this.achievementsService.getByIds(awardedIds);
      return { newly_unlocked: newlyUnlocked };
    } catch {
      return { newly_unlocked: [] };
    }
  }

  private static readonly TEAM_NAMES_CACHE_KEY = 'logo:team_names';
  private static readonly TEAM_NAMES_CACHE_TTL = 3600; // 1 hour

  /**
   * Get all team names for the searchable select.
   * Cached in Redis for 1 hour to avoid repeated full-table scans.
   */
  async getTeamNames(): Promise<string[]> {
    const cached = await this.cacheService.get<string[]>(LogoQuizService.TEAM_NAMES_CACHE_KEY);
    if (cached) return cached;

    const client = this.supabaseService.client;
    // Select only the correct_answer field from the JSONB — not the entire question object.
    let allData: any[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data: page } = await client
        .from('question_pool')
        .select('correct_answer:question->correct_answer')
        .eq('category', 'LOGO_QUIZ')
        .range(from, from + pageSize - 1);
      if (!page || page.length === 0) break;
      allData = allData.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    if (!allData.length) return [];
    const names: string[] = allData.map(
      (row: any) => row.correct_answer as string,
    );
    const sorted = [...new Set(names)].sort();
    await this.cacheService.set(LogoQuizService.TEAM_NAMES_CACHE_KEY, sorted, LogoQuizService.TEAM_NAMES_CACHE_TTL);
    return sorted;
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
      question_elo?: number;
      meta: { slug: string; league: string; country: string };
    }>
  > {
    const client = this.supabaseService.client;

    // Over-fetch so the random shuffle has enough candidates.
    // Select only the JSONB fields we need instead of the entire question object.
    const { data, error } = await client
      .from('question_pool')
      .select('id, question_elo, correct_answer:question->correct_answer, image_url:question->image_url, difficulty:question->difficulty, meta:question->meta')
      .eq('category', 'LOGO_QUIZ')
      .limit(count * 4);

    if (error || !data || data.length === 0) {
      throw new NotFoundException('No logo questions available');
    }

    // Fisher-Yates shuffle for unbiased randomness, then dedup by team slug and take `count`.
    // With the flattened select, JSONB fields are at the top level (correct_answer, image_url, etc.)
    const shuffled = (data as any[]).slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const seenSlugs = new Set<string>();
    const picked: any[] = [];
    for (const row of shuffled) {
      const meta = row.meta as Record<string, unknown> | undefined;
      const slug = (meta?.slug as string) ?? '';
      if (slug && seenSlugs.has(slug)) continue;
      if (slug) seenSlugs.add(slug);
      picked.push(row);
      if (picked.length >= count) break;
    }

    return picked.map((row) => {
      const meta = row.meta as Record<string, unknown> | undefined;
      return {
        id: (row.id as string) ?? '',
        correct_answer: (row.correct_answer as string) ?? '',
        image_url: (row.image_url as string) ?? '',
        original_image_url: ((meta?.original_image_url ?? row.image_url) as string) ?? '',
        difficulty: ((row.difficulty as string) ?? 'EASY'),
        question_elo: row.question_elo ?? undefined,
        meta: {
          slug: ((meta?.slug as string) ?? ''),
          league: ((meta?.league as string) ?? ''),
          country: ((meta?.country as string) ?? ''),
        },
      };
    });
  }

  private mapQuestion(q: any, difficulty: Difficulty, hardcore = false): LogoQuestion {
    const imageUrl = hardcore
      ? (q.meta?.hard_image_url ?? q.image_url)
      : (q.meta?.easy_image_url ?? q.image_url);
    return {
      id: q.id,
      team_name: q.correct_answer,
      slug: q.meta?.slug ?? '',
      league: q.meta?.league ?? '',
      country: q.meta?.country ?? '',
      difficulty,
      image_url: imageUrl,
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
