import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionPoolService } from '../questions/question-pool.service';
import { AnswerValidator } from '../questions/validators/answer.validator';
import { GeneratedQuestion } from '../questions/question.types';
import {
  CreateDuelDto,
  JoinDuelByCodeDto,
  JoinQueueDto,
  DuelAnswerDto,
  DuelPublicView,
  DuelPublicQuestion,
  DuelAnswerResult,
  DuelGameSummary,
  DuelGameRow,
  DuelQuestionResult,
  DuelGameType,
} from './duel.types';
import { LogoQuizService } from '../logo-quiz/logo-quiz.service';
import { AchievementsService } from '../achievements/achievements.service';

/** First to WIN_TARGET correct answers wins the duel */
const WIN_TARGET = 5;
/** Questions pre-drawn at creation to avoid mid-game latency */
const PREFETCH_COUNT = 30;
/** Game ends after this many questions regardless of score (AFK safety valve) */
export const MAX_QUESTIONS = 10;

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

@Injectable()
export class DuelService {
  private readonly logger = new Logger(DuelService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly questionPoolService: QuestionPoolService,
    private readonly answerValidator: AnswerValidator,
    private readonly logoQuizService: LogoQuizService,
    private readonly achievementsService: AchievementsService,
  ) {}

  // ── Create / Join ─────────────────────────────────────────────────────────

  async createGame(hostId: string, dto: CreateDuelDto): Promise<DuelPublicView> {
    const gameType: DuelGameType = dto.gameType ?? 'standard';

    // Singleton guard: if user already has a waiting invite-code duel of this type, return it
    const { data: existingList } = await this.supabaseService.client
      .from('duel_games')
      .select('*')
      .eq('host_id', hostId)
      .eq('status', 'waiting')
      .eq('game_type', gameType)
      .not('invite_code', 'is', null)
      .is('guest_id', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingList && existingList.length > 0) {
      const row = existingList[0] as DuelGameRow;
      const hostUsername = await this.getUsername(hostId);
      const freePoolCutoff = row.game_type === 'logo' ? await this.getLogoPoolCutoff() : null;
      return this.toPublicView(row, hostId, hostUsername, null, freePoolCutoff);
    }

    const questions = await this.drawQuestionsForType(gameType, hostId);
    if (questions.length === 0) {
      throw new BadRequestException('Question pool is empty. Please try again later.');
    }

    const inviteCode = generateInviteCode();
    const poolQuestionIds = questions.map((q) => q.id);

    const { data, error } = await this.supabaseService.client
      .from('duel_games')
      .insert({
        host_id: hostId,
        invite_code: inviteCode,
        questions,
        pool_question_ids: poolQuestionIds,
        status: 'waiting',
        game_type: gameType,
      })
      .select('*')
      .single();

    if (error) throw new BadRequestException(`Failed to create duel: ${error.message}`);

    // Record drawn questions in host's history (fire-and-forget)
    if (gameType === 'standard') {
      void this.questionPoolService.recordBoardHistory(poolQuestionIds, [hostId]).catch((err) =>
        this.logger.warn(`[createGame] recordBoardHistory failed: ${err?.message}`),
      );
    }

    const hostUsername = await this.getUsername(hostId);
    const freePoolCutoff = gameType === 'logo' ? await this.getLogoPoolCutoff() : null;
    return this.toPublicView(data as DuelGameRow, hostId, hostUsername, null, freePoolCutoff);
  }

  async joinByCode(guestId: string, dto: JoinDuelByCodeDto): Promise<DuelPublicView> {
    const { data: game, error } = await this.supabaseService.client
      .from('duel_games')
      .select('*')
      .eq('invite_code', dto.inviteCode.toUpperCase())
      .single();

    if (error || !game) throw new NotFoundException('Duel not found.');
    const row = game as DuelGameRow;

    if (row.status !== 'waiting') throw new ConflictException('This duel is no longer open to join.');
    if (row.host_id === guestId) throw new BadRequestException('You cannot join your own duel.');
    if (row.guest_id && row.guest_id !== guestId) throw new ConflictException('This duel is already full.');

    // Enforce game_type isolation: the joiner must be in the same mode as the duel
    if (dto.gameType && dto.gameType !== row.game_type) {
      throw new BadRequestException(
        `This invite code is for a ${row.game_type} duel. You are trying to join from ${dto.gameType} mode.`,
      );
    }

    const { data: updated, error: updErr } = await this.supabaseService.client
      .from('duel_games')
      .update({ guest_id: guestId })
      .eq('id', row.id)
      .eq('status', 'waiting')
      .is('guest_id', null)
      .select('*')
      .single();

    if (updErr || !updated) throw new ConflictException('Could not join — duel may have just been taken.');

    // Record the questions in the guest's history so they don't see them again in future games
    if ((updated as DuelGameRow).game_type === 'standard') {
      const poolIds = ((updated as DuelGameRow).pool_question_ids ?? []);
      void this.questionPoolService.recordBoardHistory(poolIds, [guestId]).catch((err) =>
        this.logger.warn(`[joinByCode] recordBoardHistory failed: ${err?.message}`),
      );
    }

    const [hostUsername, guestUsername] = await Promise.all([
      this.getUsername(row.host_id),
      this.getUsername(guestId),
    ]);

    const freePoolCutoff = (updated as DuelGameRow).game_type === 'logo' ? await this.getLogoPoolCutoff() : null;
    return this.toPublicView(updated as DuelGameRow, guestId, hostUsername, guestUsername, freePoolCutoff);
  }

