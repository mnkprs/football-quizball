import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CacheService } from '../cache/cache.service';
import { QuestionsService } from '../questions/questions.service';
import { AnswerValidator } from '../questions/validators/answer.validator';
import { GeneratedQuestion, DIFFICULTY_POINTS, CATEGORY_LABELS } from '../questions/question.types';
import {
  GameSession,
  Player,
  CreateGameDto,
  SubmitAnswerDto,
  UseLifelineDto,
  AnswerResult,
  HintResult,
} from './game.types';

const CATEGORIES_ORDER = ['HISTORY', 'PLAYER_ID', 'LOGO_QUIZ', 'HIGHER_OR_LOWER', 'GUESS_SCORE'] as const;
const DIFFICULTIES_ORDER = ['EASY', 'MEDIUM', 'HARD'] as const;

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    private cacheService: CacheService,
    private questionsService: QuestionsService,
    private answerValidator: AnswerValidator,
  ) {}

  async createGame(dto: CreateGameDto): Promise<GameSession> {
    const gameId = uuidv4();
    this.logger.log(`Creating game ${gameId} for ${dto.player1Name} vs ${dto.player2Name}`);

    const questions = await this.questionsService.generateBoard();

    const players: [Player, Player] = [
      { name: dto.player1Name, score: 0, lifelineUsed: false, doubleUsed: false },
      { name: dto.player2Name, score: 0, lifelineUsed: false, doubleUsed: false },
    ];

    // Build 5x3 board grid (categories x difficulties)
    const board = CATEGORIES_ORDER.map((category) =>
      DIFFICULTIES_ORDER.map((difficulty) => {
        const question = questions.find(
          (q) => q.category === category && q.difficulty === difficulty,
        );
        if (!question) {
          this.logger.warn(`Missing question for ${category}/${difficulty}`);
        }
        return {
          question_id: question?.id || '',
          category,
          difficulty,
          points: DIFFICULTY_POINTS[difficulty],
          answered: false,
        };
      }),
    );

    const session: GameSession = {
      id: gameId,
      players,
      currentPlayerIndex: 0,
      questions,
      board,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.cacheService.set(`game:${gameId}`, session, 86400); // 24h TTL
    return session;
  }

  getGame(gameId: string): GameSession {
    const session = this.cacheService.get<GameSession>(`game:${gameId}`);
    if (!session) throw new NotFoundException(`Game ${gameId} not found`);
    return session;
  }

  getBoardState(gameId: string) {
    const session = this.getGame(gameId);
    return {
      id: session.id,
      status: session.status,
      players: session.players.map((p) => ({ name: p.name, score: p.score, lifelineUsed: p.lifelineUsed, doubleUsed: p.doubleUsed })),
      currentPlayerIndex: session.currentPlayerIndex,
      board: session.board.map((row) =>
        row.map((cell) => ({
          question_id: cell.question_id,
          category: cell.category,
          category_label: CATEGORY_LABELS[cell.category],
          difficulty: cell.difficulty,
          points: cell.points,
          answered: cell.answered,
          answered_by: cell.answered_by,
        })),
      ),
      categories: CATEGORIES_ORDER.map((c) => ({ key: c, label: CATEGORY_LABELS[c] })),
    };
  }

  getQuestion(gameId: string, questionId: string): GeneratedQuestion {
    const session = this.getGame(gameId);
    const question = session.questions.find((q) => q.id === questionId);
    if (!question) throw new NotFoundException(`Question ${questionId} not found`);

    // Don't expose the correct answer to the client
    const { correct_answer, fifty_fifty_hint, ...safeQuestion } = question;
    return { ...safeQuestion, correct_answer: '', fifty_fifty_hint: null } as GeneratedQuestion;
  }

  async submitAnswer(gameId: string, dto: SubmitAnswerDto): Promise<AnswerResult> {
    const session = this.getGame(gameId);

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
    const lifelineUsed = player.lifelineUsed && cell.points !== question.points;

    if (dto.useDouble && player.doubleUsed) {
      throw new BadRequestException('2x multiplier already used this game');
    }
    const doubleApplied = !!dto.useDouble && !player.doubleUsed;

    const correct = this.answerValidator.validate(question, dto.answer);
    const basePoints = correct ? cell.points : 0;
    const points_awarded = correct && doubleApplied ? basePoints * 2 : basePoints;

    if (correct) {
      session.players[dto.playerIndex].score += points_awarded;
    }
    if (doubleApplied) {
      session.players[dto.playerIndex].doubleUsed = true;
    }

    cell.answered = true;
    cell.answered_by = player.name;
    cell.points_awarded = points_awarded;

    // Switch turns
    session.currentPlayerIndex = dto.playerIndex === 0 ? 1 : 0;

    // Check if game is finished
    const allAnswered = session.board.flat().every((c) => c.answered);
    if (allAnswered) session.status = 'FINISHED';

    session.updatedAt = new Date();
    this.cacheService.set(`game:${session.id}`, session, 86400);

    return {
      correct,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      points_awarded,
      player_scores: [session.players[0].score, session.players[1].score],
      lifeline_used: lifelineUsed,
      double_used: doubleApplied,
    };
  }

  useLifeline(gameId: string, dto: UseLifelineDto): HintResult {
    const session = this.getGame(gameId);

    const player = session.players[dto.playerIndex];
    if (player.lifelineUsed) {
      throw new BadRequestException('Lifeline already used this game');
    }

    const question = session.questions.find((q) => q.id === dto.questionId);
    if (!question) throw new NotFoundException('Question not found');

    if (!question.fifty_fifty_applicable) {
      throw new BadRequestException('50-50 lifeline not applicable for this question type');
    }

    if (!question.fifty_fifty_hint) {
      throw new BadRequestException('No hint available for this question');
    }

    // Mark lifeline as used
    session.players[dto.playerIndex].lifelineUsed = true;

    // Reduce points to 1 for this question
    const cell = session.board.flat().find((c) => c.question_id === dto.questionId);
    if (cell) cell.points = 1;

    session.updatedAt = new Date();
    this.cacheService.set(`game:${session.id}`, session, 86400);

    return {
      hint: question.fifty_fifty_hint,
      points_if_correct: 1,
    };
  }

  overrideAnswer(
    gameId: string,
    questionId: string,
    isCorrect: boolean,
    playerIndex: 0 | 1,
  ): AnswerResult {
    const session = this.getGame(gameId);
    const question = session.questions.find((q) => q.id === questionId);
    if (!question) throw new NotFoundException('Question not found');

    const cell = session.board.flat().find((c) => c.question_id === questionId);
    if (!cell) throw new NotFoundException('Board cell not found');

    // Adjust score
    const previousPoints = cell.points_awarded || 0;
    const newPoints = isCorrect ? cell.points : 0;
    const scoreDelta = newPoints - previousPoints;

    session.players[playerIndex].score = Math.max(
      0,
      session.players[playerIndex].score + scoreDelta,
    );
    cell.points_awarded = newPoints;

    session.updatedAt = new Date();
    this.cacheService.set(`game:${session.id}`, session, 86400);

    return {
      correct: isCorrect,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      points_awarded: newPoints,
      player_scores: [session.players[0].score, session.players[1].score],
      lifeline_used: false,
      double_used: false,
    };
  }

  endGame(gameId: string): GameSession {
    const session = this.getGame(gameId);
    session.status = 'FINISHED';
    session.updatedAt = new Date();
    this.cacheService.set(`game:${session.id}`, session, 86400);
    return session;
  }
}
