import { signalStore, withState, withMethods, withComputed, patchState, withHooks } from '@ngrx/signals';
import { inject } from '@angular/core';
import { computed } from '@angular/core';
import { GameApiService, BoardState, Question, AnswerResult, Top5Entry, Top5GuessResult } from './game-api.service';
import { LanguageService } from './language.service';

import { firstValueFrom } from 'rxjs';

const STORAGE_KEY = 'quizball_game_id';
const SEEN_NEWS_IDS_KEY = 'quizball_seen_news_ids';
const MAX_SEEN_NEWS_IDS = 50;

function getSeenNewsIds(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_NEWS_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveNewsIdsFromBoard(board: Array<Array<{ question_id: string; category: string }>>): void {
  const newsIds = board.flat().filter((c) => c.category === 'NEWS' && c.question_id).map((c) => c.question_id);
  if (newsIds.length === 0) return;
  const existing = getSeenNewsIds();
  const combined = [...newsIds, ...existing.filter((id) => !newsIds.includes(id))].slice(0, MAX_SEEN_NEWS_IDS);
  try {
    localStorage.setItem(SEEN_NEWS_IDS_KEY, JSON.stringify(combined));
  } catch {
    // ignore quota or other storage errors
  }
}

export interface Top5State {
  filledSlots: Array<Top5Entry | null>;
  wrongGuesses: Top5Entry[];
  wrongCount: number;
  filledCount: number;
  complete: boolean;
  won: boolean;
}

export interface GameState {
  gameId: string | null;
  boardState: BoardState | null;
  currentQuestion: Question | null;
  currentQuestionId: string | null;
  lastResult: AnswerResult | null;
  fiftyFiftyOptions: string[] | null;
  doubleArmed: boolean;
  loading: boolean;
  error: string | null;
  phase: 'setup' | 'loading' | 'board' | 'question' | 'result' | 'finished';
  top5State: Top5State | null;
  correctAnswers: [number, number];
  totalAnswered: [number, number];
  currentStreak: [number, number];
}

const initialState: GameState = {
  gameId: null,
  boardState: null,
  currentQuestion: null,
  currentQuestionId: null,
  lastResult: null,
  fiftyFiftyOptions: null,
  doubleArmed: false,
  loading: false,
  error: null,
  phase: 'setup',
  top5State: null,
  correctAnswers: [0, 0],
  totalAnswered: [0, 0],
  currentStreak: [0, 0],
};

export const GameStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    currentPlayer: computed(() => {
      const board = store.boardState();
      if (!board) return null;
      return board.players[board.currentPlayerIndex];
    }),
    currentPlayerIndex: computed(() => store.boardState()?.currentPlayerIndex ?? 0),
    players: computed(() => store.boardState()?.players ?? []),
    isFinished: computed(() => store.boardState()?.status === 'FINISHED' || store.phase() === 'finished'),
    accuracy: computed(() => {
      const ca = store.correctAnswers();
      const ta = store.totalAnswered();
      return [
        ta[0] === 0 ? 0 : Math.round((ca[0] / ta[0]) * 100),
        ta[1] === 0 ? 0 : Math.round((ca[1] / ta[1]) * 100),
      ] as [number, number];
    }),
  })),
  withMethods((store, api = inject(GameApiService), language = inject(LanguageService)) => ({
    async startGame(player1Name: string, player2Name: string, language: string): Promise<void> {
      patchState(store, { loading: true, error: null, phase: 'loading' });
      try {
        const excludeNewsQuestionIds = getSeenNewsIds();
        const response = await firstValueFrom(
          api.createGame({ player1Name, player2Name, language, excludeNewsQuestionIds })
        );
        const boardState = await firstValueFrom(api.getGame(response.game_id));
        localStorage.setItem(STORAGE_KEY, response.game_id);
        saveNewsIdsFromBoard(boardState.board);
        patchState(store, {
          gameId: response.game_id,
          boardState,
          loading: false,
          phase: 'board',
          correctAnswers: [0, 0],
          totalAnswered: [0, 0],
          currentStreak: [0, 0],
        });
      } catch (err: unknown) {
        const body = err && typeof err === 'object' && 'error' in err ? (err as { error: { message?: string } }).error : null;
        const msg = body?.message ?? 'Failed to start game. Please try again.';
        patchState(store, {
          loading: false,
          error: msg,
          phase: 'setup',
        });
      }
    },

    async selectQuestion(questionId: string): Promise<void> {
      const gameId = store.gameId();
      if (!gameId) return;
      patchState(store, { loading: true, currentQuestionId: questionId, fiftyFiftyOptions: null, lastResult: null, top5State: null });
      try {
        const question = await firstValueFrom(api.getQuestion(gameId, questionId));
        const top5State = question.category === 'TOP_5'
          ? { filledSlots: [null, null, null, null, null], wrongGuesses: [], wrongCount: 0, filledCount: 0, complete: false, won: false }
          : null;
        patchState(store, { currentQuestion: question, loading: false, phase: 'question', top5State });
      } catch (err) {
        patchState(store, { loading: false, error: 'Failed to load question' });
      }
    },

    async submitAnswer(answer: string): Promise<AnswerResult | null> {
      const gameId = store.gameId();
      const questionId = store.currentQuestionId();
      const board = store.boardState();
      if (!gameId || !questionId || !board) return null;

      const useDouble = store.doubleArmed();
      patchState(store, { loading: true });
      try {
        const result = await firstValueFrom(
          api.submitAnswer(gameId, questionId, answer, board.currentPlayerIndex, useDouble)
        );
        const updatedBoard = await firstValueFrom(api.getGame(gameId));
        const pi = board.currentPlayerIndex;
        const ca = [...store.correctAnswers()];
        const ta = [...store.totalAnswered()];
        const cs = [...store.currentStreak()];
        ta[pi] += 1;
        if (result.correct) {
          ca[pi] += 1;
          cs[pi] += 1;
        } else {
          cs[pi] = 0;
        }
        patchState(store, {
          lastResult: result,
          boardState: updatedBoard,
          loading: false,
          phase: 'result',
          doubleArmed: false,
          correctAnswers: ca as [number, number],
          totalAnswered: ta as [number, number],
          currentStreak: cs as [number, number],
        });
        if (updatedBoard.status === 'FINISHED') {
          patchState(store, { phase: 'finished' });
        }
        return result;
      } catch (err) {
        patchState(store, { loading: false, error: 'Failed to submit answer' });
        return null;
      }
    },

    async submitTop5Guess(answer: string): Promise<Top5GuessResult | null> {
      const gameId = store.gameId();
      const questionId = store.currentQuestionId();
      const board = store.boardState();
      if (!gameId || !questionId || !board) return null;

      const useDouble = store.doubleArmed();
      try {
        const result = await firstValueFrom(
          api.submitTop5Guess(gameId, questionId, answer, board.currentPlayerIndex, useDouble)
        );

        const top5State: Top5State = {
          filledSlots: result.filledSlots,
          wrongGuesses: result.wrongGuesses,
          wrongCount: result.wrongCount,
          filledCount: result.filledCount,
          complete: result.complete,
          won: result.won,
        };

        if (result.complete) {
          const updatedBoard = await firstValueFrom(api.getGame(gameId));
          const answerResult: AnswerResult = {
            correct: result.won,
            correct_answer: result.correct_answer ?? '',
            explanation: result.explanation ?? '',
            points_awarded: result.points_awarded ?? 0,
            player_scores: result.player_scores ?? [board.players[0].score, board.players[1].score],
            lifeline_used: false,
            double_used: useDouble,
          };
          const pi = board.currentPlayerIndex;
          const ca = [...store.correctAnswers()];
          const ta = [...store.totalAnswered()];
          const cs = [...store.currentStreak()];
          ta[pi] += 1;
          if (result.won) {
            ca[pi] += 1;
            cs[pi] += 1;
          } else {
            cs[pi] = 0;
          }
          patchState(store, {
            top5State,
            lastResult: answerResult,
            boardState: updatedBoard,
            phase: 'result',
            doubleArmed: false,
            correctAnswers: ca as [number, number],
            totalAnswered: ta as [number, number],
            currentStreak: cs as [number, number],
          });
          if (updatedBoard.status === 'FINISHED') {
            patchState(store, { phase: 'finished' });
          }
        } else {
          patchState(store, { top5State });
        }
        return result;
      } catch (err) {
        patchState(store, { error: 'Failed to submit guess' });
        return null;
      }
    },

    async stopTop5Early(): Promise<void> {
      const gameId = store.gameId();
      const questionId = store.currentQuestionId();
      const board = store.boardState();
      if (!gameId || !questionId || !board) return;
      try {
        const result = await firstValueFrom(api.stopTop5Early(gameId, questionId, board.currentPlayerIndex));
        const updatedBoard = await firstValueFrom(api.getGame(gameId));
        const answerResult = {
          correct: true,
          correct_answer: result.correct_answer ?? '',
          explanation: result.explanation ?? '',
          points_awarded: result.points_awarded ?? 1,
          player_scores: result.player_scores ?? ([0, 0] as [number, number]),
          lifeline_used: false,
          double_used: false,
        };
        const top5State: Top5State = {
          filledSlots: result.filledSlots,
          wrongGuesses: result.wrongGuesses,
          wrongCount: result.wrongCount,
          filledCount: result.filledCount,
          complete: true,
          won: true,
        };
        const pi = board.currentPlayerIndex;
        const ca = [...store.correctAnswers()];
        const ta = [...store.totalAnswered()];
        const cs = [...store.currentStreak()];
        ta[pi] += 1;
        ca[pi] += 1;
        cs[pi] += 1;
        patchState(store, {
          top5State,
          lastResult: answerResult,
          boardState: updatedBoard,
          phase: 'result',
          doubleArmed: false,
          correctAnswers: ca as [number, number],
          totalAnswered: ta as [number, number],
          currentStreak: cs as [number, number],
        });
        if (updatedBoard.status === 'FINISHED') patchState(store, { phase: 'finished' });
      } catch (err) {
        patchState(store, { error: 'Failed to stop early' });
      }
    },

    armDouble(): void {
      patchState(store, { doubleArmed: true });
    },

    async useLifeline(): Promise<void> {
      const gameId = store.gameId();
      const questionId = store.currentQuestionId();
      const board = store.boardState();
      if (!gameId || !questionId || !board) return;

      try {
        const result = await firstValueFrom(api.useLifeline(gameId, questionId, board.currentPlayerIndex));
        const updatedBoard = await firstValueFrom(api.getGame(gameId));
        patchState(store, {
          fiftyFiftyOptions: result.options,
          boardState: updatedBoard,
        });
      } catch (err) {
        patchState(store, { error: 'Failed to use lifeline' });
      }
    },

    async overrideAnswer(isCorrect: boolean): Promise<void> {
      const gameId = store.gameId();
      const questionId = store.currentQuestionId();
      const board = store.boardState();
      const lastResult = store.lastResult();
      if (!gameId || !questionId || !board || !lastResult) return;

      const pi = board.currentPlayerIndex;
      const wasCorrect = lastResult.correct;

      try {
        const result = await firstValueFrom(
          api.overrideAnswer(gameId, questionId, isCorrect, board.currentPlayerIndex === 0 ? 1 : 0)
        );
        const updatedBoard = await firstValueFrom(api.getGame(gameId));
        const ca = [...store.correctAnswers()];
        const cs = [...store.currentStreak()];
        if (wasCorrect && !isCorrect) {
          ca[pi] = Math.max(0, ca[pi] - 1);
          cs[pi] = 0;
        } else if (!wasCorrect && isCorrect) {
          ca[pi] += 1;
          cs[pi] += 1;
        }
        patchState(store, {
          lastResult: result,
          boardState: updatedBoard,
          correctAnswers: ca as [number, number],
          currentStreak: cs as [number, number],
        });
      } catch (err) {
        patchState(store, { error: 'Override failed' });
      }
    },

    continueToBoard(): void {
      const board = store.boardState();
      if (board?.status === 'FINISHED') {
        patchState(store, { phase: 'finished', currentQuestion: null, currentQuestionId: null });
      } else {
        patchState(store, { phase: 'board', currentQuestion: null, currentQuestionId: null, lastResult: null, fiftyFiftyOptions: null });
      }
    },

    async endGame(): Promise<void> {
      const gameId = store.gameId();
      if (!gameId) return;
      try {
        await firstValueFrom(api.endGame(gameId));
        const updatedBoard = await firstValueFrom(api.getGame(gameId));
        patchState(store, { boardState: updatedBoard, phase: 'finished' });
      } catch (err) {
        patchState(store, { phase: 'finished' });
      }
    },

    resetGame(): void {
      localStorage.removeItem(STORAGE_KEY);
      patchState(store, initialState);
    },

    async restoreGame(gameId: string): Promise<void> {
      patchState(store, { loading: true, phase: 'loading' });
      try {
        await firstValueFrom(api.setGameLanguage(gameId, language.lang()));
        const boardState = await firstValueFrom(api.getGame(gameId));
        saveNewsIdsFromBoard(boardState.board);
        const phase = boardState.status === 'FINISHED' ? 'finished' : 'board';
        patchState(store, {
          gameId,
          boardState,
          loading: false,
          phase,
          correctAnswers: [0, 0],
          totalAnswered: [0, 0],
          currentStreak: [0, 0],
        });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        patchState(store, { loading: false, phase: 'setup' });
      }
    },

    /** Syncs game language with backend. Call when returning to game after language change. */
    async syncGameLanguage(): Promise<void> {
      const gameId = store.gameId();
      if (!gameId) return;
      try {
        await firstValueFrom(api.setGameLanguage(gameId, language.lang()));
      } catch {
        // ignore
      }
    },

    /** Syncs game language and re-fetches current question. Use when returning to question screen after language change. */
    async refreshQuestionForLanguage(): Promise<void> {
      const gameId = store.gameId();
      const questionId = store.currentQuestionId();
      if (!gameId || !questionId || store.phase() !== 'question') return;
      try {
        await firstValueFrom(api.setGameLanguage(gameId, language.lang()));
        const question = await firstValueFrom(api.getQuestion(gameId, questionId));
        patchState(store, { currentQuestion: question });
      } catch {
        // ignore
      }
    },
  })),
  withHooks({
    onInit(store) {
      const savedGameId = localStorage.getItem(STORAGE_KEY);
      if (savedGameId) {
        store.restoreGame(savedGameId);
      }
    },
  })
);