  async joinQueue(userId: string, dto?: JoinQueueDto): Promise<DuelPublicView> {
    const gameType: DuelGameType = dto?.gameType ?? 'standard';

    // Singleton guard: if the user is already in a queue game (no invite code) or active duel
    // OF THIS TYPE, return that game instead of creating a second one.
    // Excludes invite-code waiting games — those are a separate flow.
    const { data: existing } = await this.supabaseService.client
      .from('duel_games')
      .select('*')
      .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
      .eq('game_type', gameType)
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      const row = existing as DuelGameRow;
      // Skip invite-code waiting games — user should be able to queue separately
      const isInviteWaiting = row.status === 'waiting' && row.invite_code && !row.guest_id;
      if (!isInviteWaiting) {
        const [hostUsername, guestUsername] = await Promise.all([
          this.getUsername(row.host_id),
          row.guest_id ? this.getUsername(row.guest_id) : Promise.resolve(null),
        ]);
        const freePoolCutoff = row.game_type === 'logo' ? await this.getLogoPoolCutoff() : null;
        return this.toPublicView(row, userId, hostUsername, guestUsername, freePoolCutoff);
      }
    }

    // Look for an open waiting queue game (no invite code) OF THIS TYPE created by someone else
    const { data: candidates } = await this.supabaseService.client
      .from('duel_games')
      .select('*')
      .eq('status', 'waiting')
      .eq('game_type', gameType)
      .is('guest_id', null)
      .is('invite_code', null)
      .neq('host_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (candidates && candidates.length > 0) {
      const candidate = candidates[0] as DuelGameRow;
      const { data: joined, error } = await this.supabaseService.client
        .from('duel_games')
        .update({ guest_id: userId })
        .eq('id', candidate.id)
        .eq('status', 'waiting')
        .is('guest_id', null)
        .select('*')
        .single();

      if (!error && joined) {
        // Record questions in guest's history (board was drawn by host)
        if (gameType === 'standard') {
          const joinedPoolIds = (candidate.pool_question_ids ?? []);
          void this.questionPoolService.recordBoardHistory(joinedPoolIds, [userId]).catch((err) =>
            this.logger.warn(`[joinQueue] recordBoardHistory failed: ${err?.message}`),
          );
        }
        const [hostUsername, guestUsername] = await Promise.all([
          this.getUsername(candidate.host_id),
          this.getUsername(userId),
        ]);
        const freePoolCutoff = (joined as DuelGameRow).game_type === 'logo' ? await this.getLogoPoolCutoff() : null;
        return this.toPublicView(joined as DuelGameRow, userId, hostUsername, guestUsername, freePoolCutoff);
      }
      // Race condition — someone else grabbed it; fall through to create own
    }

    // No open games — create one without an invite code (queue marker)
    const questions = await this.drawQuestionsForType(gameType, userId);
    if (questions.length === 0) {
      throw new BadRequestException('Question pool is empty. Please try again later.');
    }
    const { data, error } = await this.supabaseService.client
      .from('duel_games')
      .insert({
        host_id: userId,
        invite_code: null,
        questions,
        pool_question_ids: questions.map((q) => q.id),
        status: 'waiting',
        game_type: gameType,
      })
      .select('*')
      .single();

