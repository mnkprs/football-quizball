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
import { AdminUserService } from './admin-user.service';
import { PoolQuestionsQueryDto } from './dto/pool-questions-query.dto';
import { SeedPoolQueryDto } from './dto/seed-pool-query.dto';
import { VerifyIntegrityQueryDto, VerifyIntegrityBodyDto } from './dto/verify-integrity-query.dto';
import { GenerationVersionQueryDto, DeleteByVersionQueryDto } from './dto/generation-version-query.dto';

@Controller('api/admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly questionPoolService: QuestionPoolService,
    private readonly adminScriptsService: AdminScriptsService,
    private readonly migratePoolDifficultyService: MigratePoolDifficultyService,
    private readonly thresholdConfig: ThresholdConfigService,
    private readonly botMatchmaker: BotMatchmakerService,
    private readonly botOnlineRunner: BotOnlineGameRunner,
    private readonly adminStatsService: AdminStatsService,
    private readonly errorLogService: ErrorLogService,
    private readonly supabaseService: SupabaseService,
    private readonly adminUserService: AdminUserService,
  ) {}

  /**
   * Get paginated questions by raw_score range.
   * Example: GET /api/admin/pool-questions?min=0.2&max=0.3&page=1&limit=20&search=...&category=HISTORY&difficulty=EASY&generation_version=1.0.5
   */
  @Get('pool-questions')
  @UseGuards(AdminApiKeyGuard)
  async getPoolQuestions(@Query() dto: PoolQuestionsQueryDto) {
    return this.questionPoolService.getPoolQuestionsByRange(
      dto.min!, dto.max!, dto.page, dto.limit, dto.search, dto.category, dto.difficulty, dto.generation_version,
    );
  }

  /**
   * List seed-pool sessions (runs) with timestamps and counts.
   * Example: GET /api/admin/seed-pool-sessions
   *          GET /api/admin/seed-pool-sessions?generation_version=1.0.5
   */
  @Get('seed-pool-sessions')
  @UseGuards(AdminApiKeyGuard)
  async getSeedPoolSessions(@Query() dto: GenerationVersionQueryDto) {
    return this.questionPoolService.getSeedPoolSessions(dto.generation_version);
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
  async getPoolStats(@Query() dto: GenerationVersionQueryDto) {
    const [rawScoreStats, seedPoolStats] = await Promise.all([
      this.questionPoolService.getPoolRawScoreStats(dto.generation_version),
      this.questionPoolService.getSeedPoolStats(dto.generation_version),
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
  async seedPool(@Query() dto: SeedPoolQueryDto) {
    const count = dto.target!;
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
    @Query() query: VerifyIntegrityQueryDto,
    @Body() body?: VerifyIntegrityBodyDto,
  ) {
    const questionIds = body?.questionIds?.filter(Boolean);
    return this.questionPoolService.verifyPoolIntegrity({
      limit: query.limit,
      category: query.category as import('../common/interfaces/question.interface').QuestionCategory | undefined,
      version: query.version,
      apply: query.apply,
      questionIds: questionIds?.length ? questionIds : undefined,
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
  async deleteQuestionsByVersion(@Query() dto: DeleteByVersionQueryDto) {
    const version = dto.version ?? GENERATION_VERSION;
    return this.questionPoolService.deleteQuestionsExceptVersion(version, !dto.apply);
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
    return await this.thresholdConfig.getThresholds();
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
  async pauseBots() {
    await this.botMatchmaker.pause();
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
  async resumeBots() {
    await this.botMatchmaker.resume();
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
    const p = parseInt(page ?? '1', 10);
    const l = parseInt(limit ?? '20', 10);
    return this.adminUserService.getUsers(searchTerm, p, l);
  }

  /**
   * Get full profile for a specific user including ELO history, recent matches, and pro status.
   * Example: GET /api/admin/users/:id
   */
  @Get('users/:id')
  @UseGuards(AdminApiKeyGuard)
  async getUserById(@Param('id') id: string) {
    if (!this.adminUserService.isValidUuid(id)) {
      throw new NotFoundException('Invalid user id');
    }

    const result = await this.adminUserService.getUserById(id);
    if (!result) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return result;
  }

  /**
   * Grant Pro status to a user via admin action.
   * Example: POST /api/admin/users/:id/grant-pro
   */
  @Post('users/:id/grant-pro')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async grantPro(@Param('id') id: string) {
    if (!this.adminUserService.isValidUuid(id)) throw new NotFoundException('Invalid user id');
    const profile = await this.supabaseService.getProfile(id);
    if (!profile) throw new NotFoundException(`User ${id} not found`);

    return this.adminUserService.grantPro(id);
  }

  /**
   * Revoke Pro status from a user.
   * Example: POST /api/admin/users/:id/revoke-pro
   */
  @Post('users/:id/revoke-pro')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async revokePro(@Param('id') id: string) {
    if (!this.adminUserService.isValidUuid(id)) throw new NotFoundException('Invalid user id');
    const profile = await this.supabaseService.getProfile(id);
    if (!profile) throw new NotFoundException(`User ${id} not found`);

    return this.adminUserService.revokePro(id);
  }

  /**
   * Reset a user's ELO back to 1000. Blocked if the user has active games.
   * Example: POST /api/admin/users/:id/reset-elo
   */
  @Post('users/:id/reset-elo')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async resetElo(@Param('id') id: string) {
    if (!this.adminUserService.isValidUuid(id)) throw new NotFoundException('Invalid user id');
    const profile = await this.supabaseService.getProfile(id);
    if (!profile) throw new NotFoundException(`User ${id} not found`);

    return this.adminUserService.resetElo(id, profile.elo);
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
