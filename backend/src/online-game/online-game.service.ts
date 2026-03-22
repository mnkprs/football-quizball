import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionPoolService } from '../questions/question-pool.service';
import { AnswerValidator } from '../questions/validators/answer.validator';
import { RedisService } from '../redis/redis.service';
import {
  CATEGORY_LABELS,
  DIFFICULTY_POINTS,
  CATEGORY_DIFFICULTY_SLOTS,
  GeneratedQuestion,
} from '../questions/question.types';
import {
  CreateOnlineGameDto,
  JoinByCodeDto,
  OnlineSubmitAnswerDto,
  OnlineUseLifelineDto,
  OnlineTop5GuessDto,
  OnlineBoardCell,
  OnlineBoardState,
  OnlinePlayerMeta,
  OnlineGamePublicView,
  OnlineAnswerResult,
  OnlineHintResult,
  OnlineTop5GuessResult,
  OnlineGameSummary,
} from './online-game.types';
import { Top5Entry } from '../questions/question.types';

const CATEGORIES_ORDER = ['HISTORY', 'PLAYER_ID', 'HIGHER_OR_LOWER', 'GUESS_SCORE', 'TOP_5', 'GEOGRAPHY', 'GOSSIP'] as const;
const TURN_DEADLINE_HOURS = 24;

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

@Injectable()
export class OnlineGameService {
  private readonly logger = new Logger(OnlineGameService.name);

  constructor(
    private supabaseService: SupabaseService,
    private questionPoolService: QuestionPoolService,
    private answerValidator: AnswerValidator,
    private redisService: RedisService,
  ) {}

  // ── Premium enforcement ─────────────────────────────────────────────────────

  private async checkGameLimit(userId: string): Promise<void> {
    const proStatus = await this.supabaseService.getProStatus(userId);
    if (proStatus?.is_pro) return;
    const { data: count } = await this.supabaseService.client.rpc('count_active_online_games', { p_user_id: userId });
    if ((count as number) >= 2) {
      throw new ForbiddenException('MAX_ONLINE_GAMES_REACHED');
    }
  }

  // ── Board drawing ───────────────────────────────────────────────────────────