    if (error || !data) throw new BadRequestException('Failed to join queue.');
    if (gameType === 'standard') {
      void this.questionPoolService.recordBoardHistory(questions.map((q) => q.id), [userId]).catch((err) =>
        this.logger.warn(`[joinQueue] recordBoardHistory failed: ${err?.message}`),
      );
    }
    const hostUsername = await this.getUsername(userId);
    const freePoolCutoff = gameType === 'logo' ? await this.getLogoPoolCutoff() : null;
    return this.toPublicView(data as DuelGameRow, userId, hostUsername, null, freePoolCutoff);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async getGame(userId: string, gameId: string): Promise<DuelPublicView> {
    const row = await this.fetchGame(gameId, userId);
    const [hostUsername, guestUsername] = await Promise.all([
      this.getUsername(row.host_id),
      row.guest_id ? this.getUsername(row.guest_id) : Promise.resolve(null),
    ]);
    const freePoolCutoff = row.game_type === 'logo' ? await this.getLogoPoolCutoff() : null;
    return this.toPublicView(row, userId, hostUsername, guestUsername, freePoolCutoff);
  }

  async listMyGames(userId: string, gameType?: DuelGameType): Promise<DuelGameSummary[]> {
    let query = this.supabaseService.client
      .from('duel_games')
      .select('id, invite_code, status, scores, host_id, guest_id, game_type, updated_at')
      .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
      .in('status', ['waiting', 'active'])
      .order('updated_at', { ascending: false })
      .limit(20);

    if (gameType) {
      query = query.eq('game_type', gameType);
    }

    const { data, error } = await query;

    if (error) throw new BadRequestException(error.message);

    return await Promise.all(
      (data as DuelGameRow[]).map(async (row) => {
        const opponentId = row.host_id === userId ? row.guest_id : row.host_id;
        const opponentUsername = opponentId ? await this.getUsername(opponentId) : null;
        return {
          id: row.id,
          status: row.status,
          inviteCode: row.invite_code,
          scores: row.scores,
          opponentUsername,
          updatedAt: row.updated_at,
          gameType: row.game_type,
        } as DuelGameSummary;
      }),
    );
  }

  // ── Ready up ──────────────────────────────────────────────────────────────

