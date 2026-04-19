import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { OnlineGameService } from './online-game.service';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionPoolService } from '../questions/question-pool.service';
import { AnswerValidator } from '../questions/validators/answer.validator';
import { RedisService } from '../redis/redis.service';
import type { OnlineGameRow, OnlineTurnState } from './online-game.types';
import type { GeneratedQuestion, BoardCell } from '../common/interfaces/question.interface';
import type { Player } from '../common/interfaces/game.interface';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQuestion(overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
  return {
    id: 'q1',
    question_text: 'Who won the 2022 World Cup?',
    correct_answer: 'Argentina',
    wrong_choices: ['France', 'Brazil', 'Germany'],
    fifty_fifty_hint: 'Argentina or France',
    fifty_fifty_applicable: true,
    explanation: 'Argentina won in Qatar',
    category: 'HISTORY',
    difficulty: 'EASY',
    points: 100,
    image_url: undefined,
    meta: { secret: 'should-not-leak' },
    ...overrides,
  } as GeneratedQuestion;
}

function makeCell(overrides: Partial<BoardCell> = {}): BoardCell {
  return {
    question_id: 'q1',
    category: 'HISTORY',
    difficulty: 'EASY',
    points: 100,
    answered: false,
    ...overrides,
  } as BoardCell;
}

