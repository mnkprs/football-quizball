import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
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
  CATEGORY_SLOT_POINTS,
} from '../questions/question.types';
import type { GeneratedQuestion, BoardCell, Top5Progress, Top5Entry } from '../common/interfaces/question.interface';
import type { Player } from '../common/interfaces/game.interface';
import {
  CreateOnlineGameDto,
  JoinByCodeDto,
  OnlineSubmitAnswerDto,
  OnlineUseLifelineDto,
  OnlineTop5GuessDto,
  OnlineGameRow,
  OnlinePublicView,
  OnlineTurnState,
  OnlineLastResult,
  OnlinePublicQuestion,
  OnlineGameSummary,
  OnlineAnswerResult,
  OnlineHintResult,
  OnlineTop5GuessResult,
} from './online-game.types';

const CATEGORIES_ORDER = [
  'HISTORY',
  'PLAYER_ID',
  'HIGHER_OR_LOWER',
  'GUESS_SCORE',
  'TOP_5',
  'GEOGRAPHY',
  'LOGO_QUIZ',
] as const;

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return code;
}

@Injectable()
export class OnlineGameService {
  private readonly logger = new Logger(OnlineGameService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly questionPoolService: QuestionPoolService,
    private readonly answerValidator: AnswerValidator,
    private readonly redisService: RedisService,
  ) {}

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async fetchGame(gameId: string, userId: string): Promise<OnlineGameRow> {
    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .select('*')
      .eq('id', gameId)
      .single();
    if (error || !data) throw new NotFoundException(`Online game ${gameId} not found`);
    const row = data as OnlineGameRow;
    if (row.host_id !== userId && row.guest_id !== userId) {
      throw new ForbiddenException('Not a participant of this game');
    }
    return row;
  }

  private assertActive(row: OnlineGameRow): void {
    if (row.status !== 'active') {
      throw new BadRequestException(`Game is not active (status: ${row.status})`);
    }
  }

  private assertMyTurn(row: OnlineGameRow, userId: string): void {
    const myIndex = row.host_id === userId ? 0 : 1;
    if (row.current_player_index !== myIndex) {
      throw new ForbiddenException('Not your turn');
    }
  }

  private toPublicQuestion(q: GeneratedQuestion): OnlinePublicQuestion {
    return {
      id: q.id,
      question_text: q.question_text,
      category: q.category,
      difficulty: q.difficulty,
      image_url: q.image_url ?? undefined,
      fifty_fifty_applicable: q.fifty_fifty_applicable,
      meta: q.meta,
    };
  }

  private toPublicView(row: OnlineGameRow, userId: string): OnlinePublicView {
    const myRole: 'host' | 'guest' = row.host_id === userId ? 'host' : 'guest';
    const myPlayerIndex: 0 | 1 = myRole === 'host' ? 0 : 1;
    const isMyTurn = row.current_player_index === myPlayerIndex;

    const safeBoard = row.board.map((rowCells: BoardCell[]) =>
      rowCells.map((cell) => ({
        question_id: cell.question_id,
        category: cell.category,
        difficulty: cell.difficulty,
        points: cell.points,
        answered: cell.answered,
        answered_by: cell.answered_by,
      })),
    );

    const categories = CATEGORIES_ORDER.map((key) => ({
      key,
      label: CATEGORY_LABELS[key] ?? key,
    }));

    // Strip sensitive data from turn_state when serving to the spectating player.
    // The active player needs meta.top5 to see which entries to guess,
    // but the spectating player could cheat by reading it from devtools.
    let safeTurnState = row.turn_state;
    if (safeTurnState && !isMyTurn) {
      const { meta, ...safeQuestion } = safeTurnState.question;
      safeTurnState = {
        ...safeTurnState,
        question: { ...safeQuestion, meta: undefined },
      };
    }

    return {
      id: row.id,
      inviteCode: row.invite_code,
      status: row.status,
      myRole,
      myPlayerIndex,
      players: row.players,
      currentPlayerIndex: row.current_player_index,
      board: safeBoard,
      categories,
      hostReady: row.host_ready,
      guestReady: row.guest_ready,
      turnState: safeTurnState,
      lastResult: row.last_result,
    };
  }

  private isMathematicallyWon(players: [Player, Player], board: BoardCell[][]): boolean {
    const unanswered = board.flat().filter((c) => !c.answered);
    if (unanswered.length === 0) return false;

    const totalRemaining = unanswered.reduce((sum, c) => sum + c.points, 0);
    const maxCellPoints = Math.max(...unanswered.map((c) => c.points));

    for (let i = 0; i < 2; i++) {
      const j = 1 - i;
      const lead = players[i].score - players[j].score;
      const doubleBonus = players[j].doubleUsed ? 0 : maxCellPoints;
      if (lead > totalRemaining + doubleBonus) return true;
    }
    return false;
  }

  private returnQuestionsToPool(poolIds: string[]): void {
    if (!poolIds || poolIds.length === 0) return;
    void this.questionPoolService.returnUnansweredToPool(poolIds).catch((err: Error) =>
      this.logger.warn(`[returnQuestionsToPool] Failed: ${err.message}`),
    );
  }