  async markReady(userId: string, gameId: string): Promise<DuelPublicView> {
    const row = await this.fetchGame(gameId, userId);
    if (row.status !== 'waiting' && row.status !== 'active') {
      throw new BadRequestException('Game is not in a state where ready-up is allowed.');
    }
    if (!row.guest_id) throw new BadRequestException('Waiting for opponent to join first.');

    const role = row.host_id === userId ? 'host' : 'guest';
    const patch = role === 'host' ? { host_ready: true } : { guest_ready: true };

    const hostReady = role === 'host' ? true : row.host_ready;
    const guestReady = role === 'guest' ? true : row.guest_ready;

    const shouldActivate = hostReady && guestReady && row.status === 'waiting';

    const { data: updated, error } = await this.supabaseService.client
      .from('duel_games')
      .update({
        ...patch,
        ...(shouldActivate ? { status: 'active', question_started_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .select('*')
      .single();

    if (error || !updated) throw new BadRequestException('Failed to mark ready.');

    const [hostUsername, guestUsername] = await Promise.all([
      this.getUsername(row.host_id),
      row.guest_id ? this.getUsername(row.guest_id) : Promise.resolve(null),
    ]);
    const freePoolCutoff = (updated as DuelGameRow).game_type === 'logo' ? await this.getLogoPoolCutoff() : null;
    return this.toPublicView(updated as DuelGameRow, userId, hostUsername, guestUsername, freePoolCutoff);
  }

  // ── Answer submission ─────────────────────────────────────────────────────

  async submitAnswer(userId: string, gameId: string, dto: DuelAnswerDto): Promise<DuelAnswerResult> {
    const row = await this.fetchGame(gameId, userId);

    if (row.status !== 'active') throw new BadRequestException('Game is not active.');
    if (row.current_question_answered_by !== null) {
      // Question already claimed by someone — they should get the next question via Realtime
      throw new ConflictException('This question has already been answered.');
    }
    if (dto.questionIndex !== row.current_question_index) {
      throw new BadRequestException('Stale submission — question index mismatch.');
    }

    const question = row.questions[row.current_question_index] as GeneratedQuestion;
    if (!question) throw new BadRequestException('No question at this index.');

    const role: 'host' | 'guest' = row.host_id === userId ? 'host' : 'guest';

    // Validate answer: logo duels use fuzzyMatch, standard duels use LLM-backed validator
    const correct = row.game_type === 'logo'
      ? this.logoQuizService.fuzzyMatch(dto.answer, question.correct_answer)
      : await this.answerValidator.validateAsync(question, dto.answer);

    if (!correct) {
      // Increment profile-level questions_answered (wrong answer still counts as answered)
      void this.supabaseService.incrementQuestionStats(userId, 0).catch((err) =>
        this.logger.warn(`[submitAnswer] incrementQuestionStats failed: ${err?.message}`),
      );
      return { correct: false };
    }

    // Attempt atomic CAS: claim the question for this player
    const newScores = {
      host: row.scores.host + (role === 'host' ? 1 : 0),
      guest: row.scores.guest + (role === 'guest' ? 1 : 0),
    };

    const nextIndex = row.current_question_index + 1;
    const gameFinished = newScores[role] >= WIN_TARGET || nextIndex >= MAX_QUESTIONS;

    const questionResult: DuelQuestionResult = {
      index: row.current_question_index,
      winner: role,
      question_text: question.question_text,
      correct_answer: question.correct_answer,
    };

    const { data: claimed, error: claimError } = await this.supabaseService.client
      .from('duel_games')
      .update({
        // Reset answered_by to null in the same atomic write so the next question
        // is immediately claimable — eliminates the fire-and-forget TOCTOU window.
        current_question_answered_by: null,
        current_question_index: nextIndex,
        scores: newScores,
        question_results: [...row.question_results, questionResult],
        question_started_at: gameFinished ? null : new Date().toISOString(),
        ...(gameFinished ? { status: 'finished' } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .eq('current_question_index', row.current_question_index)
      .is('current_question_answered_by', null)
      .select('id')
      .single();

    if (claimError || !claimed) {
      // Another player claimed it first (race condition — both were correct simultaneously)
      return { correct: true, lostRace: true };
    }

    // Increment profile-level questions_answered / correct_answers
    void this.supabaseService.incrementQuestionStats(userId, 1).catch((err) =>
      this.logger.warn(`[submitAnswer] incrementQuestionStats failed: ${err?.message}`),
    );

    const gameWinner: 'host' | 'guest' | 'draw' | undefined = gameFinished ? role : undefined;

    // Award achievements when game finishes
    if (gameFinished) {
      const winnerId = newScores.host > newScores.guest ? row.host_id : newScores.guest > newScores.host ? row.guest_id : null;

      // Award achievements to both players
      for (const playerId of ([row.host_id, row.guest_id].filter(Boolean) as string[])) {
        void (async () => {
          try {
            const isWinner = playerId === winnerId;
            if (isWinner) {
              await this.supabaseService.incrementDuelWins(playerId);
            }
            const duelWins = isWinner ? (await this.supabaseService.getDuelWinCount(playerId)) : undefined;
            const duelGames = await this.supabaseService.getDuelGameCount(playerId);
            const { current_daily_streak: dailyStreak } = await this.supabaseService.updateDailyStreak(playerId);
            const modesPlayed = await this.supabaseService.addModePlayed(playerId, 'duel');

            await this.achievementsService.checkAndAward(playerId, {
              duelWins,
              duelGamesPlayed: duelGames,
              dailyStreak,
              modesPlayed,
            });
          } catch (e) {
            this.logger.warn(`[submitAnswer] Achievement check failed for ${playerId}: ${(e as Error)?.message}`);
          }
        })();
      }
    }

    return {
      correct: true,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      winner: role,
      scores: newScores,
      gameFinished,
      gameWinner,
    };
  }

  // ── Abandon ───────────────────────────────────────────────────────────────

  async abandonGame(userId: string, gameId: string): Promise<{ ok: boolean }> {
    const row = await this.fetchGame(gameId, userId);
    if (row.status === 'finished' || row.status === 'abandoned') {
      throw new BadRequestException('Game is already over.');
    }

    // Return ALL pool questions so they can be drawn in future games.
    const poolIds = (row.pool_question_ids ?? []).filter(Boolean);
    if (poolIds.length > 0) {
      void this.questionPoolService.returnUnansweredToPool(poolIds).catch((err: Error) =>
        this.logger.warn(`[abandonGame] Failed to return questions to pool: ${err.message}`),
      );
    }

    await this.supabaseService.client
      .from('duel_games')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('id', gameId);

    return { ok: true };
  }

  // ── Question timeout ──────────────────────────────────────────────────────

  /** Called by controller when the 30s client timer expires. Idempotent — safe to call from both players. */
  async timeoutQuestion(userId: string, gameId: string, questionIndex: number): Promise<{ ok: boolean }> {
    const row = await this.fetchGame(gameId, userId);
    if (row.status !== 'active') return { ok: false };
    if (row.current_question_index !== questionIndex) return { ok: true }; // already advanced
    await this.advanceTimedOutQuestion(row);
    return { ok: true };
  }

  /** Atomically advance a question that has timed out. CAS-safe — called by both the timeout endpoint and the cron. */
  async advanceTimedOutQuestion(row: DuelGameRow): Promise<void> {
    const nextIndex = row.current_question_index + 1;
    const gameFinished = nextIndex >= MAX_QUESTIONS;
    const question = row.questions[row.current_question_index];

    const timedOutResult: DuelQuestionResult = {
      index: row.current_question_index,
      winner: null,
      question_text: question?.question_text ?? '',
      correct_answer: question?.correct_answer ?? '',
    };

    const { error } = await this.supabaseService.client
      .from('duel_games')
      .update({
        current_question_index: nextIndex,
        current_question_answered_by: null,
        question_results: [...row.question_results, timedOutResult],
        question_started_at: gameFinished ? null : new Date().toISOString(),
        ...(gameFinished ? { status: 'finished' } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('current_question_index', row.current_question_index); // CAS: no-op if already advanced

    if (error) {
      this.logger.warn(`Failed to advance timed-out question for game ${row.id}: ${error.message}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async fetchGame(gameId: string, userId: string): Promise<DuelGameRow> {
    const { data, error } = await this.supabaseService.client
      .from('duel_games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (error || !data) throw new NotFoundException('Duel not found.');
    const row = data as DuelGameRow;
    if (row.host_id !== userId && row.guest_id !== userId) {
      throw new ForbiddenException('You are not a participant in this duel.');
    }
    return row;
  }

  private async drawQuestionsForType(gameType: DuelGameType, hostId: string): Promise<GeneratedQuestion[]> {
    if (gameType === 'logo') {
      const logos = await this.logoQuizService.drawLogosForTeamMode(PREFETCH_COUNT);
      return logos.map((l) => ({
        id: l.id,
        question_text: 'Identify this football club',
        correct_answer: l.correct_answer,
        explanation: '',
        category: 'LOGO_QUIZ',
        difficulty: l.difficulty,
        image_url: l.image_url,
        original_image_url: l.original_image_url,
        question_elo: l.question_elo,
      } as GeneratedQuestion & { image_url: string; original_image_url: string; question_elo?: number }));
    }
    const seenIds = await this.supabaseService.getSeenQuestionIds(hostId).catch(() => [] as string[]);
    return this.questionPoolService.drawForDuel(PREFETCH_COUNT, seenIds);
  }

  private async getUsername(userId: string): Promise<string> {
    const profile = await this.supabaseService.getProfile(userId);
    return profile?.username ?? 'Unknown';
  }

  private async getLogoPoolCutoff(): Promise<number | null> {
    return this.logoQuizService.getFreePoolCutoff();
  }

  private toPublicView(
    row: DuelGameRow,
    myUserId: string,
    hostUsername: string,
    guestUsername: string | null,
    freePoolCutoff?: number | null,
  ): DuelPublicView {
    const myRole: 'host' | 'guest' = row.host_id === myUserId ? 'host' : 'guest';

    const isLogo = row.game_type === 'logo';
    const currentQuestion = this.toPublicQuestion(row.questions, row.current_question_index, isLogo);

    // Enrich question results with is_pro_logo for logo duels
    const questionResults = isLogo && freePoolCutoff != null
      ? row.question_results.map((r, i) => {
          const q = row.questions[i] as any;
          const qElo = q?.question_elo as number | undefined;
          return {
            ...r,
            is_pro_logo: qElo != null ? qElo > freePoolCutoff : false,
          };
        })
      : row.question_results;

    return {
      id: row.id,
      status: row.status,
      inviteCode: row.invite_code,
      myRole,
      myUserId,
      hostUsername,
      guestUsername,
      scores: row.scores,
      currentQuestion,
      currentQuestionIndex: row.current_question_index,
      questionResults,
      hostReady: row.host_ready,
      guestReady: row.guest_ready,
      gameType: row.game_type,
    };
  }

  private toPublicQuestion(
    questions: GeneratedQuestion[],
    index: number,
    isLogo = false,
  ): DuelPublicQuestion | null {
    const q = questions[index];
    if (!q) return null;
    return {
      index,
      question_text: q.question_text,
      explanation: '', // revealed only after question is won
      category: q.category,
      difficulty: q.difficulty,
      ...(isLogo && (q as GeneratedQuestion & { image_url?: string }).image_url ? {
        image_url: (q as GeneratedQuestion & { image_url?: string }).image_url,
      } : {}),
    };
  }
}