  private async drawBoard(hostId: string): Promise<{ boardState: OnlineBoardState; poolQuestionIds: string[] }> {
    // allowLlmFallback=true: when a slot collision is detected (same question eligible for
    // two difficulty tiers drawn by the same RPC call), fall back to a live-generated question
    // for the missing slot rather than throwing a 503 and forcing the player to retry.
    const { questions, poolQuestionIds } = await this.questionPoolService.drawBoard([], true);

    const usedIds = new Set<string>();
    const cells: OnlineBoardCell[][] = CATEGORIES_ORDER.map((category) => {
      const slots = CATEGORY_DIFFICULTY_SLOTS[category];
      return slots.map((difficulty) => {
        const question = questions.find(
          (q: GeneratedQuestion) => q.category === category && q.difficulty === difficulty && !usedIds.has(q.id),
        );
        if (question) usedIds.add(question.id);
        return {
          question_id: question?.id || '',
          category,
          difficulty,
          points: question?.points ?? DIFFICULTY_POINTS[difficulty],
          answered: false,
        };
      });
    });

    const questionsRecord = questions.reduce((acc: Record<string, unknown>[], q: GeneratedQuestion) => {
      const { _embedding, ...rest } = q as GeneratedQuestion & { _embedding?: unknown };
      void _embedding;
      acc.push(rest as unknown as Record<string, unknown>);
      return acc;
    }, []);

    // Safety guard: if any cell ended up without a question (draw_board returned a duplicate
    // for two slots and the dedup in drawBoardFromDb didn't surface it via missingByCategory),
    // refuse to create a broken game rather than silently producing an unanswerable cell.
    const brokenCell = cells.flat().find((c) => !c.question_id);
    if (brokenCell) {
      throw new ServiceUnavailableException(
        `POOL_MISSING_SLOTS: no question available for ${brokenCell.category}/${brokenCell.difficulty}`,
      );
    }

    const boardState: OnlineBoardState = {
      cells,
      questions: questionsRecord,
      categories: CATEGORIES_ORDER as unknown as string[],
    };

    return { boardState, poolQuestionIds };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async fetchRow(gameId: string): Promise<Record<string, unknown>> {
    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .select('*')
      .eq('id', gameId)
      .single();
    if (error || !data) throw new NotFoundException(`Online game ${gameId} not found`);
    return data as Record<string, unknown>;
  }

  private async saveMatchHistoryIfFinished(
    row: Record<string, unknown>,
    newStatus: string,
    finalScores: { host: number; guest: number },
  ): Promise<void> {
    if (newStatus !== 'finished') return;
    const hostId = row['host_id'] as string;
    const guestId = row['guest_id'] as string | null;

    // Return ALL pool questions — user_question_history handles per-user dedup going forward.
    const poolIds = (row['pool_question_ids'] as string[] | null) ?? [];
    if (poolIds.length > 0) {
      this.questionPoolService.returnUnansweredToPool(poolIds).catch((err: Error) =>
        this.logger.warn(`[saveMatchHistoryIfFinished] Failed to return questions to pool: ${err.message}`),
      );
    }

    try {
      const usernames = await this.getUsernames(hostId, guestId);
      const winnerId =
        finalScores.host > finalScores.guest ? hostId :
        finalScores.guest > finalScores.host ? (guestId ?? null) : null;
      const isBotMatch = guestId ? await this.supabaseService.isDummyUser(guestId) : false;
      await this.supabaseService.saveMatchResult({
        player1_id: hostId,
        player2_id: guestId,
        player1_username: usernames.host,
        player2_username: usernames.guest ?? 'Guest',
        winner_id: winnerId,
        player1_score: finalScores.host,
        player2_score: finalScores.guest,
        match_mode: 'online',
        is_bot_match: isBotMatch,
      });
      this.logger.log(JSON.stringify({
        event: 'game_finished',
        gameId: row['id'],
        winnerId,
        scores: finalScores,
      }));
    } catch (err) {
      this.logger.error(`[saveMatchHistoryIfFinished] Failed for game ${row['id']}: ${err}`);
    }
  }

  private async getUsernames(hostId: string, guestId: string | null): Promise<{ host: string; guest: string | null }> {
    const hostProfile = await this.supabaseService.getProfile(hostId);
    const host = hostProfile?.username ?? 'Host';
    let guest: string | null = null;
    if (guestId) {
      const guestProfile = await this.supabaseService.getProfile(guestId);
      guest = guestProfile?.username ?? 'Guest';
    }
    return { host, guest };
  }

  private toPublicView(row: Record<string, unknown>, userId: string, hostUsername: string, guestUsername: string | null): OnlineGamePublicView {
    const boardState = row['board_state'] as OnlineBoardState;
    const myRole: 'host' | 'guest' = row['host_id'] === userId ? 'host' : 'guest';
    const rawScores = row['player_scores'] as [number, number];
    const playerScores = { host: rawScores[0], guest: rawScores[1] };
    const rawMeta = row['player_meta'] as { host: OnlinePlayerMeta; guest: OnlinePlayerMeta };

    // Strip correct_answer from cells (cells themselves don't have it — questions do)
    const safeBoard: OnlineBoardCell[][] = (boardState.cells ?? []).map((row: OnlineBoardCell[]) =>
      row.map((cell) => ({
        question_id: cell.question_id,
        category: cell.category,
        difficulty: cell.difficulty,
        points: cell.points,
        answered: cell.answered,
        answered_by: cell.answered_by,
        points_awarded: cell.points_awarded,
        lifeline_applied: cell.lifeline_applied,
        double_armed: cell.double_armed,
      })),
    );

    const categories = (boardState.categories ?? CATEGORIES_ORDER).map((key: string) => ({
      key,
      label: CATEGORY_LABELS[key] ?? key,
    }));

    return {
      id: row['id'] as string,
      status: row['status'] as OnlineGamePublicView['status'],
      inviteCode: row['invite_code'] as string | null,
      currentPlayerId: row['current_player_id'] as string | null,
      myRole,
      myUserId: userId,
      playerScores,
      playerMeta: rawMeta,
      lastResult: row['last_result'] as OnlineAnswerResult | null,
      turnDeadline: row['turn_deadline'] as string | null,
      board: safeBoard,
      categories,
      hostId: row['host_id'] as string,
      guestId: row['guest_id'] as string | null,
      hostUsername,
      guestUsername,
    };
  }

  private deadlineFromNow(): string {
    const d = new Date();
    d.setHours(d.getHours() + TURN_DEADLINE_HOURS);
    return d.toISOString();
  }

  private findQuestion(boardState: OnlineBoardState, questionId: string): GeneratedQuestion | undefined {
    return (boardState.questions ?? []).find((q) => (q as unknown as GeneratedQuestion).id === questionId) as unknown as GeneratedQuestion | undefined;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  async createGame(userId: string, dto: CreateOnlineGameDto): Promise<OnlineGamePublicView> {
    await this.checkGameLimit(userId);
    const { boardState, poolQuestionIds } = await this.drawBoard(userId);

    // Generate unique invite code
    let inviteCode = generateInviteCode();
    for (let i = 0; i < 5; i++) {
      const { data } = await this.supabaseService.client
        .from('online_games').select('id').eq('invite_code', inviteCode).maybeSingle();
      if (!data) break;
      inviteCode = generateInviteCode();
    }

    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .insert({
        invite_code: inviteCode,
        host_id: userId,
        status: 'waiting',
        board_state: boardState,
        pool_question_ids: poolQuestionIds,
        player_scores: [0, 0],
      })
      .select()
      .single();

    if (error || !data) throw new BadRequestException('Failed to create online game');
    this.logger.log(JSON.stringify({ event: 'game_created', gameId: (data as Record<string,unknown>)['id'], userId }));
    const { host, guest } = await this.getUsernames(userId, null);
    return this.toPublicView(data as Record<string, unknown>, userId, host, guest);
  }

  async joinQueue(userId: string): Promise<OnlineGamePublicView> {
    await this.checkGameLimit(userId);

    // Look for an existing queued game
    const { data: existing } = await this.supabaseService.client
      .from('online_games')
      .select('*')
      .eq('status', 'queued')
      .neq('host_id', userId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Join it — record guest's history for questions already drawn by the host
      const deadline = this.deadlineFromNow();
      const { data, error } = await this.supabaseService.client
        .from('online_games')
        .update({
          guest_id: userId,
          status: 'active',
          current_player_id: existing['host_id'],
          turn_deadline: deadline,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing['id'])
        .select()
        .single();
      if (error || !data) throw new BadRequestException('Failed to join queued game');
      const existingPoolIds = (existing['pool_question_ids'] as string[] | null) ?? [];
      this.questionPoolService.recordBoardHistory(existingPoolIds, [userId]).catch(() => {});
      const { host, guest } = await this.getUsernames(existing['host_id'] as string, userId);
      return this.toPublicView(data as Record<string, unknown>, userId, host, guest);
    }

    // Create a new queued game (no invite_code)
    const { boardState, poolQuestionIds } = await this.drawBoard(userId);
    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .insert({
        invite_code: null,
        host_id: userId,
        status: 'queued',
        board_state: boardState,
        pool_question_ids: poolQuestionIds,
        player_scores: [0, 0],
      })
      .select()
      .single();
    if (error || !data) throw new BadRequestException('Failed to join queue');
    const { host, guest } = await this.getUsernames(userId, null);
    return this.toPublicView(data as Record<string, unknown>, userId, host, guest);
  }

  async joinByCode(userId: string, dto: JoinByCodeDto): Promise<OnlineGamePublicView> {
    await this.checkGameLimit(userId);
    const { data: row } = await this.supabaseService.client
      .from('online_games')
      .select('*')
      .eq('invite_code', dto.inviteCode.toUpperCase())
      .maybeSingle();

    if (!row) throw new NotFoundException('Invite code not found');
    if (row['host_id'] === userId) throw new BadRequestException('Cannot join your own game');
    if (row['status'] !== 'waiting') throw new BadRequestException('Game is no longer available');

    const deadline = this.deadlineFromNow();
    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .update({
        guest_id: userId,
        status: 'active',
        current_player_id: row['host_id'],
        turn_deadline: deadline,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row['id'])
      .select()
      .single();
    if (error || !data) throw new BadRequestException('Failed to join game');
    this.logger.log(JSON.stringify({ event: 'game_joined', gameId: row['id'], userId, via: 'invite_code' }));
    // Record the existing pool questions in the guest's history (board was drawn by host)
    const existingPoolIds = (row['pool_question_ids'] as string[] | null) ?? [];
    this.questionPoolService.recordBoardHistory(existingPoolIds, [userId]).catch(() => {});
    const { host, guest } = await this.getUsernames(row['host_id'] as string, userId);
    return this.toPublicView(data as Record<string, unknown>, userId, host, guest);
  }

  async previewInvite(inviteCode: string): Promise<{ hostUsername: string; status: string }> {
    const { data: row } = await this.supabaseService.client
      .from('online_games')
      .select('host_id, status')
      .eq('invite_code', inviteCode.toUpperCase())
      .maybeSingle();
    if (!row) throw new NotFoundException('Invite code not found');
    const profile = await this.supabaseService.getProfile(row['host_id'] as string);
    return { hostUsername: profile?.username ?? 'Host', status: row['status'] as string };
  }

  async getGame(userId: string, gameId: string): Promise<OnlineGamePublicView> {
    const row = await this.fetchRow(gameId);
    if (row['host_id'] !== userId && row['guest_id'] !== userId) {
      throw new ForbiddenException('Not a participant of this game');
    }
    const { host, guest } = await this.getUsernames(row['host_id'] as string, row['guest_id'] as string | null);
    return this.toPublicView(row, userId, host, guest);
  }

  async getQuestion(userId: string, gameId: string, questionId: string): Promise<Omit<GeneratedQuestion, 'correct_answer' | 'fifty_fifty_hint'>> {
    const row = await this.fetchRow(gameId);
    if (row['current_player_id'] !== userId) {
      throw new ForbiddenException('Not your turn');
    }
    const boardState = row['board_state'] as OnlineBoardState;
    const question = this.findQuestion(boardState, questionId);
    if (!question) throw new NotFoundException('Question not found');
    const { correct_answer, fifty_fifty_hint, difficulty_factors, source_question_text, source_explanation, ...safe } = question as GeneratedQuestion & { difficulty_factors?: unknown; source_question_text?: string; source_explanation?: string };
    return { ...safe, correct_answer: '', fifty_fifty_hint: null } as unknown as Omit<GeneratedQuestion, 'correct_answer' | 'fifty_fifty_hint'>;
  }

  async submitAnswer(userId: string, gameId: string, dto: OnlineSubmitAnswerDto): Promise<OnlineAnswerResult> {
    const row = await this.fetchRow(gameId);

    if (row['status'] === 'finished') throw new BadRequestException('Game is already finished');
    if (row['current_player_id'] !== userId) throw new ForbiddenException('Not your turn');

    const boardState = row['board_state'] as OnlineBoardState;
    const myRole: 'host' | 'guest' = row['host_id'] === userId ? 'host' : 'guest';
    const opponentRole: 'host' | 'guest' = myRole === 'host' ? 'guest' : 'host';
    const playerMeta = row['player_meta'] as { host: OnlinePlayerMeta; guest: OnlinePlayerMeta };
    const playerScoresArr = row['player_scores'] as [number, number];
    const scores = { host: playerScoresArr[0], guest: playerScoresArr[1] };

    const question = this.findQuestion(boardState, dto.questionId);
    if (!question) throw new NotFoundException('Question not found');

    const cell = boardState.cells.flat().find((c) => c.question_id === dto.questionId);
    if (!cell) throw new NotFoundException('Board cell not found');
    if (cell.answered) throw new BadRequestException('Question already answered');

    const myMeta = playerMeta[myRole];
    if (dto.useDouble && myMeta.doubleUsed) {
      throw new BadRequestException('2x multiplier already used this game');
    }
    const doubleApplied = !!dto.useDouble && !myMeta.doubleUsed;
    const correct = await this.answerValidator.validateAsync(question, dto.answer);
    const basePoints = correct ? cell.points : 0;
    const pointsAwarded = correct && doubleApplied ? basePoints * 2 : basePoints;

    if (correct) scores[myRole] += pointsAwarded;
    if (doubleApplied) myMeta.doubleUsed = true; // Consume on submit, not only on correct
    if (doubleApplied) cell.double_armed = true;

    cell.answered = true;
    cell.answered_by = myRole;
    cell.points_awarded = pointsAwarded;

    // Switch turn
    const opponentId = myRole === 'host' ? row['guest_id'] : row['host_id'];
    const allAnswered = boardState.cells.flat().every((c) => c.answered);
    const newStatus = allAnswered ? 'finished' : 'active';

    const answerResult: OnlineAnswerResult = {
      correct,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      points_awarded: pointsAwarded,
      player_scores: scores,
      lifeline_used: !!cell.lifeline_applied,
      double_used: doubleApplied && correct,
    };

    const turnClaimed = await this.supabaseService.claimOnlineTurn({
      game_id: gameId,
      user_id: userId,
      board_state: boardState,
      player_scores: [scores.host, scores.guest],
      player_meta: playerMeta,
      new_player_id: allAnswered ? null : (opponentId as string),
      new_status: newStatus,
      turn_deadline: allAnswered ? null : this.deadlineFromNow(),
      last_result: answerResult,
    });

    if (!turnClaimed) {
      throw new ConflictException('Turn already taken');
    }

    this.logger.log(JSON.stringify({
      event: 'answer_submitted',
      gameId,
      userId,
      correct,
      pointsAwarded,
      newStatus,
    }));

    await this.saveMatchHistoryIfFinished(row, newStatus, scores);

    return answerResult;
  }

  async useLifeline(userId: string, gameId: string, dto: OnlineUseLifelineDto): Promise<OnlineHintResult> {
    const row = await this.fetchRow(gameId);
    if (row['current_player_id'] !== userId) throw new ForbiddenException('Not your turn');

    const myRole: 'host' | 'guest' = row['host_id'] === userId ? 'host' : 'guest';
    const playerMeta = row['player_meta'] as { host: OnlinePlayerMeta; guest: OnlinePlayerMeta };
    if (playerMeta[myRole].lifelineUsed) {
      throw new BadRequestException('50-50 already used this game');
    }

    const boardState = row['board_state'] as OnlineBoardState;
    const question = this.findQuestion(boardState, dto.questionId);
    if (!question) throw new NotFoundException('Question not found');
    if (!question.fifty_fifty_applicable) throw new BadRequestException('50-50 not applicable');
    if (!question.fifty_fifty_hint) throw new BadRequestException('No decoy answer available');

    const cell = boardState.cells.flat().find((c) => c.question_id === dto.questionId);
    if (cell && !cell.lifeline_applied) {
      cell.points = 1;
      cell.lifeline_applied = true;
    }
    playerMeta[myRole].lifelineUsed = true;

    await this.supabaseService.client
      .from('online_games')
      .update({ board_state: boardState, player_meta: playerMeta, updated_at: new Date().toISOString() })
      .eq('id', gameId);

    const options = [question.correct_answer, question.fifty_fifty_hint];
    if (Math.random() < 0.5) options.reverse();
    return { options, pointsIfCorrect: 1 };
  }

  async submitTop5Guess(userId: string, gameId: string, dto: OnlineTop5GuessDto): Promise<OnlineTop5GuessResult> {
    const row = await this.fetchRow(gameId);
    if (row['current_player_id'] !== userId) throw new ForbiddenException('Not your turn');

    const myRole: 'host' | 'guest' = row['host_id'] === userId ? 'host' : 'guest';
    const boardState = row['board_state'] as OnlineBoardState;
    const top5Progress = row['top5_progress'] as Record<string, unknown>;
    const playerMeta = row['player_meta'] as { host: OnlinePlayerMeta; guest: OnlinePlayerMeta };
    const playerScoresArr = row['player_scores'] as [number, number];
    const scores = { host: playerScoresArr[0], guest: playerScoresArr[1] };

    const question = this.findQuestion(boardState, dto.questionId);
    if (!question || question.category !== 'TOP_5') throw new NotFoundException('Top 5 question not found');

    const cell = boardState.cells.flat().find((c) => c.question_id === dto.questionId);
    if (!cell) throw new NotFoundException('Board cell not found');
    if (cell.answered) throw new BadRequestException('Question already answered');

    const top5Entries = question.meta?.['top5'] as Top5Entry[];

    if (!top5Progress[dto.questionId]) {
      top5Progress[dto.questionId] = {
        filledSlots: [null, null, null, null, null],
        wrongGuesses: [],
        complete: false,
        won: false,
      };
    }
    const progress = top5Progress[dto.questionId] as {
      filledSlots: Array<{ name: string; stat: string } | null>;
      wrongGuesses: Array<{ name: string; stat: string }>;
      complete: boolean;
      won: boolean;
    };

    const matchedIndex = this.answerValidator.matchTop5Entry(top5Entries, dto.answer);
    let matched = false;
    let position: number | null = null;
    let fullName = dto.answer;
    let stat = '';

    if (matchedIndex >= 0) {
      const entry = top5Entries[matchedIndex];
      if (progress.filledSlots[matchedIndex] !== null) {
        return {
          matched: true,
          position: matchedIndex + 1,
          fullName: entry.name,
          stat: entry.stat,
          wrongCount: progress.wrongGuesses.length,
          filledCount: progress.filledSlots.filter(Boolean).length,
          filledSlots: progress.filledSlots,
          wrongGuesses: progress.wrongGuesses,
          complete: false,
          won: false,
        };
      }
      matched = true;
      position = matchedIndex + 1;
      fullName = entry.name;
      stat = entry.stat;
      progress.filledSlots[matchedIndex] = { name: entry.name, stat: entry.stat };
    } else {
      progress.wrongGuesses.push({ name: dto.answer, stat: '' });
    }

    const filledCount = progress.filledSlots.filter(Boolean).length;
    const wrongCount = progress.wrongGuesses.length;
    const allFilled = filledCount === 5;
    const tooManyWrong = wrongCount >= 2;
    const complete = allFilled || tooManyWrong;

    if (complete) {
      progress.complete = true;
      progress.won = allFilled;

      const myMeta = playerMeta[myRole];
      const doubleApplied = !!dto.useDouble && !myMeta.doubleUsed;
      const basePoints = allFilled ? cell.points : 0;
      const pointsAwarded = allFilled && doubleApplied ? basePoints * 2 : basePoints;

      if (allFilled) scores[myRole] += pointsAwarded;
      if (doubleApplied) myMeta.doubleUsed = true; // Consume when Top 5 ends, win or fail

      cell.answered = true;
      cell.answered_by = myRole;
      cell.points_awarded = pointsAwarded;

      const opponentId = myRole === 'host' ? row['guest_id'] : row['host_id'];
      const allAnswered = boardState.cells.flat().every((c) => c.answered);
      const newStatus = allAnswered ? 'finished' : 'active';

      await this.supabaseService.client
        .from('online_games')
        .update({
          board_state: boardState,
          top5_progress: top5Progress,
          player_scores: [scores.host, scores.guest],
          player_meta: playerMeta,
          current_player_id: allAnswered ? null : opponentId,
          status: newStatus,
          turn_deadline: allAnswered ? null : this.deadlineFromNow(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId);

      await this.saveMatchHistoryIfFinished(row, newStatus, scores);

      return {
        matched,
        position,
        fullName,
        stat,
        wrongCount,
        filledCount,
        filledSlots: progress.filledSlots,
        wrongGuesses: progress.wrongGuesses,
        complete: true,
        won: allFilled,
        points_awarded: pointsAwarded,
        player_scores: scores,
        correct_answer: question.correct_answer,
        explanation: question.explanation,
      };
    }

    await this.supabaseService.client
      .from('online_games')
      .update({ top5_progress: top5Progress, updated_at: new Date().toISOString() })
      .eq('id', gameId);

    return {
      matched,
      position,
      fullName,
      stat,
      wrongCount,
      filledCount,
      filledSlots: progress.filledSlots,
      wrongGuesses: progress.wrongGuesses,
      complete: false,
      won: false,
    };
  }

  async stopTop5Early(userId: string, gameId: string, questionId: string): Promise<OnlineTop5GuessResult> {
    const row = await this.fetchRow(gameId);
    if (row['current_player_id'] !== userId) throw new ForbiddenException('Not your turn');

    const myRole: 'host' | 'guest' = row['host_id'] === userId ? 'host' : 'guest';
    const boardState = row['board_state'] as OnlineBoardState;
    const top5Progress = row['top5_progress'] as Record<string, unknown>;
    const playerScoresArr = row['player_scores'] as [number, number];
    const scores = { host: playerScoresArr[0], guest: playerScoresArr[1] };

    const question = this.findQuestion(boardState, questionId);
    if (!question || question.category !== 'TOP_5') throw new NotFoundException('Top 5 question not found');
    const cell = boardState.cells.flat().find((c) => c.question_id === questionId);
    if (!cell) throw new NotFoundException('Board cell not found');
    if (cell.answered) throw new BadRequestException('Question already answered');

    const progress = top5Progress[questionId] as {
      filledSlots: Array<{ name: string; stat: string } | null>;
      wrongGuesses: Array<{ name: string; stat: string }>;
      complete: boolean;
      won: boolean;
    } | undefined;

    const filledCount = progress?.filledSlots.filter(Boolean).length ?? 0;
    if (filledCount < 4) throw new BadRequestException('Need at least 4 found to stop early');

    const pointsAwarded = 1;
    scores[myRole] += pointsAwarded;
    cell.answered = true;
    cell.answered_by = myRole;
    cell.points_awarded = pointsAwarded;
    if (progress) { progress.complete = true; progress.won = true; }

    const opponentId = myRole === 'host' ? row['guest_id'] : row['host_id'];
    const allAnswered = boardState.cells.flat().every((c) => c.answered);
    const newStatus = allAnswered ? 'finished' : 'active';

    await this.supabaseService.client
      .from('online_games')
      .update({
        board_state: boardState,
        top5_progress: top5Progress,
        player_scores: [scores.host, scores.guest],
        current_player_id: allAnswered ? null : opponentId,
        status: newStatus,
        turn_deadline: allAnswered ? null : this.deadlineFromNow(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId);

    await this.saveMatchHistoryIfFinished(row, newStatus, scores);

    return {
      matched: false,
      position: null,
      fullName: '',
      stat: '',
      wrongCount: progress?.wrongGuesses.length ?? 0,
      filledCount,
      filledSlots: progress?.filledSlots ?? [null, null, null, null, null],
      wrongGuesses: progress?.wrongGuesses ?? [],
      complete: true,
      won: true,
      points_awarded: pointsAwarded,
      player_scores: scores,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
    };
  }

  async abandonGame(userId: string, gameId: string): Promise<void> {
    const row = await this.fetchRow(gameId);
    if (row['host_id'] !== userId && row['guest_id'] !== userId) {
      throw new ForbiddenException('Not a participant of this game');
    }
    const poolIds = ((row['pool_question_ids'] as string[] | null) ?? []).filter(Boolean);
    if (poolIds.length > 0) {
      await this.questionPoolService.returnUnansweredToPool(poolIds).catch((err: Error) =>
        this.logger.error(`[abandonGame] Failed to return questions: ${err.message}`),
      );
    }
    await this.supabaseService.client
      .from('online_games')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('id', gameId);
  }

  async listMyGames(userId: string): Promise<OnlineGameSummary[]> {
    const { data } = await this.supabaseService.client
      .from('online_games')
      .select('id, status, invite_code, host_id, guest_id, current_player_id, player_scores, turn_deadline, updated_at')
      .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
      .in('status', ['waiting', 'queued', 'active'])
      .order('updated_at', { ascending: false })
      .limit(20);

    if (!data) return [];

    const summaries: OnlineGameSummary[] = await Promise.all(
      (data as Record<string, unknown>[]).map(async (row) => {
        const myRole: 'host' | 'guest' = row['host_id'] === userId ? 'host' : 'guest';
        const opponentId = myRole === 'host' ? (row['guest_id'] as string | null) : (row['host_id'] as string);
        const scores = row['player_scores'] as [number, number];
        let opponentUsername: string | null = null;
        if (opponentId) {
          const profile = await this.supabaseService.getProfile(opponentId);
          opponentUsername = profile?.username ?? null;
        }
        return {
          id: row['id'] as string,
          status: row['status'] as OnlineGameSummary['status'],
          inviteCode: row['invite_code'] as string | null,
          myRole,
          isMyTurn: row['current_player_id'] === userId,
          playerScores: { host: scores[0], guest: scores[1] },
          opponentUsername,
          turnDeadline: row['turn_deadline'] as string | null,
          updatedAt: row['updated_at'] as string,
        };
      }),
    );
    return summaries;
  }

  async getGameCount(userId: string): Promise<{ count: number; isPro: boolean }> {
    const proStatus = await this.supabaseService.getProStatus(userId);
    const { data: count } = await this.supabaseService.client.rpc('count_active_online_games', { p_user_id: userId });
    return { count: (count as number) ?? 0, isPro: proStatus?.is_pro ?? false };
  }

  // ── Turn expiry scheduler ────────────────────────────────────────────────────

  @Cron('0 * * * *') // every hour
  async processExpiredTurns(): Promise<void> {
    const acquired = await this.redisService.acquireLock('lock:cron:expired-turns', 300);
    if (!acquired) return;
    try {
      const { data: expired } = await this.supabaseService.client
        .from('online_games')
        .select('id')
        .eq('status', 'active')
        .lt('turn_deadline', new Date().toISOString());

      if (!expired || expired.length === 0) return;
      this.logger.log(`[processExpiredTurns] Processing ${expired.length} expired turns`);

      for (const game of expired as { id: string }[]) {
        await this.processTurnExpiry(game.id).catch((err: Error) =>
          this.logger.error(`[processExpiredTurns] Failed for game ${game.id}: ${err.message}`),
        );
      }
    } finally {
      await this.redisService.releaseLock('lock:cron:expired-turns');
    }
  }

  private async processTurnExpiry(gameId: string): Promise<void> {
    const row = await this.fetchRow(gameId);
    if (row['status'] !== 'active') return;

    const myRole: 'host' | 'guest' = row['current_player_id'] === row['host_id'] ? 'host' : 'guest';
    const opponentRole: 'host' | 'guest' = myRole === 'host' ? 'guest' : 'host';
    const opponentId = opponentRole === 'host' ? row['host_id'] : row['guest_id'];

    // Mark current turn as forfeited: 0 pts, switch turn
    const boardState = row['board_state'] as OnlineBoardState;
    const allAnswered = boardState.cells.flat().every((c) => c.answered);
    const newStatus = allAnswered ? 'finished' : 'active';

    await this.supabaseService.client
      .from('online_games')
      .update({
        current_player_id: allAnswered ? null : opponentId,
        status: newStatus,
        turn_deadline: allAnswered ? null : this.deadlineFromNow(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId);

    if (newStatus === 'finished') {
      const rawScores = row['player_scores'] as [number, number];
      await this.saveMatchHistoryIfFinished(row, newStatus, { host: rawScores[0], guest: rawScores[1] });
    }
  }
}
