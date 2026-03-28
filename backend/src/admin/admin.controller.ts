import { Controller, Delete, Get, Post, Put, Query, Param, HttpCode, HttpStatus, Logger, UseGuards, Header, Body, NotFoundException } from '@nestjs/common';
import { QuestionPoolService } from '../questions/question-pool.service';
import { AdminScriptsService } from './admin-scripts.service';
import { MigratePoolDifficultyService } from '../questions/migrate-pool-difficulty.service';
import { ThresholdConfigService, type ScoreThresholds } from '../questions/threshold-config.service';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { GENERATION_VERSION } from '../questions/config/generation-version.config';
import { BotMatchmakerService } from '../bot/bot-matchmaker.service';
import { BotOnlineGameRunner } from '../bot/bot-online-game-runner.service';
import { AdminStatsService } from './admin-stats.service';
import { ErrorLogService } from './error-log.service';
import { SupabaseService } from '../supabase/supabase.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('api/admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private questionPoolService: QuestionPoolService,
    private adminScriptsService: AdminScriptsService,
    private migratePoolDifficultyService: MigratePoolDifficultyService,
    private thresholdConfig: ThresholdConfigService,
    private botMatchmaker: BotMatchmakerService,
    private botOnlineRunner: BotOnlineGameRunner,
    private adminStatsService: AdminStatsService,
    private errorLogService: ErrorLogService,
    private supabaseService: SupabaseService,
  ) {}

  /**
   * Get paginated questions by raw_score range.
   * Example: GET /api/admin/pool-questions?min=0.2&max=0.3&page=1&limit=20&search=...&category=HISTORY&difficulty=EASY&generation_version=1.0.5
   */
  @Get('pool-questions')
  @UseGuards(AdminApiKeyGuard)
  async getPoolQuestions(
    @Query('min') minRaw?: string,
    @Query('max') maxRaw?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('difficulty') difficulty?: string,
    @Query('generation_version') generationVersion?: string,
  ) {
    const min = parseFloat(minRaw ?? '0');
    const max = parseFloat(maxRaw ?? '0.1');
    const p = Math.max(1, parseInt(page ?? '1', 10));
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10)));
    const q = (search ?? '').trim() || undefined;
    const cat = (category ?? '').trim() || undefined;
    const diff = (difficulty ?? '').trim() || undefined;
    const ver = (generationVersion ?? '').trim() || undefined;
    return this.questionPoolService.getPoolQuestionsByRange(min, max, p, l, q, cat, diff, ver);
  }

  /**
   * List seed-pool sessions (runs) with timestamps and counts.
   * Example: GET /api/admin/seed-pool-sessions
   *          GET /api/admin/seed-pool-sessions?generation_version=1.0.5
   */
  @Get('seed-pool-sessions')
  @UseGuards(AdminApiKeyGuard)
  async getSeedPoolSessions(@Query('generation_version') generationVersion?: string) {
    const ver = (generationVersion ?? '').trim() || undefined;
    return this.questionPoolService.getSeedPoolSessions(ver);
  }

  /**
   * Get questions generated in a specific seed-pool session.
   * Example: GET /api/admin/seed-pool-sessions/:id/questions
   */
  @Get('seed-pool-sessions/:id/questions')
  @UseGuards(AdminApiKeyGuard)
  async getSessionQuestions(@Param('id') id: string) {
    return this.questionPoolService.getSessionQuestions(id);
  }

  /**
   * Get distinct generation_version values from question_pool (for filter dropdown).
   * Example: GET /api/admin/pool-generation-versions
   */
  @Get('pool-generation-versions')
  @UseGuards(AdminApiKeyGuard)
  async getPoolGenerationVersions() {
    return this.questionPoolService.getPoolGenerationVersions();
  }

  /**
   * Get raw score heatmap stats + seed pool stats for the admin dashboard.
   * - rawScoreStats: total rows, avg raw score per slot (from question_pool)
   * - seedPoolStats: unanswered/answered per slot (from get_seed_pool_stats RPC)
   * Example: GET /api/admin/pool-stats
   *          GET /api/admin/pool-stats?generation_version=1.0.5
   */
  @Get('pool-stats')
  @UseGuards(AdminApiKeyGuard)
  async getPoolStats(@Query('generation_version') generationVersion?: string) {
    const version = (generationVersion ?? '').trim() || undefined;
    const [rawScoreStats, seedPoolStats] = await Promise.all([
      this.questionPoolService.getPoolRawScoreStats(version),
      this.questionPoolService.getSeedPoolStats(version),
    ]);
    return {
      ...rawScoreStats,
      seedPoolStats,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Bulk seed the question pool. Fills each (category, difficulty) slot to the target count.
   * Example: POST /api/admin/seed-pool?target=100
   */
  @Post('seed-pool')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async seedPool(@Query('target') target?: string) {
    const n = parseInt(String(target || '100').replace(/^--/, ''), 10);
    const count = Number.isNaN(n) ? 100 : Math.min(500, Math.max(1, n));
    this.logger.log(`[seed-pool] Request received: target=${count}`);
    const { results, sessionId, questionIds } = await this.questionPoolService.seedPool(count, true);
    return {
      target: count,
      generationVersion: GENERATION_VERSION,
      results,
      totalAdded: results.reduce((sum, r) => sum + r.added, 0),
      sessionId,
      questionIds,
    };
  }

  /**
   * Verify factual integrity of pool questions (LLM + web search).
   * Requires ENABLE_INTEGRITY_VERIFICATION=true.
   * Example: POST /api/admin/verify-pool-integrity?limit=100
   *          POST /api/admin/verify-pool-integrity?limit=50&apply=true&category=GUESS_SCORE
   *          POST /api/admin/verify-pool-integrity?version=1.0.5&apply=true
   *          POST /api/admin/verify-pool-integrity with body { "questionIds": ["uuid1", ...] } to verify specific questions (e.g. from seed-pool)
   */
  @Post('verify-pool-integrity')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async verifyPoolIntegrity(
    @Query('limit') limitRaw?: string,
    @Query('category') category?: string,
    @Query('version') version?: string,
    @Query('apply') applyRaw?: string,
    @Body() body?: { questionIds?: string[] },
  ) {
    const limit = Math.min(1000, Math.max(1, parseInt(limitRaw ?? '100', 10) || 100));
    const apply = applyRaw === 'true' || applyRaw === '1';
    const cat = (category ?? '').trim().toUpperCase() || undefined;
    const ver = (version ?? '').trim() || undefined;
    const questionIds = Array.isArray(body?.questionIds) ? body.questionIds.filter(Boolean) : undefined;
    return this.questionPoolService.verifyPoolIntegrity({
      limit,
      category: cat as import('../common/interfaces/question.interface').QuestionCategory | undefined,
      version: ver,
      apply,
      questionIds,
    });
  }

  /**
   * Delete questions with generation_version other than the given version.
   * Keeps only 1.0.4 by default.
   * Example: POST /api/admin/delete-by-version?apply=true
   *          POST /api/admin/delete-by-version?version=1.0.4&apply=true
   */
  @Post('delete-by-version')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async deleteQuestionsByVersion(
    @Query('version') versionRaw?: string,
    @Query('apply') applyRaw?: string,
  ) {
    const version = versionRaw ?? GENERATION_VERSION;
    const apply = applyRaw === 'true' || applyRaw === '1';
    return this.questionPoolService.deleteQuestionsExceptVersion(version, !apply);
  }

  /**
   * Remove invalid and duplicate questions from both pools.
   * Example: POST /api/admin/cleanup-questions
   */
  @Post('cleanup-questions')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async cleanupQuestions() {
    const questionPool = await this.questionPoolService.cleanupPool();
    return { question_pool: questionPool };
  }

  /**
   * Find questions with same correct_answer (potential duplicates).
   * Example: GET /api/admin/duplicate-answers
   */
  @Get('duplicate-answers')
  @UseGuards(AdminApiKeyGuard)
  async findDuplicateAnswers() {
    return this.adminScriptsService.findDuplicateAnswers();
  }

  /**
   * Find similar questions by entity overlap and Jaccard similarity.
   * Example: GET /api/admin/similar-questions
   */
  @Get('similar-questions')
  @UseGuards(AdminApiKeyGuard)
  async findSimilarQuestions() {
    return this.adminScriptsService.findSimilarQuestions();
  }

  /**
   * Get DB stats (row counts for question_pool, etc.).
   * Example: GET /api/admin/db-stats
   */
  @Get('db-stats')
  @UseGuards(AdminApiKeyGuard)
  async getDbStats() {
    return this.adminScriptsService.getDbStats();
  }

  /**
   * Get heatmap HTML report (same as npm run db:heatmap output).
   * Example: GET /api/admin/heatmap-html
   */
  @Get('heatmap-html')
  @UseGuards(AdminApiKeyGuard)
  @Header('Content-Type', 'text/html')
  async getHeatmapHtml() {
    return this.adminScriptsService.getHeatmapHtml();
  }

  /**
   * Get current difficulty score thresholds.
   * Example: GET /api/admin/thresholds
   */
  @Get('thresholds')
  @UseGuards(AdminApiKeyGuard)
  async getThresholds() {
    return this.thresholdConfig.getThresholds();
  }

  /**
   * Update difficulty score thresholds. Persists to config/score-thresholds.json.
   * Example: PUT /api/admin/thresholds with body { rawThresholdEasy?, rawThresholdMedium?, boundaryTolerance? }
   */
  @Put('thresholds')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async updateThresholds(@Body() body: Partial<ScoreThresholds>) {
    return this.thresholdConfig.updateThresholds(body);
  }

  /**
   * Re-score question_pool rows and optionally apply updates (difficulty, allowed_difficulties, raw_score).
   * Same logic as npm run pool:migrate-difficulty:apply.
   * Example: POST /api/admin/migrate-pool-difficulty?apply=true&slot=HISTORY&locale=el
   */
  @Post('migrate-pool-difficulty')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async migratePoolDifficulty(
    @Query('apply') apply?: string,
    @Query('slot') slot?: string,
    @Query('range') range?: string,
  ) {
    const applyFlag = apply === 'true' || apply === '1';
    this.logger.log(
      `[migrate-pool-difficulty] Request: apply=${applyFlag} slot=${slot ?? 'all'} range=${range ?? 'all'}`,
    );
    return this.migratePoolDifficultyService.migrate({
      apply: applyFlag,
      slot: slot?.trim() || undefined,
      range: range?.trim() || undefined,
    });
  }

  // ── Bot Control ──────────────────────────────────────────────────────────────

  /**
   * Get current bot activity status.
   * Example: GET /api/admin/bots/status
   */
  @Get('bots/status')
  @UseGuards(AdminApiKeyGuard)
  getBotStatus() {
    return {
      paused: this.botMatchmaker.paused || this.botOnlineRunner.paused,
      matchmaker: { paused: this.botMatchmaker.paused },
      onlineGameRunner: { paused: this.botOnlineRunner.paused },
    };
  }

  /**
   * Pause ALL bot activity (matchmaking, room creation, queue joining, bot turns).
   * Example: POST /api/admin/bots/pause
   */
  @Post('bots/pause')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  pauseBots() {
    this.botMatchmaker.pause();
    this.botOnlineRunner.pause();
    this.logger.warn('[Admin] All bot activity PAUSED');
    return { paused: true };
  }

  /**
   * Resume ALL bot activity.
   * Example: POST /api/admin/bots/resume
   */
  @Post('bots/resume')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  resumeBots() {
    this.botMatchmaker.resume();
    this.botOnlineRunner.resume();
    this.logger.warn('[Admin] All bot activity RESUMED');
    return { paused: false };
  }

  // ── Dashboard Stats ──────────────────────────────────────────────────────────

  /**
   * Get overview stats for the admin dashboard (cached 10s in Redis).
   * Example: GET /api/admin/overview-stats
   */
  @Get('overview-stats')
  @UseGuards(AdminApiKeyGuard)
  async getOverviewStats() {
    return this.adminStatsService.getOverviewStats();
  }

  // ── User Management ──────────────────────────────────────────────────────────

  /**
   * Search and paginate users.
   * Example: GET /api/admin/users?search=john&page=1&limit=20
   *          GET /api/admin/users?search=<uuid>&page=1&limit=20
   */
  @Get('users')
  @UseGuards(AdminApiKeyGuard)
  async getUsers(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const searchTerm = (search ?? '').trim();
    const p = Math.max(1, parseInt(page ?? '1', 10));
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10)));
    const offset = (p - 1) * l;

    let query = this.supabaseService.client
      .from('profiles')
      .select('id, username, elo, games_played, questions_answered, correct_answers, is_pro, purchase_type, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + l - 1);

    if (searchTerm.length >= 2) {
      // UUID pattern: exact match on id; otherwise ILIKE on username
      if (/^[0-9a-f]{8}-/i.test(searchTerm)) {
        query = query.eq('id', searchTerm);
      } else {
        const escaped = searchTerm.replace(/%/g, '\\%').replace(/_/g, '\\_');
        query = query.ilike('username', `%${escaped}%`);
      }
    }

    const { data, count, error } = await query;

    if (error) {
      this.logger.error(`[getUsers] Query failed: ${error.message}`);
      return { data: [], total: 0, page: p, limit: l };
    }

    return { data: data ?? [], total: count ?? 0, page: p, limit: l };
  }

  /**
   * Get full profile for a specific user including ELO history, recent matches, and pro status.
   * Example: GET /api/admin/users/:id
   */
  @Get('users/:id')
  @UseGuards(AdminApiKeyGuard)
  async getUserById(@Param('id') id: string) {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('Invalid user id');
    }

    const [profile, eloHistory, proStatus] = await Promise.all([
      this.supabaseService.getProfile(id),
      this.supabaseService.getEloHistory(id, 20),
      this.supabaseService.getProStatus(id),
    ]);

    if (!profile) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const { data: recentMatches } = await this.supabaseService.client
      .from('match_history')
      .select('id, player1_id, player2_id, player1_username, player2_username, winner_id, player1_score, player2_score, match_mode, played_at')
      .or(`player1_id.eq.${id},player2_id.eq.${id}`)
      .order('played_at', { ascending: false })
      .limit(10);

    return {
      profile: { ...profile, is_pro: proStatus?.is_pro ?? false },
      proStatus,
      eloHistory,
      recentGames: recentMatches ?? [],
    };
  }

  /**
   * Grant Pro status to a user via admin action.
   * Example: POST /api/admin/users/:id/grant-pro
   */
  @Post('users/:id/grant-pro')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async grantPro(@Param('id') id: string) {
    if (!UUID_RE.test(id)) throw new NotFoundException('Invalid user id');
    const profile = await this.supabaseService.getProfile(id);
    if (!profile) throw new NotFoundException(`User ${id} not found`);

    const proStatus = await this.supabaseService.getProStatus(id);
    if (proStatus?.is_pro) {
      return { changed: false, alreadyPro: true };
    }

    await this.supabaseService.setProStatus(id, { isPro: true, proSource: 'admin_grant' });
    await this.errorLogService.writeAuditLog('grant-pro', id, {});
    this.logger.warn(`[Admin] Granted Pro to user ${id}`);

    return { changed: true };
  }

  /**
   * Revoke Pro status from a user.
   * Example: POST /api/admin/users/:id/revoke-pro
   */
  @Post('users/:id/revoke-pro')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async revokePro(@Param('id') id: string) {
    if (!UUID_RE.test(id)) throw new NotFoundException('Invalid user id');
    const profile = await this.supabaseService.getProfile(id);
    if (!profile) throw new NotFoundException(`User ${id} not found`);

    const proStatus = await this.supabaseService.getProStatus(id);

    let warning: string | undefined;
    if (proStatus?.purchase_type === 'subscription' || proStatus?.purchase_type === 'lifetime') {
      warning = `User has a paid ${proStatus.purchase_type} — revoking admin override only; subscription may re-activate on next webhook.`;
    }

    await this.supabaseService.setProStatus(id, { isPro: false });
    await this.errorLogService.writeAuditLog('revoke-pro', id, { hadWarning: !!warning });
    this.logger.warn(`[Admin] Revoked Pro for user ${id}${warning ? ' (paid source warning)' : ''}`);

    return { changed: true, ...(warning ? { warning } : {}) };
  }

  /**
   * Reset a user's ELO back to 1000. Blocked if the user has active games.
   * Example: POST /api/admin/users/:id/reset-elo
   */
  @Post('users/:id/reset-elo')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async resetElo(@Param('id') id: string) {
    if (!UUID_RE.test(id)) throw new NotFoundException('Invalid user id');
    const profile = await this.supabaseService.getProfile(id);
    if (!profile) throw new NotFoundException(`User ${id} not found`);

    // Block reset if the user is in an active game
    const [{ count: activeDuels }, { count: activeOnline }, { count: activeBR }] = await Promise.all([
      this.supabaseService.client
        .from('duel_games')
        .select('id', { count: 'exact', head: true })
        .or(`host_id.eq.${id},guest_id.eq.${id}`)
        .eq('status', 'active'),
      this.supabaseService.client
        .from('online_games')
        .select('id', { count: 'exact', head: true })
        .or(`host_id.eq.${id},guest_id.eq.${id}`)
        .eq('status', 'active'),
      this.supabaseService.client
        .from('battle_royale_players')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', id)
        .is('finished_at', null),
    ]);

    if ((activeDuels ?? 0) > 0 || (activeOnline ?? 0) > 0 || (activeBR ?? 0) > 0) {
      return { blocked: true, reason: 'User has active games' };
    }

    const eloBefore = profile.elo;
    const eloAfter = 1000;

    await this.supabaseService.updateElo(id, eloAfter);
    await this.supabaseService.insertEloHistory({
      user_id: id,
      elo_before: eloBefore,
      elo_after: eloAfter,
      elo_change: eloAfter - eloBefore,
      question_difficulty: 'ADMIN_RESET',
      correct: false,
      timed_out: false,
    });

    await this.errorLogService.writeAuditLog('reset-elo', id, { eloBefore });
    this.logger.warn(`[Admin] Reset ELO for user ${id}: ${eloBefore} → ${eloAfter}`);

    return { changed: true, eloBefore, eloAfter };
  }

  // ── Error Logs ───────────────────────────────────────────────────────────────

  /**
   * Fetch paginated error logs with optional filters.
   * Example: GET /api/admin/error-logs?level=error&from=2024-01-01&search=timeout&page=1&limit=50
   */
  @Get('error-logs')
  @UseGuards(AdminApiKeyGuard)
  async getErrorLogs(
    @Query('level') level?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.errorLogService.getErrors({
      level: (level ?? '').trim() || undefined,
      from: (from ?? '').trim() || undefined,
      to: (to ?? '').trim() || undefined,
      search: (search ?? '').trim() || undefined,
      page: Math.max(1, parseInt(page ?? '1', 10)),
      limit: Math.min(200, Math.max(1, parseInt(limit ?? '50', 10))),
    });
  }

  /**
   * Clear error logs older than the given ISO timestamp (or all if omitted).
   * Example: DELETE /api/admin/error-logs?before=2024-01-01T00:00:00Z
   *          DELETE /api/admin/error-logs  (clears all)
   */
  @Delete('error-logs')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async clearErrorLogs(@Query('before') before?: string) {
    const cutoff = (before ?? '').trim() || undefined;
    await this.errorLogService.clearErrors(cutoff);
    this.logger.warn(`[Admin] Cleared error logs${cutoff ? ` before ${cutoff}` : ' (all)'}`);
    return { cleared: true };
  }

  // ── Live Game Views ───────────────────────────────────────────────────────────

  /**
   * Get all currently active/waiting games across all modes.
   * Example: GET /api/admin/live-games
   */
  @Get('live-games')
  @UseGuards(AdminApiKeyGuard)
  async getLiveGames() {
    const [duelsResult, onlineResult, brResult] = await Promise.allSettled([
      this.supabaseService.client
        .from('duel_games')
        .select('id, host_id, guest_id, game_type, updated_at')
        .eq('status', 'active'),

      this.supabaseService.client
        .from('online_games')
        .select('id, host_id, guest_id, status, updated_at')
        .in('status', ['active', 'waiting']),

      this.supabaseService.client
        .from('battle_royale_rooms')
        .select('id, mode, status, max_players, updated_at')
        .in('status', ['active', 'waiting']),
    ]);

    return {
      duels: duelsResult.status === 'fulfilled' ? (duelsResult.value.data ?? []) : [],
      onlineGames: onlineResult.status === 'fulfilled' ? (onlineResult.value.data ?? []) : [],
      battleRoyale: brResult.status === 'fulfilled' ? (brResult.value.data ?? []) : [],
    };
  }

  /**
   * Get the most recent matches across all players.
   * Example: GET /api/admin/recent-games?limit=20
   */
  @Get('recent-games')
  @UseGuards(AdminApiKeyGuard)
  async getRecentGames(@Query('limit') limitRaw?: string) {
    const limit = Math.min(100, Math.max(1, parseInt(limitRaw ?? '20', 10)));

    const { data, error } = await this.supabaseService.client
      .from('match_history')
      .select('*')
      .order('played_at', { ascending: false })
      .limit(limit);

    if (error) {
      this.logger.error(`[getRecentGames] Query failed: ${error.message}`);
      return [];
    }

    return data ?? [];
  }

  // ── System Info ───────────────────────────────────────────────────────────────

  /**
   * Get runtime system information for the admin dashboard.
   * Example: GET /api/admin/system-info
   */
  @Get('system-info')
  @UseGuards(AdminApiKeyGuard)
  getSystemInfo() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      gitSha: process.env['RAILWAY_GIT_COMMIT_SHA'] ?? 'dev',
      timestamp: new Date().toISOString(),
    };
  }
}
