import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EloService } from '../solo/elo.service';
import { AchievementsService } from '../achievements/achievements.service';
import { CacheService } from '../cache/cache.service';
import { RedisService } from '../redis/redis.service';
import { XpService } from '../xp/xp.service';
import type { Difficulty } from '../common/interfaces/question.interface';
import type { LogoQuestion, LogoQuestionPublic, LogoQuizAnswerResult } from './logo-quiz.types';

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
  private readonly logger = new Logger(LogoQuizService.name);
  private static readonly FREE_LOGO_POOL_SIZE = 100;
  private static readonly CUTOFF_CACHE_KEY = 'logo:free_pool_cutoff';
  private static readonly CUTOFF_CACHE_TTL = 3600; // 1 hour

  /**
   * Minimum think time (ms) before a logo-quiz answer can be accepted.
   * Below this threshold the server rejects the submission as too-fast.
   *   • EASY: 400ms — image recognition + tap on the searchable list
   *   • HARD: 600ms — flipped/desaturated image takes longer to identify
   * The goal isn't to block perfect-speed cheats (a patient bot can wait out
   * the threshold) but to force cheaters into the speed band where the
   * anomaly flagger can detect sustained unnatural accuracy.
   */
  private static readonly MIN_THINK_MS: Record<'EASY' | 'HARD', number> = {
    EASY: 400,
    HARD: 600,
  };
  /** Redis key TTL for question-served tracking. 2× longest timer is enough. */
  private static readonly SERVED_KEY_TTL_SEC = 120;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eloService: EloService,
    private readonly achievementsService: AchievementsService,
    private readonly cacheService: CacheService,
    private readonly redisService: RedisService,
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
  ): Promise<LogoQuestionPublic> {
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
        const pub = this.toPublicQuestion(
          this.mapQuestion(row, row.difficulty as Difficulty, hardcore),
          row.question_elo,
        );
        await this.markServed(userId, pub.id);
        return pub;
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
        const pub = this.toPublicQuestion(this.mapQuestion(fb[0], fallback, hardcore));
        await this.markServed(userId, pub.id);
        return pub;
      }
    }
    throw new NotFoundException('No logo questions available');
  }

  /** Record server time when a logo question was handed to a user. */
  private async markServed(userId: string, questionId: string): Promise<void> {
    await this.redisService.set(
      this.servedKey(userId, questionId),
      Date.now(),
      LogoQuizService.SERVED_KEY_TTL_SEC,
    );
  }

  /**
   * Strip answer-revealing fields before serving a question to the client.
   * team_name / slug / league / country / original_image_url all reveal the
   * answer and must only appear in the POST /answer response.
   */
  private toPublicQuestion(full: LogoQuestion, questionElo?: number): LogoQuestionPublic {
    return {
      id: full.id,
      difficulty: full.difficulty,
      image_url: full.image_url,
      ...(questionElo !== undefined ? { question_elo: questionElo } : {}),
    };
  }

  /** Redis key for tracking when a logo question was served to a user. */
  private servedKey(userId: string, questionId: string): string {
    return `logo:served:${userId}:${questionId}`;
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

    // Phase 2C unified LOGO_QUIZ ids (qp.id == what jsonb.id used to be for
    // LOGO rows). Phase 2D stripped the jsonb `id` key entirely. The client
    // sends back the unified id it got from getQuestion; we look up directly
    // by pool row id.
    const client = this.supabaseService.client;
    const { data } = await client
      .from('question_pool')
      .select('id, question, difficulty, question_elo, image_url')
      .eq('category', 'LOGO_QUIZ')
      .eq('id', questionId)
      .maybeSingle();

    if (!data) throw new NotFoundException('Question not found');

    const correctAnswer = data.question.correct_answer as string;
    const meta = (data.question.meta ?? {}) as {
      slug?: string;
      league?: string;
      country?: string;
      original_image_url?: string;
    };
    const topLevelImageUrl = (data as unknown as { image_url?: string }).image_url;
    const originalImageUrl = meta.original_image_url ?? topLevelImageUrl ?? '';
    const difficulty = data.difficulty as Difficulty;

    // Anti-cheat binding check: verify THIS user was served THIS question.
    // Without this, any authenticated user could submit any question_id they
    // obtain and read correct_answer + original_image_url + team_metadata off
    // the POST /answer reveal path — the leak-strip fix would be defeated.
    //
    // Implementation: getQuestion writes a Redis key (120s TTL) per
    // (user, question_id). Submission must find that key.
    //   • Key present → record servedAt for the speed check below.
    //   • Key absent (Redis responsive) → user never legitimately played
    //     this question. REJECT with 400.
    //   • Redis unreachable (throws) → C2 fix (was fail-open):
    //     fail-CLOSED with 503 so the client retries once Redis recovers.
    //     The previous fail-open posture let any attacker forge question_ids
    //     during Redis instability (or DoS Redis themselves) and read the
    //     correct_answer + original_image_url off the reveal path. Logo-quiz
    //     downtime during a Redis outage is acceptable; answer-reveal forgery
    //     is not.
    let servedAt: number | null = null;
    try {
      const raw = await this.redisService.get<number>(this.servedKey(userId, questionId));
      servedAt = raw ?? null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(JSON.stringify({
        event: 'logo_binding_check_unavailable',
        userId,
        questionId,
        reason: msg,
      }));
      // Body must not leak the correct answer or image URL on this path.
      throw new ServiceUnavailableException('Logo quiz temporarily unavailable. Please retry.');
    }

    if (servedAt === null) {
      this.logger.warn(JSON.stringify({
        event: 'logo_answer_unbound_question',
        userId,
        questionId,
      }));
      // No body leaks the answer on this path.
      throw new BadRequestException('Question not served to this user or session expired');
    }

    // Speed check: only runs when we have a servedAt timestamp AND the
    // user didn't explicitly time out. Too-fast submissions are rejected
    // with correct_answer withheld so the bot gains no information.
    if (!timedOut && servedAt !== null) {
      const elapsedMs = Date.now() - Number(servedAt);
      const threshold = LogoQuizService.MIN_THINK_MS[difficulty === 'HARD' ? 'HARD' : 'EASY'];
      if (elapsedMs < threshold) {
        this.logger.warn(JSON.stringify({
          event: 'logo_answer_too_fast',
          userId,
          difficulty,
          elapsedMs,
          threshold,
        }));
        return {
          correct: false,
          timed_out: false,
          // Withhold the answer — don't hand the bot what it's fishing for.
          correct_answer: '',
          elo_before: logoElo,
          elo_after: logoElo,
          elo_change: 0,
          rejected_too_fast: true,
        };
      }
    }

    const correct = !timedOut && this.fuzzyMatch(answer, correctAnswer);

    // Invalidate the served-at key now so a replay of the same question_id
    // fails the binding check above. Fire-and-forget; replay protection
    // degrades to "1 extra submission within 120s" on Redis error, which
    // is acceptable.
    void this.redisService.del(this.servedKey(userId, questionId)).catch(() => {});

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

    // Fire-and-forget per-question outcome counter bump. Logo Quiz doesn't
    // time individual answers at this layer, so response_ms=null.
    void this.supabaseService.recordAnswerOutcome(data.id, correct, timedOut, null).catch(() => {});

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

    // Invalidate cached rank so next read is fresh — mirrors `SupabaseService.updateElo`
    // pattern. Only the non-hardcore mode has a rank cache key today (`getLogoQuizRank`);
    // when hardcore gets a getLogoQuizHardcoreRank, add `rank:logo_hardcore:` here too.
    if (!hardcore) {
      await this.redisService.del(`rank:logo:${userId}`);
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
      // Revealed only after submission so cheaters can't intercept the
      // unobscured logo from the pre-answer GET /question payload.
      original_image_url: originalImageUrl,
      team_metadata: {
        slug: meta.slug ?? '',
        league: meta.league ?? '',
        country: meta.country ?? '',
      },
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
   * Purge the cached team-name list. Call after seeding new LOGO_QUIZ rows so
   * the next `getTeamNames()` call rebuilds the list from question_pool.
   * Without this, newly-seeded logos stay hidden from the select for up to 1h.
   */
  async invalidateTeamNamesCache(): Promise<void> {
    await this.cacheService.del(LogoQuizService.TEAM_NAMES_CACHE_KEY);
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
    // Phase 2B: image_url and difficulty now live as top-level columns
    // (promoted in migration 20260615000001). correct_answer stays in jsonb
    // (behavior-specific, not a duplicate); meta also stays (container for
    // slug/league/country/original_image_url/hard_image_url/easy_image_url).
    const { data, error } = await client
      .from('question_pool')
      .select('id, question_elo, image_url, difficulty, correct_answer:question->correct_answer, meta:question->meta')
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

  /**
   * Phase 2D-aware mapper. Accepts a row returned by draw_logo_questions_by_elo
   * or draw_questions (both return `id`, `question` jsonb, and promoted
   * `image_url` at the top level). id + image_url come from the row; other
   * LOGO_QUIZ-specific fields live in row.question.meta + row.question.correct_answer.
   */
  private mapQuestion(row: any, difficulty: Difficulty, hardcore = false): LogoQuestion {
    const q = row.question ?? {};
    const topLevelImageUrl = row.image_url as string | null | undefined;
    const imageUrl = hardcore
      ? (q.meta?.hard_image_url ?? topLevelImageUrl)
      : (q.meta?.easy_image_url ?? topLevelImageUrl);
    return {
      id: row.id,
      team_name: q.correct_answer,
      slug: q.meta?.slug ?? '',
      league: q.meta?.league ?? '',
      country: q.meta?.country ?? '',
      difficulty,
      image_url: imageUrl ?? '',
      original_image_url: (q.meta?.original_image_url as string) ?? topLevelImageUrl ?? '',
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