function makeGameRow(overrides: Partial<OnlineGameRow> = {}): OnlineGameRow {
  return {
    id: 'game-1',
    invite_code: 'ABC123',
    host_id: 'user-host',
    guest_id: 'user-guest',
    status: 'active',
    players: [
      { name: 'Host', score: 0, lifelineUsed: false, doubleUsed: false },
      { name: 'Guest', score: 0, lifelineUsed: false, doubleUsed: false },
    ],
    current_player_index: 0,
    board: [[makeCell()]],
    questions: [makeQuestion()],
    top5_progress: {},
    pool_question_ids: [],
    host_ready: true,
    guest_ready: true,
    turn_state: null,
    last_result: null,
    turn_started_at: new Date().toISOString(),
    board_state: {},
    current_player_id: null,
    player_scores: [0, 0],
    player_meta: {},
    language: 'en',
    turn_deadline: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as OnlineGameRow;
}

/**
 * Build a chainable mock that mimics the Supabase PostgREST builder.
 * `resolvedData` is what `.single()` / `.maybeSingle()` will resolve to.
 */
function mockSupabaseChain(resolvedData: unknown, resolvedError: unknown = null) {
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;

  for (const method of [
    'from',
    'select',
    'eq',
    'is',
    'not',
    'neq',
    'update',
    'insert',
    'delete',
    'order',
    'limit',
  ]) {
    chain[method] = jest.fn().mockImplementation(self);
  }

  chain.single = jest.fn().mockResolvedValue({ data: resolvedData, error: resolvedError });
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: resolvedData, error: resolvedError });

  return chain;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('OnlineGameService', () => {
  let service: OnlineGameService;
  let supabaseChain: ReturnType<typeof mockSupabaseChain>;
  let validateAsyncMock: jest.Mock;

  beforeEach(async () => {
    supabaseChain = mockSupabaseChain(null);
    validateAsyncMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnlineGameService,
        {
          provide: SupabaseService,
          useValue: {
            client: supabaseChain,
            getProfile: jest.fn().mockResolvedValue({ username: 'TestUser' }),
            saveMatchResult: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: QuestionPoolService,
          useValue: {
            drawBoard: jest.fn().mockResolvedValue({ questions: [], poolQuestionIds: [] }),
            refillIfNeeded: jest.fn().mockResolvedValue(undefined),
            returnUnansweredToPool: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AnswerValidator,
          useValue: {
            validateAsync: validateAsyncMock,
            matchTop5Entry: jest.fn().mockReturnValue(-1),
          },
        },
        {
          provide: RedisService,
          useValue: {
            client: {},
          },
        },
      ],
    }).compile();

    service = module.get(OnlineGameService);
  });

  // ── Helper: configure supabase mock to return a specific game row ───────

  function stubFetchGame(row: OnlineGameRow): void {
    supabaseChain.single.mockResolvedValue({ data: row, error: null });
  }

  /**
   * Configure the chain so that the first `.single()` returns `fetchRow`
   * (for fetchGame) and the second `.single()` returns `updateRow` (for
   * the subsequent update call).
   */
  function stubFetchThenUpdate(fetchRow: OnlineGameRow, updateRow: OnlineGameRow): void {
    supabaseChain.single
      .mockResolvedValueOnce({ data: fetchRow, error: null })   // fetchGame
      .mockResolvedValueOnce({ data: updateRow, error: null }); // update
  }

  // ── getGame — public view construction ──────────────────────────────────

  describe('getGame', () => {
    it('returns correct myRole and myPlayerIndex for host', async () => {
      const row = makeGameRow();
      stubFetchGame(row);

      const view = await service.getGame('user-host', 'game-1');

      expect(view.myRole).toBe('host');
      expect(view.myPlayerIndex).toBe(0);
    });

    it('returns correct myRole and myPlayerIndex for guest', async () => {
      const row = makeGameRow();
      stubFetchGame(row);

      const view = await service.getGame('user-guest', 'game-1');

      expect(view.myRole).toBe('guest');
      expect(view.myPlayerIndex).toBe(1);
    });

    it('strips correct_answer from board cells in public view', async () => {
      const row = makeGameRow({
        board: [[makeCell({ points_awarded: 100, answered_by: 'Host' })]],
      });
      stubFetchGame(row);

      const view = await service.getGame('user-host', 'game-1');

      // Board cells must not expose answer-revealing fields
      const cell = view.board[0][0];
      expect(cell).not.toHaveProperty('lifeline_applied');
      expect(cell).not.toHaveProperty('double_armed');
      expect(cell).not.toHaveProperty('points_awarded');
      expect(cell).toHaveProperty('question_id');
      expect(cell).toHaveProperty('answered');
    });

    it('strips meta from turn_state.question for the spectating player', async () => {
      const turnState: OnlineTurnState = {
        questionId: 'q1',
        question: {
          id: 'q1',
          question_text: 'Who won?',
          category: 'HISTORY',
          difficulty: 'EASY',
          meta: { top5: [{ name: 'Messi', stat: '7' }] },
        },
        attempts: [],
        top5Progress: null,
        phase: 'answering',
      };

      // current_player_index=0 means host is active; guest is spectating
      const row = makeGameRow({ turn_state: turnState, current_player_index: 0 });
      stubFetchGame(row);

      const guestView = await service.getGame('user-guest', 'game-1');

      expect(guestView.turnState?.question.meta).toBeUndefined();
    });

    it('preserves meta in turn_state.question for the active player', async () => {
      const secretMeta = { top5: [{ name: 'Messi', stat: '7' }] };
      const turnState: OnlineTurnState = {
        questionId: 'q1',
        question: {
          id: 'q1',
          question_text: 'Who won?',
          category: 'HISTORY',
          difficulty: 'EASY',
          meta: secretMeta,
        },
        attempts: [],
        top5Progress: null,
        phase: 'answering',
      };

      const row = makeGameRow({ turn_state: turnState, current_player_index: 0 });
      stubFetchGame(row);

      const hostView = await service.getGame('user-host', 'game-1');

      expect(hostView.turnState?.question.meta).toEqual(secretMeta);
    });

    it('throws NotFoundException when game does not exist', async () => {
      supabaseChain.single.mockResolvedValue({ data: null, error: { message: 'not found' } });

      await expect(service.getGame('user-host', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user is not a participant', async () => {
      const row = makeGameRow();
      stubFetchGame(row);

      await expect(service.getGame('random-user', 'game-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('includes categories array with correct keys', async () => {
      const row = makeGameRow();
      stubFetchGame(row);

      const view = await service.getGame('user-host', 'game-1');

      expect(view.categories).toBeInstanceOf(Array);
      expect(view.categories.length).toBe(7);
      const keys = view.categories.map((c) => c.key);
      expect(keys).toContain('HISTORY');
      expect(keys).toContain('TOP_5');
      expect(keys).toContain('LOGO_QUIZ');
    });
  });

  // ── submitAnswer — guard behavior ───────────────────────────────────────

  describe('submitAnswer — guards', () => {
    it('throws ForbiddenException when it is not the user turn', async () => {
      // current_player_index=1 means it is the guest turn
      const row = makeGameRow({ current_player_index: 1 });
      stubFetchGame(row);

      await expect(
        service.submitAnswer('user-host', 'game-1', {
          questionId: 'q1',
          answer: 'Argentina',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException on a finished game', async () => {
      const row = makeGameRow({ status: 'finished' });
      stubFetchGame(row);

      await expect(
        service.submitAnswer('user-host', 'game-1', {
          questionId: 'q1',
          answer: 'Argentina',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when no active turn_state matches the questionId', async () => {
      const row = makeGameRow({ turn_state: null });
      stubFetchGame(row);

      await expect(
        service.submitAnswer('user-host', 'game-1', {
          questionId: 'q1',
          answer: 'Argentina',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when question is already answered', async () => {
      const turnState: OnlineTurnState = {
        questionId: 'q1',
        question: {
          id: 'q1',
          question_text: 'Who won?',
          category: 'HISTORY',
          difficulty: 'EASY',
        },
        attempts: [],
        top5Progress: null,
        phase: 'answering',
      };
      const row = makeGameRow({
        turn_state: turnState,
        board: [[makeCell({ answered: true })]],
      });
      stubFetchGame(row);

      await expect(
        service.submitAnswer('user-host', 'game-1', {
          questionId: 'q1',
          answer: 'Argentina',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── submitAnswer — correct answer flow ──────────────────────────────────

  describe('submitAnswer — correct answer', () => {
    function setupCorrectAnswerScenario(overrides: Partial<OnlineGameRow> = {}) {
      const turnState: OnlineTurnState = {
        questionId: 'q1',
        question: {
          id: 'q1',
          question_text: 'Who won the 2022 World Cup?',
          category: 'HISTORY',
          difficulty: 'EASY',
        },
        attempts: [],
        top5Progress: null,
        phase: 'answering',
      };

      const row = makeGameRow({ turn_state: turnState, ...overrides });

      // After correct answer, the service updates the row — simulate the
      // updated row being returned by Supabase.
      const updatedRow = makeGameRow({
        ...overrides,
        turn_state: null,
        current_player_index: 1,
        players: [
          { name: 'Host', score: 100, lifelineUsed: false, doubleUsed: false },
          { name: 'Guest', score: 0, lifelineUsed: false, doubleUsed: false },
        ],
        board: [[makeCell({ answered: true, answered_by: 'Host', points_awarded: 100 })]],
        status: 'finished', // single cell board = game over after one answer
        last_result: {
          questionId: 'q1',
          correct: true,
          correct_answer: 'Argentina',
          explanation: 'Argentina won in Qatar',
          points_awarded: 100,
          player_scores: [100, 0],
          lifeline_used: false,
          double_used: false,
        },
      });

      stubFetchThenUpdate(row, updatedRow);
      validateAsyncMock.mockResolvedValue(true);

      return { row, updatedRow };
    }

    it('returns a public view with updated scores after correct answer', async () => {
      setupCorrectAnswerScenario();

      const view = await service.submitAnswer('user-host', 'game-1', {
        questionId: 'q1',
        answer: 'Argentina',
      });

      expect(view.players[0].score).toBe(100);
      expect(view.players[1].score).toBe(0);
    });

    it('finishes the game when all cells are answered', async () => {
      setupCorrectAnswerScenario();

      const view = await service.submitAnswer('user-host', 'game-1', {
        questionId: 'q1',
        answer: 'Argentina',
      });

      expect(view.status).toBe('finished');
    });

    it('includes lastResult with correct_answer and explanation', async () => {
      setupCorrectAnswerScenario();

      const view = await service.submitAnswer('user-host', 'game-1', {
        questionId: 'q1',
        answer: 'Argentina',
      });

      expect(view.lastResult).toBeDefined();
      expect(view.lastResult?.correct).toBe(true);
      expect(view.lastResult?.correct_answer).toBe('Argentina');
      expect(view.lastResult?.explanation).toBe('Argentina won in Qatar');
    });
  });

  // ── submitAnswer — wrong answer flow ────────────────────────────────────

  describe('submitAnswer — wrong answer', () => {
    it('appends the wrong attempt to turn_state and keeps the game active', async () => {
      const turnState: OnlineTurnState = {
        questionId: 'q1',
        question: {
          id: 'q1',
          question_text: 'Who won?',
          category: 'HISTORY',
          difficulty: 'EASY',
        },
        attempts: [],
        top5Progress: null,
        phase: 'answering',
      };

      const row = makeGameRow({ turn_state: turnState });
      const updatedRow = makeGameRow({
        turn_state: { ...turnState, attempts: ['France'] },
      });

      stubFetchThenUpdate(row, updatedRow);
      validateAsyncMock.mockResolvedValue(false);

      const view = await service.submitAnswer('user-host', 'game-1', {
        questionId: 'q1',
        answer: 'France',
      });

      expect(view.status).toBe('active');
      expect(view.turnState?.attempts).toContain('France');
    });
  });

  // ── submitAnswer — double points ────────────────────────────────────────

  describe('submitAnswer — double multiplier', () => {
    it('throws BadRequestException when double is already used', async () => {
      const turnState: OnlineTurnState = {
        questionId: 'q1',
        question: {
          id: 'q1',
          question_text: 'Who won?',
          category: 'HISTORY',
          difficulty: 'EASY',
        },
        attempts: [],
        top5Progress: null,
        phase: 'answering',
      };

      const row = makeGameRow({
        turn_state: turnState,
        players: [
          { name: 'Host', score: 200, lifelineUsed: false, doubleUsed: true },
          { name: 'Guest', score: 0, lifelineUsed: false, doubleUsed: false },
        ],
      });

      stubFetchGame(row);
      validateAsyncMock.mockResolvedValue(true);

      await expect(
        service.submitAnswer('user-host', 'game-1', {
          questionId: 'q1',
          answer: 'Argentina',
          useDouble: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('awards double points when useDouble is true and not yet used', async () => {
      const turnState: OnlineTurnState = {
        questionId: 'q1',
        question: {
          id: 'q1',
          question_text: 'Who won?',
          category: 'HISTORY',
          difficulty: 'EASY',
        },
        attempts: [],
        top5Progress: null,
        phase: 'answering',
      };

      const row = makeGameRow({ turn_state: turnState });

      // The updated row reflects 200 points (doubled from 100)
      const updatedRow = makeGameRow({
        turn_state: null,
        current_player_index: 1,
        players: [
          { name: 'Host', score: 200, lifelineUsed: false, doubleUsed: true },
          { name: 'Guest', score: 0, lifelineUsed: false, doubleUsed: false },
        ],
        board: [[makeCell({ answered: true, answered_by: 'Host', points_awarded: 200 })]],
        status: 'finished',
        last_result: {
          questionId: 'q1',
          correct: true,
          correct_answer: 'Argentina',
          explanation: 'Argentina won in Qatar',
          points_awarded: 200,
          player_scores: [200, 0],
          lifeline_used: false,
          double_used: true,
        },
      });

      stubFetchThenUpdate(row, updatedRow);
      validateAsyncMock.mockResolvedValue(true);

      const view = await service.submitAnswer('user-host', 'game-1', {
        questionId: 'q1',
        answer: 'Argentina',
        useDouble: true,
      });

      expect(view.players[0].score).toBe(200);
      expect(view.lastResult?.double_used).toBe(true);
      expect(view.lastResult?.points_awarded).toBe(200);
    });
  });

  // ── submitAnswer — mathematical win detection ───────────────────────────

  describe('submitAnswer — isMathematicallyWon (indirect)', () => {
    it('finishes the game when a player has an insurmountable lead', async () => {
      // Board with 2 cells: q1 (about to be answered) and q2 (unanswered, 50pts).
      // After Host answers q1 for 500pts, Host has 500, Guest has 0.
      // Remaining: 50pts + possible double (50pts) = 100. Lead of 500 > 100. Game over.
      const q2 = makeQuestion({ id: 'q2', points: 50 });
      const cell2 = makeCell({ question_id: 'q2', points: 50 });

      const turnState: OnlineTurnState = {
        questionId: 'q1',
        question: {
          id: 'q1',
          question_text: 'Who won?',
          category: 'HISTORY',
          difficulty: 'EASY',
        },
        attempts: [],
        top5Progress: null,
        phase: 'answering',
      };

      const row = makeGameRow({
        turn_state: turnState,
        board: [[makeCell({ points: 500 }), cell2]],
        questions: [makeQuestion({ points: 500 }), q2],
      });

      const updatedRow = makeGameRow({
        turn_state: null,
        status: 'finished',
        players: [
          { name: 'Host', score: 500, lifelineUsed: false, doubleUsed: false },
          { name: 'Guest', score: 0, lifelineUsed: false, doubleUsed: false },
        ],
        board: [[makeCell({ points: 500, answered: true, answered_by: 'Host' }), cell2]],
        last_result: {
          questionId: 'q1',
          correct: true,
          correct_answer: 'Argentina',
          explanation: 'Argentina won in Qatar',
          points_awarded: 500,
          player_scores: [500, 0],
          lifeline_used: false,
          double_used: false,
        },
      });

      stubFetchThenUpdate(row, updatedRow);
      validateAsyncMock.mockResolvedValue(true);

      const view = await service.submitAnswer('user-host', 'game-1', {
        questionId: 'q1',
        answer: 'Argentina',
      });

      expect(view.status).toBe('finished');
    });
  });

  // ── selectQuestion — guards ─────────────────────────────────────────────

  describe('selectQuestion — guards', () => {
    it('throws ForbiddenException when it is not the user turn', async () => {
      const row = makeGameRow({ current_player_index: 1 });
      stubFetchGame(row);

      await expect(
        service.selectQuestion('user-host', 'game-1', { questionId: 'q1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException on a finished game', async () => {
      const row = makeGameRow({ status: 'finished' });
      stubFetchGame(row);

      await expect(
        service.selectQuestion('user-host', 'game-1', { questionId: 'q1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when questionId does not exist', async () => {
      const row = makeGameRow();
      stubFetchGame(row);

      await expect(
        service.selectQuestion('user-host', 'game-1', { questionId: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when selecting an already answered question', async () => {
      const row = makeGameRow({
        board: [[makeCell({ answered: true })]],
      });
      stubFetchGame(row);

      await expect(
        service.selectQuestion('user-host', 'game-1', { questionId: 'q1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