  /** Fire-and-forget: persist finished online game to match_history with game reference. */
  private saveOnlineMatchHistory(row: OnlineGameRow, players: [Player, Player], gameId: string): void {
    const winnerId = players[0].score > players[1].score
      ? row.host_id
      : players[1].score > players[0].score
        ? row.guest_id
        : null;
    void this.supabaseService.saveMatchResult({
      player1_id: row.host_id,
      player2_id: row.guest_id!,
      player1_username: players[0].name,
      player2_username: players[1].name,
      winner_id: winnerId,
      player1_score: players[0].score,
      player2_score: players[1].score,
      match_mode: 'online',
      game_ref_id: gameId,
      game_ref_type: 'online',
    }).catch((e) => this.logger.warn(`[online] match history save failed: ${(e as Error)?.message}`));
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  async createGame(userId: string, dto: CreateOnlineGameDto): Promise<OnlinePublicView> {
    // Generate unique invite code
    let inviteCode = generateInviteCode();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await this.supabaseService.client
        .from('online_games')
        .select('id')
        .eq('invite_code', inviteCode)
        .maybeSingle();
      if (!existing) break;
      inviteCode = generateInviteCode();
    }

    // Draw board
    const { questions, poolQuestionIds } = await this.questionPoolService.drawBoard([], true, [userId]);

    // Fire-and-forget refill
    void this.questionPoolService.refillIfNeeded().catch((err: Error) =>
      this.logger.warn(`[createGame] refillIfNeeded failed: ${err.message}`),
    );

    // Get username
    const profile = await this.supabaseService.getProfile(userId);
    const hostName = profile?.username ?? 'Host';

    // Build board grid
    const usedIds = new Set<string>();
    const board: BoardCell[][] = CATEGORIES_ORDER.map((category) => {
      const slots = CATEGORY_DIFFICULTY_SLOTS[category];
      const slotPoints = CATEGORY_SLOT_POINTS[category];
      return slots.map((difficulty, slotIndex) => {
        const question = questions.find(
          (q: GeneratedQuestion) =>
            q.category === category && q.difficulty === difficulty && !usedIds.has(q.id),
        );
        if (question) usedIds.add(question.id);
        if (!question) {
          this.logger.warn(`[createGame] Missing question for ${category}/${difficulty}`);
        }
        const points = slotPoints?.[slotIndex] ?? question?.points ?? DIFFICULTY_POINTS[difficulty];
        return {
          question_id: question?.id ?? '',
          category,
          difficulty,
          points,
          answered: false,
        } as BoardCell;
      });
    });

    // Strip embeddings from questions before storing
    const safeQuestions = questions.map((q: GeneratedQuestion & { _embedding?: unknown }) => {
      const { _embedding, ...rest } = q;
      void _embedding;
      return rest as GeneratedQuestion;
    });

    const players: [Player, Player] = [
      { name: hostName, score: 0, lifelineUsed: false, doubleUsed: false },
      { name: '???', score: 0, lifelineUsed: false, doubleUsed: false },
    ];

    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .insert({
        invite_code: inviteCode,
        host_id: userId,
        guest_id: null,
        status: 'waiting',
        players,
        board,
        questions: safeQuestions,
        pool_question_ids: poolQuestionIds,
        current_player_index: 0,
        top5_progress: {},
        host_ready: false,
        guest_ready: false,
        turn_state: null,
        last_result: null,
        turn_started_at: null,
        // Legacy columns — set to safe defaults
        board_state: {},
        current_player_id: null,
        player_scores: [0, 0],
        player_meta: {},
      })
      .select('*')
      .single();

    if (error || !data) {
      this.logger.error(`[createGame] Insert failed: ${error?.message}`);
      throw new BadRequestException('Failed to create online game');
    }

    this.logger.debug(JSON.stringify({ event: 'game_created', gameId: (data as OnlineGameRow).id, userId }));
    return this.toPublicView(data as OnlineGameRow, userId);
  }

  async joinByCode(userId: string, dto: JoinByCodeDto): Promise<OnlinePublicView> {
    const { data: row } = await this.supabaseService.client
      .from('online_games')
      .select('*')
      .eq('invite_code', dto.inviteCode.toUpperCase())
      .eq('status', 'waiting')
      .is('guest_id', null)
      .maybeSingle();

    if (!row) throw new NotFoundException('Invite code not found or game is not available');
    const gameRow = row as OnlineGameRow;
    if (gameRow.host_id === userId) throw new BadRequestException('Cannot join your own game');

    const profile = await this.supabaseService.getProfile(userId);
    const guestName = profile?.username ?? 'Guest';

    // Update players[1].name and guest_id using CAS on guest_id IS NULL
    const updatedPlayers: [Player, Player] = [
      gameRow.players[0],
      { ...gameRow.players[1], name: guestName },
    ];

    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .update({
        guest_id: userId,
        players: updatedPlayers,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameRow.id)
      .is('guest_id', null)
      .select('*')
      .single();

    if (error || !data) throw new ConflictException('Game already joined or no longer available');

    this.logger.debug(JSON.stringify({ event: 'game_joined', gameId: gameRow.id, userId }));
    return this.toPublicView(data as OnlineGameRow, userId);
  }

  async markReady(userId: string, gameId: string): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);
    if (row.status !== 'waiting' && row.status !== 'active') {
      throw new BadRequestException('Game cannot be readied in its current state');
    }

