import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { clearLogFile } from '../logger.util';

import { CacheService } from '../cache/cache.service';
import { QuestionsService } from '../questions/questions.service';
import { QuestionPoolService } from '../questions/question-pool.service';
import { AnswerValidator } from '../questions/validators/answer.validator';
import {
  GeneratedQuestion,
  DIFFICULTY_POINTS,
  CATEGORY_LABELS,
  Difficulty,
  CATEGORY_DIFFICULTY_SLOTS,
  CATEGORY_SLOT_POINTS,
} from '../questions/question.types';
import {
  GameSession,
  Player,
  CreateGameDto,
  SubmitAnswerDto,
  UseLifelineDto,
  Top5GuessDto,
  Top5GuessResult,
  AnswerResult,
  HintResult,
} from './game.types';
import { Top5Entry, Top5Progress } from '../questions/question.types';

const CATEGORIES_ORDER = ['HISTORY', 'PLAYER_ID', 'HIGHER_OR_LOWER', 'GUESS_SCORE', 'TOP_5', 'GEOGRAPHY', 'LOGO_QUIZ'] as const;

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly questionsService: QuestionsService,
    private readonly questionPoolService: QuestionPoolService,
    private readonly answerValidator: AnswerValidator,
  ) {}

  async createGame(dto: CreateGameDto): Promise<GameSession> {
    clearLogFile();
    const gameId = crypto.randomUUID();
    this.logger.debug(`Creating game ${gameId} for ${dto.player1Name} vs ${dto.player2Name}`);

    const excludeNewsQuestionIds = dto.excludeNewsQuestionIds?.filter(Boolean).slice(0, 100) ?? [];
    const playerIds = dto.playerIds?.filter(Boolean) ?? [];
    const result = await this.questionPoolService.drawBoard(excludeNewsQuestionIds, true, playerIds);
    let questions: GeneratedQuestion[] = result.questions;
    const poolQuestionIds = result.poolQuestionIds;
    questions = questions.map((question) => this.ensureQuestionLocaleState(question));

    // Refill pool in background after drawing
    void this.questionPoolService.refillIfNeeded().catch((err) =>
      this.logger.error(`[createGame] Pool refill failed: ${(err as Error).message}`),
    );

    const players: [Player, Player] = [
      { name: dto.player1Name, score: 0, lifelineUsed: false, doubleUsed: false },
      { name: dto.player2Name, score: 0, lifelineUsed: false, doubleUsed: false },
    ];

    const usedQuestionIds = new Set<string>();
    const board = CATEGORIES_ORDER.map((category) => {
      const slots = CATEGORY_DIFFICULTY_SLOTS[category];
      const slotPoints = CATEGORY_SLOT_POINTS[category];
      return slots.map((difficulty, slotIndex) => {
        const question = questions.find(
          (q) => q.category === category && q.difficulty === difficulty && !usedQuestionIds.has(q.id),
        );
        if (!question) this.logger.warn(`Missing question for ${category}/${difficulty}`);
        if (question) usedQuestionIds.add(question.id);
        const points = slotPoints?.[slotIndex] ?? question?.points ?? DIFFICULTY_POINTS[difficulty];
        return {
          question_id: question?.id || '',
          category,
          difficulty,
          points,
          answered: false,
        };
      });
    });

    const session: GameSession = {
      id: gameId,
      players,
      currentPlayerIndex: 0,
      questions: questions.map((q) => { const { _embedding, ...rest } = q as typeof q & { _embedding?: unknown }; void _embedding; return rest as typeof q; }),
      board,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      top5Progress: {},
      poolQuestionIds,
    };

    await this.cacheService.set(`game:${gameId}`, session, 86400); // 24h TTL
    return session;
  }

  private ensureQuestionLocaleState(question: GeneratedQuestion): GeneratedQuestion {
    return {
      ...question,
      source_question_text: question.source_question_text ?? question.question_text,
      source_explanation: question.source_explanation ?? question.explanation,
    };
  }

  async getGame(gameId: string): Promise<GameSession> {
    const session = await this.cacheService.get<GameSession>(`game:${gameId}`);
    if (!session) throw new NotFoundException(`Game ${gameId} not found`);
    return session;
  }

  async getBoardState(gameId: string) {
    const session = await this.getGame(gameId);
    const categoryLabels = CATEGORY_LABELS;
    return {
      id: session.id,
      status: session.status,
      players: session.players.map((p) => ({ name: p.name, score: p.score, lifelineUsed: p.lifelineUsed, doubleUsed: p.doubleUsed })),
      currentPlayerIndex: session.currentPlayerIndex,
      board: session.board.map((row) =>
        row.map((cell) => ({
          question_id: cell.question_id,
          category: cell.category,
          category_label: categoryLabels[cell.category],
          difficulty: cell.difficulty,
          points: cell.points,
          answered: cell.answered,
          answered_by: cell.answered_by,
        })),
      ),
      categories: CATEGORIES_ORDER.map((c) => ({ key: c, label: categoryLabels[c] })),
    };
  }

  async getQuestion(gameId: string, questionId: string): Promise<GeneratedQuestion> {
    const session = await this.getGame(gameId);
    const question = session.questions.find((q) => q.id === questionId);
    if (!question) throw new NotFoundException(`Question ${questionId} not found`);

    // Don't expose the correct answer or scoring internals to the client
    const {
      correct_answer,
      fifty_fifty_hint,
      difficulty_factors,
      source_question_text,
      source_explanation,
      ...safeQuestion
    } = question;
    return { ...safeQuestion, correct_answer: '', fifty_fifty_hint: null } as GeneratedQuestion;
  }

  /** Admin-only helper for e2e simulation scripts. Bypasses the answer-stripping in getQuestion. */
  async peekAnswer(gameId: string, questionId: string): Promise<{ correct_answer: string; answer_type?: string }> {
    const session = await this.getGame(gameId);
    const question = session.questions.find((q) => q.id === questionId);
    if (!question) throw new NotFoundException(`Question ${questionId} not found`);
    return { correct_answer: question.correct_answer, answer_type: question.difficulty_factors?.answer_type };
  }

  async submitAnswer(gameId: string, dto: SubmitAnswerDto): Promise<AnswerResult> {
    const session = await this.getGame(gameId);

    if (session.status === 'FINISHED') {
      throw new BadRequestException('Game is already finished');
    }

    const question = session.questions.find((q) => q.id === dto.questionId);
    if (!question) throw new NotFoundException('Question not found');

    // Find board cell
    const cell = session.board.flat().find((c) => c.question_id === dto.questionId);
    if (!cell) throw new NotFoundException('Board cell not found');
    if (cell.answered) throw new BadRequestException('Question already answered');

    const player = session.players[dto.playerIndex];
    const lifelineUsed = !!cell.lifeline_applied;

    if (dto.useDouble && player.doubleUsed) {
      throw new BadRequestException('2x multiplier already used this game');
    }
    const doubleApplied = !!dto.useDouble && !player.doubleUsed;

    const correct = this.answerValidator.validate(question, dto.answer);
    // If 50-50 was used on this question, cell.points is already reduced to 1
    const basePoints = correct ? cell.points : 0;
    const points_awarded = correct && doubleApplied ? basePoints * 2 : basePoints;

    if (correct) {
      session.players[dto.playerIndex].score += points_awarded;
    }
    // Consume 2x as soon as it is armed and submitted — correct or not
    if (doubleApplied) {
      session.players[dto.playerIndex].doubleUsed = true;
    }
    if (doubleApplied) {
      cell.double_armed = true;
    }

    cell.answered = true;
    cell.answered_by = player.name;
    cell.points_awarded = points_awarded;

    // Switch turns
    session.currentPlayerIndex = dto.playerIndex === 0 ? 1 : 0;

    // Check if game is finished (all answered or mathematical win)
    const allAnswered = session.board.flat().every((c) => c.answered);
    if (allAnswered || this.isMathematicallyWon(session)) {
      await this.finishSession(session);
    }

    session.updatedAt = new Date();
    await this.cacheService.set(`game:${session.id}`, session, 86400);

    return {
      correct,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      points_awarded,
      player_scores: [session.players[0].score, session.players[1].score],
      lifeline_used: lifelineUsed,
      double_used: doubleApplied && correct,
    };
  }

  async useLifeline(gameId: string, dto: UseLifelineDto): Promise<HintResult> {
    const session = await this.getGame(gameId);

    const player = session.players[dto.playerIndex];
    if (player.lifelineUsed) {
      throw new BadRequestException('50-50 already used this game (one per player)');
    }

    const question = session.questions.find((q) => q.id === dto.questionId);
    if (!question) throw new NotFoundException('Question not found');

    if (!question.fifty_fifty_applicable) {
      throw new BadRequestException('50-50 not applicable for this question type');
    }

    if (!question.fifty_fifty_hint) {
      throw new BadRequestException('No decoy answer available for this question');
    }

    // Reduce points to 1 for this question and mark 50-50 as applied
    const cell = session.board.flat().find((c) => c.question_id === dto.questionId);
    if (cell && !cell.lifeline_applied) {
      cell.points = 1;
      cell.lifeline_applied = true;
    }

    player.lifelineUsed = true;

    session.updatedAt = new Date();
    await this.cacheService.set(`game:${session.id}`, session, 86400);

    // Shuffle correct + decoy so UI order is random
    const options = [question.correct_answer, question.fifty_fifty_hint];
    if (Math.random() < 0.5) options.reverse();

    return {
      options,
      points_if_correct: 1,
    };
  }

  async overrideAnswer(
    gameId: string,
    questionId: string,
    isCorrect: boolean,
    playerIndex: 0 | 1,
  ): Promise<AnswerResult> {
    const session = await this.getGame(gameId);
    const question = session.questions.find((q) => q.id === questionId);
    if (!question) throw new NotFoundException('Question not found');

    const cell = session.board.flat().find((c) => c.question_id === questionId);
    if (!cell) throw new NotFoundException('Board cell not found');

    const basePoints = isCorrect ? cell.points : 0;
    // If 2x was armed on this cell, apply it on override too (already consumed)
    const doubleApply = isCorrect && !!cell.double_armed;
    const newPoints = doubleApply ? basePoints * 2 : basePoints;

    // Adjust score
    const previousPoints = cell.points_awarded || 0;
    const scoreDelta = newPoints - previousPoints;

    session.players[playerIndex].score = Math.max(
      0,
      session.players[playerIndex].score + scoreDelta,
    );
    cell.points_awarded = newPoints;

    session.updatedAt = new Date();
    await this.cacheService.set(`game:${session.id}`, session, 86400);

    return {
      correct: isCorrect,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      points_awarded: newPoints,
      player_scores: [session.players[0].score, session.players[1].score],
      lifeline_used: false,
      double_used: doubleApply,
    };
  }

  async submitTop5Guess(gameId: string, dto: Top5GuessDto): Promise<Top5GuessResult> {
    const session = await this.getGame(gameId);

    if (session.status === 'FINISHED') {
      throw new BadRequestException('Game is already finished');
    }

    const question = session.questions.find((q) => q.id === dto.questionId);
    if (!question || question.category !== 'TOP_5') {
      throw new NotFoundException('Top 5 question not found');
    }

    const cell = session.board.flat().find((c) => c.question_id === dto.questionId);
    if (!cell) throw new NotFoundException('Board cell not found');
    if (cell.answered) throw new BadRequestException('Question already answered');

    const top5Entries = question.meta?.['top5'] as Top5Entry[];

    // Get or initialise progress
    if (!session.top5Progress[dto.questionId]) {
      session.top5Progress[dto.questionId] = {
        filledSlots: [null, null, null, null, null],
        wrongGuesses: [],
        complete: false,
        won: false,
      };
    }
    const progress = session.top5Progress[dto.questionId];

    const matchedIndex = this.answerValidator.matchTop5Entry(top5Entries, dto.answer);

    let matched = false;
    let position: number | null = null;
    let fullName = dto.answer;
    let stat = '';

    if (matchedIndex >= 0) {
      const entry = top5Entries[matchedIndex];
      // Already found?
      if (progress.filledSlots[matchedIndex] !== null) {
        // Treat as a no-op (already filled) — don't penalise
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
      // Not in top 5 — record as wrong guess
      const statForWrong = ''; // we don't know their real stat
      progress.wrongGuesses.push({ name: dto.answer, stat: statForWrong });
    }

    const filledCount = progress.filledSlots.filter(Boolean).length;
    const wrongCount = progress.wrongGuesses.length;
    const allFilled = filledCount === 5;
    const tooManyWrong = wrongCount >= 2;
    const complete = allFilled || tooManyWrong;

    if (complete) {
      progress.complete = true;
      progress.won = allFilled;

      const player = session.players[dto.playerIndex];
      const doubleApplied = !!dto.useDouble && !player.doubleUsed;
      const basePoints = allFilled ? cell.points : 0;
      const points_awarded = allFilled && doubleApplied ? basePoints * 2 : basePoints;

      if (allFilled) {
        session.players[dto.playerIndex].score += points_awarded;
      }
      // Consume 2x when the Top 5 question ends (win or fail) — not only on perfect solve
      if (doubleApplied) {
        session.players[dto.playerIndex].doubleUsed = true;
      }

      cell.answered = true;
      cell.answered_by = player.name;
      cell.points_awarded = points_awarded;

      session.currentPlayerIndex = dto.playerIndex === 0 ? 1 : 0;

      const allAnswered = session.board.flat().every((c) => c.answered);
      if (allAnswered || this.isMathematicallyWon(session)) {
        await this.finishSession(session);
      }

      session.updatedAt = new Date();
      await this.cacheService.set(`game:${session.id}`, session, 86400);

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
        points_awarded,
        player_scores: [session.players[0].score, session.players[1].score],
        correct_answer: question.correct_answer,
        explanation: question.explanation,
      };
    }

    session.updatedAt = new Date();
    await this.cacheService.set(`game:${session.id}`, session, 86400);

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

  async stopTop5Early(gameId: string, dto: { questionId: string; playerIndex: 0 | 1 }): Promise<Top5GuessResult> {
    const session = await this.getGame(gameId);
    const question = session.questions.find((q) => q.id === dto.questionId && q.category === 'TOP_5');
    if (!question) throw new NotFoundException('Top 5 question not found');

    const cell = session.board.flat().find((c) => c.question_id === dto.questionId);
    if (!cell) throw new NotFoundException('Board cell not found');
    if (cell.answered) throw new BadRequestException('Question already answered');

    const progress = session.top5Progress[dto.questionId];
    const filledCount = progress?.filledSlots.filter(Boolean).length ?? 0;
    if (filledCount < 4) throw new BadRequestException('Need at least 4 found to stop early');

    const points_awarded = 1;
    session.players[dto.playerIndex].score += points_awarded;
    cell.answered = true;
    cell.answered_by = session.players[dto.playerIndex].name;
    cell.points_awarded = points_awarded;

    if (progress) {
      progress.complete = true;
      progress.won = true;
    }

    session.currentPlayerIndex = dto.playerIndex === 0 ? 1 : 0;
    const allAnswered = session.board.flat().every((c) => c.answered);
    if (allAnswered || this.isMathematicallyWon(session)) {
      await this.finishSession(session);
    }

    session.updatedAt = new Date();
    await this.cacheService.set(`game:${session.id}`, session, 86400);

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
      points_awarded,
      player_scores: [session.players[0].score, session.players[1].score],
      correct_answer: question.correct_answer,
      explanation: question.explanation,
    };
  }

  /** Returns true if one player's lead is insurmountable: even if the trailing player
   *  answered every remaining question correctly (plus used their double once), they
   *  cannot overtake the leader. */
  private isMathematicallyWon(session: GameSession): boolean {
    const unanswered = session.board.flat().filter((c) => !c.answered);
    if (unanswered.length === 0) return false;

    const totalRemaining = unanswered.reduce((sum, c) => sum + c.points, 0);
    const maxCellPoints = Math.max(...unanswered.map((c) => c.points));

    for (let i = 0; i < 2; i++) {
      const j = 1 - i;
      const lead = session.players[i].score - session.players[j].score;
      const doubleBonus = session.players[j].doubleUsed ? 0 : maxCellPoints;
      if (lead > totalRemaining + doubleBonus) return true;
    }
    return false;
  }

  /** Marks the session as FINISHED and returns ALL pool questions back to the pool. */
  private async finishSession(session: GameSession): Promise<void> {
    session.status = 'FINISHED';
    const poolIds = (session.poolQuestionIds ?? []).filter(Boolean);
    if (poolIds.length > 0) {
      this.logger.debug(`[finishSession] Returning ${poolIds.length} questions to pool`);
      await this.questionPoolService.returnUnansweredToPool(poolIds).catch((err) =>
        this.logger.error(`[finishSession] Failed to return questions to pool: ${(err as Error).message}`),
      );
    }
  }

  async endGame(gameId: string): Promise<GameSession> {
    const session = await this.getGame(gameId);
    await this.finishSession(session);
    session.updatedAt = new Date();
    await this.cacheService.set(`game:${session.id}`, session, 86400);
    return session;
  }
}