    const isHost = row.host_id === userId;
    const hostReady = isHost ? true : row.host_ready;
    const guestReady = !isHost ? true : row.guest_ready;
    const bothReady = hostReady && guestReady && row.guest_id !== null;

    const updates: Record<string, unknown> = {
      host_ready: hostReady,
      guest_ready: guestReady,
      updated_at: new Date().toISOString(),
    };

    if (bothReady) {
      updates.status = 'active';
      updates.turn_started_at = new Date().toISOString();
    }

    // CAS: only set my ready flag if it hasn't been set yet (prevents stale read race)
    const casField = isHost ? 'host_ready' : 'guest_ready';
    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .update(updates)
      .eq('id', gameId)
      .eq(casField, false) // CAS: only flip if not already ready
      .select('*')
      .single();

    if (error || !data) {
      // CAS failed — already ready or stale. Re-fetch current state.
      const fresh = await this.fetchGame(gameId, userId);
      return this.toPublicView(fresh, userId);
    }
    return this.toPublicView(data as OnlineGameRow, userId);
  }

  async selectQuestion(
    userId: string,
    gameId: string,
    dto: { questionId: string },
  ): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);
    this.assertActive(row);
    this.assertMyTurn(row, userId);

    // No active turn or previous turn is done
    if (row.turn_state && row.turn_state.phase !== 'result') {
      throw new BadRequestException('A question is already in progress');
    }

    const question = row.questions.find((q: GeneratedQuestion) => q.id === dto.questionId);
    if (!question) throw new NotFoundException('Question not found');

    const cell = row.board.flat().find((c: BoardCell) => c.question_id === dto.questionId);
    if (!cell) throw new NotFoundException('Board cell not found');
    if (cell.answered) throw new BadRequestException('Question already answered');

    const phase = question.category === 'TOP_5' ? 'top5' : 'answering';

    // Init top5Progress if needed
    const top5Progress =
      phase === 'top5' && !row.top5_progress[dto.questionId]
        ? {
            filledSlots: [null, null, null, null, null] as Array<Top5Entry | null>,
            wrongGuesses: [] as Top5Entry[],
            complete: false,
            won: false,
          }
        : (row.top5_progress[dto.questionId] ?? null);

    const turnState: OnlineTurnState = {
      questionId: dto.questionId,
      question: this.toPublicQuestion(question),
      attempts: [],
      top5Progress: phase === 'top5' ? (top5Progress as Top5Progress) : null,
      phase,
    };

    const newTop5Progress =
      phase === 'top5'
        ? { ...row.top5_progress, [dto.questionId]: top5Progress }
        : row.top5_progress;

    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .update({
        turn_state: turnState,
        last_result: null,
        top5_progress: newTop5Progress,
        turn_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .select('*')
      .single();

    if (error || !data) throw new BadRequestException('Failed to select question');
    return this.toPublicView(data as OnlineGameRow, userId);
  }

  async submitAnswer(userId: string, gameId: string, dto: OnlineSubmitAnswerDto): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);
    this.assertActive(row);
    this.assertMyTurn(row, userId);

    if (!row.turn_state || row.turn_state.questionId !== dto.questionId) {
      throw new BadRequestException('No matching active question');
    }

    const question = row.questions.find((q: GeneratedQuestion) => q.id === dto.questionId);
    if (!question) throw new NotFoundException('Question not found');

    const cell = row.board.flat().find((c: BoardCell) => c.question_id === dto.questionId);
    if (!cell) throw new NotFoundException('Board cell not found');
    if (cell.answered) throw new BadRequestException('Question already answered');

    const myIndex: 0 | 1 = row.host_id === userId ? 0 : 1;
    const player = row.players[myIndex];

    const correct = await this.answerValidator.validateAsync(question, dto.answer);

    if (!correct) {
      // Append wrong attempt and broadcast via Realtime
      const updatedAttempts = [...(row.turn_state.attempts ?? []), dto.answer];
      const updatedTurnState: OnlineTurnState = {
        ...row.turn_state,
        attempts: updatedAttempts,
      };

      const { data, error } = await this.supabaseService.client
        .from('online_games')
        .update({
          turn_state: updatedTurnState,
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId)
        .eq('current_player_index', myIndex) // CAS: prevent stale update on concurrent submits
        .select('*')
        .single();

      if (error || !data) throw new BadRequestException('Failed to submit answer');
      return this.toPublicView(data as OnlineGameRow, userId);
    }

    // Correct answer — calculate points
    if (dto.useDouble && player.doubleUsed) {
      throw new BadRequestException('2x multiplier already used this game');
    }
    const doubleApplied = !!dto.useDouble && !player.doubleUsed;
    const lifelineApplied = !!cell.lifeline_applied;
    const basePoints = cell.points;
    const pointsAwarded = doubleApplied ? basePoints * 2 : basePoints;

    // Update players immutably
    const updatedPlayers: [Player, Player] = [
      { ...row.players[0] },
      { ...row.players[1] },
    ];
    updatedPlayers[myIndex] = {
      ...updatedPlayers[myIndex],
      score: updatedPlayers[myIndex].score + pointsAwarded,
      doubleUsed: doubleApplied ? true : updatedPlayers[myIndex].doubleUsed,
    };

    // Update board immutably
    const updatedBoard: BoardCell[][] = row.board.map((rowCells: BoardCell[]) =>
      rowCells.map((c: BoardCell) => {
        if (c.question_id !== dto.questionId) return c;
        return {
          ...c,
          answered: true,
          answered_by: player.name,
          points_awarded: pointsAwarded,
          double_armed: doubleApplied ? true : c.double_armed,
        };
      }),
    );

    // Switch turns and check game end
    const nextIndex: 0 | 1 = myIndex === 0 ? 1 : 0;
    const allAnswered = updatedBoard.flat().every((c: BoardCell) => c.answered);
    const mathWin = !allAnswered && this.isMathematicallyWon(updatedPlayers, updatedBoard);
    const gameOver = allAnswered || mathWin;
    const newStatus = gameOver ? 'finished' : 'active';

    const lastResult: OnlineLastResult = {
      questionId: dto.questionId,
      correct: true,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      points_awarded: pointsAwarded,
      player_scores: [updatedPlayers[0].score, updatedPlayers[1].score],
      lifeline_used: lifelineApplied,
      double_used: doubleApplied,
      original_image_url: question.image_url ?? undefined,
    };

    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .update({
        players: updatedPlayers,
        board: updatedBoard,
        current_player_index: gameOver ? row.current_player_index : nextIndex,
        status: newStatus,
        turn_state: null,
        last_result: lastResult,
        turn_started_at: gameOver ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .eq('current_player_index', myIndex) // CAS: prevent double-score on retry
      .select('*')
      .single();

    if (error || !data) throw new BadRequestException('Failed to record answer');

    this.logger.debug(
      JSON.stringify({ event: 'answer_submitted', gameId, userId, correct: true, pointsAwarded, newStatus }),
    );

    if (gameOver) {
      this.returnQuestionsToPool(row.pool_question_ids ?? []);
      this.saveOnlineMatchHistory(row, updatedPlayers, gameId);
    }

    return this.toPublicView(data as OnlineGameRow, userId);
  }

  async submitTop5Guess(userId: string, gameId: string, dto: OnlineTop5GuessDto): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);
    this.assertActive(row);
    this.assertMyTurn(row, userId);

    if (!row.turn_state || row.turn_state.phase !== 'top5' || row.turn_state.questionId !== dto.questionId) {
      throw new BadRequestException('No active Top 5 question matching that ID');
    }

    const question = row.questions.find((q: GeneratedQuestion) => q.id === dto.questionId && q.category === 'TOP_5');
    if (!question) throw new NotFoundException('Top 5 question not found');

    const cell = row.board.flat().find((c: BoardCell) => c.question_id === dto.questionId);
    if (!cell) throw new NotFoundException('Board cell not found');
    if (cell.answered) throw new BadRequestException('Question already answered');

    const top5Entries = question.meta?.['top5'] as Top5Entry[];
    const myIndex: 0 | 1 = row.host_id === userId ? 0 : 1;
    const player = row.players[myIndex];

    // Get or init progress from turn_state (source of truth during active question)
    const progress: Top5Progress = row.turn_state.top5Progress ?? {
      filledSlots: [null, null, null, null, null],
      wrongGuesses: [],
      complete: false,
      won: false,
    };

    const matchedIndex = this.answerValidator.matchTop5Entry(top5Entries, dto.answer);

    if (matchedIndex >= 0) {
      const entry = top5Entries[matchedIndex];
      if (progress.filledSlots[matchedIndex] !== null) {
        // Already found — no-op, return current state
        const { data, error } = await this.supabaseService.client
          .from('online_games')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', gameId)
          .select('*')
          .single();
        if (error || !data) throw new BadRequestException('Failed to update game');
        return this.toPublicView(data as OnlineGameRow, userId);
      }
      // Fill the slot
      const newFilledSlots = [...progress.filledSlots] as Array<Top5Entry | null>;
      newFilledSlots[matchedIndex] = { name: entry.name, stat: entry.stat };
      progress.filledSlots = newFilledSlots;
    } else {
      progress.wrongGuesses = [...progress.wrongGuesses, { name: dto.answer, stat: '' }];
    }

    const filledCount = progress.filledSlots.filter(Boolean).length;
    const wrongCount = progress.wrongGuesses.length;
    const allFilled = filledCount === 5;
    const tooManyWrong = wrongCount >= 2;
    const complete = allFilled || tooManyWrong;

    if (!complete) {
      // Update turn_state progress and broadcast via Realtime
      const updatedTurnState: OnlineTurnState = {
        ...row.turn_state,
        top5Progress: progress,
      };

      const { data, error } = await this.supabaseService.client
        .from('online_games')
        .update({
          turn_state: updatedTurnState,
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId)
        .select('*')
        .single();

      if (error || !data) throw new BadRequestException('Failed to update Top 5 progress');
      return this.toPublicView(data as OnlineGameRow, userId);
    }

    // Complete — calculate result
    progress.complete = true;
    progress.won = allFilled;

    if (dto.useDouble && player.doubleUsed) {
      throw new BadRequestException('2x multiplier already used this game');
    }
    const doubleApplied = !!dto.useDouble && !player.doubleUsed;
    const basePoints = allFilled ? cell.points : 0;
    const pointsAwarded = allFilled && doubleApplied ? basePoints * 2 : basePoints;

    // Update players immutably
    const updatedPlayers: [Player, Player] = [
      { ...row.players[0] },
      { ...row.players[1] },
    ];
    updatedPlayers[myIndex] = {
      ...updatedPlayers[myIndex],
      score: updatedPlayers[myIndex].score + pointsAwarded,
      doubleUsed: doubleApplied ? true : updatedPlayers[myIndex].doubleUsed,
    };

    // Update board immutably
    const updatedBoard: BoardCell[][] = row.board.map((rowCells: BoardCell[]) =>
      rowCells.map((c: BoardCell) => {
        if (c.question_id !== dto.questionId) return c;
        return {
          ...c,
          answered: true,
          answered_by: player.name,
          points_awarded: pointsAwarded,
        };
      }),
    );

    const nextIndex: 0 | 1 = myIndex === 0 ? 1 : 0;
    const allAnswered = updatedBoard.flat().every((c: BoardCell) => c.answered);
    const mathWin = !allAnswered && this.isMathematicallyWon(updatedPlayers, updatedBoard);
    const gameOver = allAnswered || mathWin;
    const newStatus = gameOver ? 'finished' : 'active';

    const lastResult: OnlineLastResult = {
      questionId: dto.questionId,
      correct: allFilled,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      points_awarded: pointsAwarded,
      player_scores: [updatedPlayers[0].score, updatedPlayers[1].score],
      lifeline_used: false,
      double_used: doubleApplied,
      top5Won: allFilled,
      top5FilledSlots: progress.filledSlots,
      top5WrongGuesses: progress.wrongGuesses,
    };

    const updatedTop5Progress = { ...row.top5_progress, [dto.questionId]: progress };

    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .update({
        players: updatedPlayers,
        board: updatedBoard,
        top5_progress: updatedTop5Progress,
        current_player_index: gameOver ? row.current_player_index : nextIndex,
        status: newStatus,
        turn_state: null,
        last_result: lastResult,
        turn_started_at: gameOver ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .select('*')
      .single();

    if (error || !data) throw new BadRequestException('Failed to complete Top 5 question');

    if (gameOver) {
      this.returnQuestionsToPool(row.pool_question_ids ?? []);
      this.saveOnlineMatchHistory(row, updatedPlayers, gameId);
    }

    return this.toPublicView(data as OnlineGameRow, userId);
  }

  async useLifeline(userId: string, gameId: string, dto: OnlineUseLifelineDto): Promise<OnlineHintResult> {
    const row = await this.fetchGame(gameId, userId);
    this.assertActive(row);
    this.assertMyTurn(row, userId);

    const myIndex: 0 | 1 = row.host_id === userId ? 0 : 1;
    const player = row.players[myIndex];

    if (player.lifelineUsed) {
      throw new BadRequestException('50-50 already used this game (one per player)');
    }

    const question = row.questions.find((q: GeneratedQuestion) => q.id === dto.questionId);
    if (!question) throw new NotFoundException('Question not found');
    if (!question.fifty_fifty_applicable) throw new BadRequestException('50-50 not applicable for this question type');
    if (!question.fifty_fifty_hint) throw new BadRequestException('No decoy answer available for this question');

    // Find and update the cell
    const updatedBoard: BoardCell[][] = row.board.map((rowCells: BoardCell[]) =>
      rowCells.map((c: BoardCell) => {
        if (c.question_id !== dto.questionId || c.lifeline_applied) return c;
        return { ...c, points: 1, lifeline_applied: true };
      }),
    );

    const updatedPlayers: [Player, Player] = [
      { ...row.players[0] },
      { ...row.players[1] },
    ];
    updatedPlayers[myIndex] = { ...updatedPlayers[myIndex], lifelineUsed: true };

    // Update turn_state question public view to reflect new points
    let updatedTurnState = row.turn_state;
    if (updatedTurnState) {
      updatedTurnState = { ...updatedTurnState };
    }

    const { error } = await this.supabaseService.client
      .from('online_games')
      .update({
        board: updatedBoard,
        players: updatedPlayers,
        ...(updatedTurnState ? { turn_state: updatedTurnState } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId);

    if (error) throw new BadRequestException('Failed to apply lifeline');

    const options = [question.correct_answer, question.fifty_fifty_hint];
    if (Math.random() < 0.5) options.reverse();

    return { options, points_if_correct: 1 };
  }

  async stopTop5Early(userId: string, gameId: string, questionId: string): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);
    this.assertActive(row);
    this.assertMyTurn(row, userId);

    if (!row.turn_state || row.turn_state.phase !== 'top5' || row.turn_state.questionId !== questionId) {
      throw new BadRequestException('No active Top 5 question');
    }

    const question = row.questions.find((q: GeneratedQuestion) => q.id === questionId && q.category === 'TOP_5');
    if (!question) throw new NotFoundException('Top 5 question not found');

    const cell = row.board.flat().find((c: BoardCell) => c.question_id === questionId);
    if (!cell) throw new NotFoundException('Board cell not found');
    if (cell.answered) throw new BadRequestException('Question already answered');

    const progress = row.turn_state.top5Progress ?? {
      filledSlots: [null, null, null, null, null] as Array<Top5Entry | null>,
      wrongGuesses: [] as Top5Entry[],
      complete: false,
      won: false,
    };

    const filledCount = progress.filledSlots.filter(Boolean).length;
    if (filledCount < 4) throw new BadRequestException('Need at least 4 found to stop early');

    const myIndex: 0 | 1 = row.host_id === userId ? 0 : 1;
    const player = row.players[myIndex];
    const pointsAwarded = 1;

    const updatedPlayers: [Player, Player] = [
      { ...row.players[0] },
      { ...row.players[1] },
    ];
    updatedPlayers[myIndex] = {
      ...updatedPlayers[myIndex],
      score: updatedPlayers[myIndex].score + pointsAwarded,
    };

    const updatedBoard: BoardCell[][] = row.board.map((rowCells: BoardCell[]) =>
      rowCells.map((c: BoardCell) => {
        if (c.question_id !== questionId) return c;
        return { ...c, answered: true, answered_by: player.name, points_awarded: pointsAwarded };
      }),
    );

    const completedProgress: Top5Progress = { ...progress, complete: true, won: true };

    const nextIndex: 0 | 1 = myIndex === 0 ? 1 : 0;
    const allAnswered = updatedBoard.flat().every((c: BoardCell) => c.answered);
    const mathWin = !allAnswered && this.isMathematicallyWon(updatedPlayers, updatedBoard);
    const gameOver = allAnswered || mathWin;
    const newStatus = gameOver ? 'finished' : 'active';

    const lastResult: OnlineLastResult = {
      questionId,
      correct: true,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      points_awarded: pointsAwarded,
      player_scores: [updatedPlayers[0].score, updatedPlayers[1].score],
      lifeline_used: false,
      double_used: false,
      top5Won: true,
      top5FilledSlots: completedProgress.filledSlots,
      top5WrongGuesses: completedProgress.wrongGuesses,
    };

    const updatedTop5Progress = { ...row.top5_progress, [questionId]: completedProgress };

    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .update({
        players: updatedPlayers,
        board: updatedBoard,
        top5_progress: updatedTop5Progress,
        current_player_index: gameOver ? row.current_player_index : nextIndex,
        status: newStatus,
        turn_state: null,
        last_result: lastResult,
        turn_started_at: gameOver ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .select('*')
      .single();

    if (error || !data) throw new BadRequestException('Failed to stop Top 5 early');

    if (gameOver) {
      this.returnQuestionsToPool(row.pool_question_ids ?? []);
      this.saveOnlineMatchHistory(row, updatedPlayers, gameId);
    }

    return this.toPublicView(data as OnlineGameRow, userId);
  }

  async continueToBoard(userId: string, gameId: string): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);

    // Only the active player clears last_result (they pick the next question).
    // The spectating player calling this is a no-op to prevent racing:
    // if spectator clears before the active player sees it, active player misses the result.
    const isActivePlayer = (row.host_id === userId ? 0 : 1) === row.current_player_index;

    if (isActivePlayer && row.last_result) {
      const { data, error } = await this.supabaseService.client
        .from('online_games')
        .update({
          last_result: null,
          turn_state: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId)
        .eq('current_player_index', row.current_player_index) // CAS: prevent stale clear
        .select('*')
        .single();

      if (error || !data) {
        // CAS failed or already cleared — return current state
        const fresh = await this.fetchGame(gameId, userId);
        return this.toPublicView(fresh, userId);
      }
      return this.toPublicView(data as OnlineGameRow, userId);
    }

    // Non-active player or no result — just return current state
    return this.toPublicView(row, userId);
  }

  async abandonGame(userId: string, gameId: string): Promise<{ ok: boolean }> {
    const row = await this.fetchGame(gameId, userId);

    this.returnQuestionsToPool(row.pool_question_ids ?? []);

    const { error } = await this.supabaseService.client
      .from('online_games')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('id', gameId);

    if (error) throw new BadRequestException('Failed to abandon game');
    return { ok: true };
  }

  async getGame(userId: string, gameId: string): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);
    return this.toPublicView(row, userId);
  }

  async getQuestion(
    userId: string,
    gameId: string,
    questionId: string,
  ): Promise<Omit<GeneratedQuestion, 'correct_answer' | 'fifty_fifty_hint'>> {
    const row = await this.fetchGame(gameId, userId);
    this.assertActive(row);
    this.assertMyTurn(row, userId);

    const question = row.questions.find((q: GeneratedQuestion) => q.id === questionId);
    if (!question) throw new NotFoundException('Question not found');

    const {
      correct_answer,
      fifty_fifty_hint,
      difficulty_factors,
      source_question_text,
      source_explanation,
      ...safe
    } = question as GeneratedQuestion & {
      difficulty_factors?: unknown;
      source_question_text?: string;
      source_explanation?: string;
    };

    return { ...safe, correct_answer: '', fifty_fifty_hint: null } as unknown as Omit<
      GeneratedQuestion,
      'correct_answer' | 'fifty_fifty_hint'
    >;
  }

  async previewInvite(inviteCode: string): Promise<{ hostUsername: string; status: string }> {
    const { data: row } = await this.supabaseService.client
      .from('online_games')
      .select('host_id, status, players')
      .eq('invite_code', inviteCode.toUpperCase())
      .maybeSingle();

    if (!row) throw new NotFoundException('Invite code not found');
    const typedRow = row as { host_id: string; status: string; players: [Player, Player] };
    const hostUsername = typedRow.players?.[0]?.name ?? 'Host';
    return { hostUsername, status: typedRow.status };
  }

  async listMyGames(userId: string): Promise<OnlineGameSummary[]> {
    const { data } = await this.supabaseService.client
      .from('online_games')
      .select('id, status, invite_code, host_id, guest_id, current_player_index, players, turn_started_at, updated_at')
      .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
      .in('status', ['waiting', 'active'])
      .order('updated_at', { ascending: false })
      .limit(20);

    if (!data) return [];

    return (data as Array<{
      id: string;
      status: string;
      invite_code: string;
      host_id: string;
      guest_id: string | null;
      current_player_index: 0 | 1;
      players: [Player, Player];
      turn_started_at: string | null;
      updated_at: string;
    }>).map((row) => {
      const myRole: 'host' | 'guest' = row.host_id === userId ? 'host' : 'guest';
      const myIndex = myRole === 'host' ? 0 : 1;
      const opponentIndex = myRole === 'host' ? 1 : 0;
      return {
        id: row.id,
        status: row.status as OnlineGameSummary['status'],
        inviteCode: row.invite_code,
        myRole,
        isMyTurn: row.current_player_index === myIndex,
        myScore: row.players?.[myIndex]?.score ?? 0,
        opponentUsername: row.players?.[opponentIndex]?.name ?? null,
        updatedAt: row.updated_at,
      };
    });
  }

  async getGameCount(userId: string): Promise<{ count: number }> {
    const { count } = await this.supabaseService.client
      .from('online_games')
      .select('id', { count: 'exact', head: true })
      .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
      .in('status', ['waiting', 'active']);

    return { count: count ?? 0 };
  }

  async joinQueue(userId: string): Promise<OnlinePublicView> {
    // Look for a waiting game without a guest (not own game)
    const { data: existing } = await this.supabaseService.client
      .from('online_games')
      .select('*')
      .eq('status', 'waiting')
      .is('guest_id', null)
      .neq('host_id', userId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return this.joinByCode(userId, { inviteCode: (existing as OnlineGameRow).invite_code });
    }

    // No game to join — create a waiting game for others to find
    return this.createGame(userId, { playerName: 'Player' });
  }

  // ── Timeout cron (called by scheduler) ─────────────────────────────────────

  async timeoutTurn(row: OnlineGameRow): Promise<void> {
    if (row.status !== 'active') return;

    const myIndex = row.current_player_index;
    const nextIndex: 0 | 1 = myIndex === 0 ? 1 : 0;

    let updatedBoard = row.board;
    let updatedPlayers: [Player, Player] = [{ ...row.players[0] }, { ...row.players[1] }];
    let lastResult: OnlineLastResult | null = null;
    let updatedTop5Progress = row.top5_progress;

    if (row.turn_state && row.turn_state.questionId) {
      const { questionId } = row.turn_state;
      const question = row.questions.find((q: GeneratedQuestion) => q.id === questionId);
      const cell = row.board.flat().find((c: BoardCell) => c.question_id === questionId);

      if (cell && !cell.answered) {
        updatedBoard = row.board.map((rowCells: BoardCell[]) =>
          rowCells.map((c: BoardCell) => {
            if (c.question_id !== questionId) return c;
            return { ...c, answered: true, answered_by: 'timeout', points_awarded: 0 };
          }),
        );

        if (row.turn_state.phase === 'top5') {
          const progress = row.turn_state.top5Progress ?? {
            filledSlots: [null, null, null, null, null] as Array<Top5Entry | null>,
            wrongGuesses: [] as Top5Entry[],
            complete: true,
            won: false,
          };
          const completedProgress: Top5Progress = { ...progress, complete: true, won: false };
          updatedTop5Progress = { ...row.top5_progress, [questionId]: completedProgress };
        }

        lastResult = {
          questionId,
          correct: false,
          correct_answer: question?.correct_answer ?? '',
          explanation: question?.explanation ?? '',
          points_awarded: 0,
          player_scores: [updatedPlayers[0].score, updatedPlayers[1].score],
          lifeline_used: false,
          double_used: false,
        };
      }
    }

    const allAnswered = updatedBoard.flat().every((c: BoardCell) => c.answered);
    const mathWin = !allAnswered && this.isMathematicallyWon(updatedPlayers, updatedBoard);
    const gameOver = allAnswered || mathWin;
    const newStatus = gameOver ? 'finished' : 'active';

    await this.supabaseService.client
      .from('online_games')
      .update({
        board: updatedBoard,
        players: updatedPlayers,
        top5_progress: updatedTop5Progress,
        current_player_index: gameOver ? row.current_player_index : nextIndex,
        status: newStatus,
        turn_state: null,
        last_result: lastResult,
        turn_started_at: gameOver ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (gameOver) {
      this.returnQuestionsToPool(row.pool_question_ids ?? []);
      this.saveOnlineMatchHistory(row, updatedPlayers, row.id);
    }

    this.logger.debug(
      JSON.stringify({ event: 'turn_timeout', gameId: row.id, newStatus }),
    );
  }

  // ── Cron: process expired turns ─────────────────────────────────────────────

  @Cron('*/5 * * * *') // every 5 minutes
  async processExpiredTurns(): Promise<void> {
    const acquired = await this.redisService.acquireLock('lock:cron:online-expired-turns', 240);
    if (!acquired) return;

    try {
      const TIMEOUT_SECONDS = 120; // 2 minutes per turn
      const cutoff = new Date(Date.now() - TIMEOUT_SECONDS * 1000).toISOString();

      const { data: expired } = await this.supabaseService.client
        .from('online_games')
        .select('*')
        .eq('status', 'active')
        .not('turn_started_at', 'is', null)
        .lt('turn_started_at', cutoff)
        .limit(20);

      if (!expired || expired.length === 0) return;

      this.logger.debug(`[processExpiredTurns] Processing ${expired.length} timed-out turns`);

      for (const row of expired as OnlineGameRow[]) {
        await this.timeoutTurn(row).catch((err: Error) =>
          this.logger.error(`[processExpiredTurns] Failed for game ${row.id}: ${err.message}`),
        );
      }
    } finally {
      await this.redisService.releaseLock('lock:cron:online-expired-turns');
    }
  }

  // ── Answer result helpers (for controller compatibility) ────────────────────

  /** Returns a flat OnlineAnswerResult shape for callers that expect it (legacy). */
  async submitAnswerResult(userId: string, gameId: string, dto: OnlineSubmitAnswerDto): Promise<OnlineAnswerResult> {
    const view = await this.submitAnswer(userId, gameId, dto);
    const lr = view.lastResult;
    if (!lr) {
      // Wrong answer — no result yet
      return {
        correct: false,
        correct_answer: '',
        explanation: '',
        points_awarded: 0,
        player_scores: [view.players[0].score, view.players[1].score] as [number, number],
        lifeline_used: false,
        double_used: false,
      };
    }
    return {
      correct: lr.correct,
      correct_answer: lr.correct_answer,
      explanation: lr.explanation,
      points_awarded: lr.points_awarded,
      player_scores: lr.player_scores,
      lifeline_used: lr.lifeline_used,
      double_used: lr.double_used,
      original_image_url: lr.original_image_url,
    };
  }

  async submitTop5GuessResult(userId: string, gameId: string, dto: OnlineTop5GuessDto): Promise<OnlineTop5GuessResult> {
    const row = await this.fetchGame(gameId, userId);
    const currentProgress = row.turn_state?.top5Progress ?? null;

    const view = await this.submitTop5Guess(userId, gameId, dto);
    const updatedRow = await this.fetchGame(gameId, userId);

    const lr = updatedRow.last_result;
    const newProgress = updatedRow.turn_state?.top5Progress ?? updatedRow.top5_progress[dto.questionId] ?? null;

    if (!lr) {
      // Not complete yet
      return {
        matched: !!newProgress && newProgress.filledSlots.some(Boolean),
        position: null,
        fullName: dto.answer,
        stat: '',
        wrongCount: newProgress?.wrongGuesses.length ?? 0,
        filledCount: newProgress?.filledSlots.filter(Boolean).length ?? 0,
        filledSlots: newProgress?.filledSlots ?? [null, null, null, null, null],
        wrongGuesses: newProgress?.wrongGuesses ?? [],
        complete: false,
        won: false,
      };
    }

    return {
      matched: lr.top5Won ?? false,
      position: null,
      fullName: '',
      stat: '',
      wrongCount: lr.top5WrongGuesses?.length ?? 0,
      filledCount: lr.top5FilledSlots?.filter(Boolean).length ?? 0,
      filledSlots: lr.top5FilledSlots ?? [null, null, null, null, null],
      wrongGuesses: lr.top5WrongGuesses ?? [],
      complete: true,
      won: lr.top5Won ?? false,
      points_awarded: lr.points_awarded,
      player_scores: lr.player_scores,
      correct_answer: lr.correct_answer,
      explanation: lr.explanation,
    };
  }
}
