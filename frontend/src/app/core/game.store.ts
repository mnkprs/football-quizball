import { signalStore, withState, withMethods, withComputed, patchState, withHooks } from '@ngrx/signals';
import { inject } from '@angular/core';
import { computed } from '@angular/core';
import { GameApiService, BoardState, Question, AnswerResult, Top5Entry, Top5GuessResult } from './game-api.service';

import { firstValueFrom } from 'rxjs';

const STORAGE_KEY = 'quizball_game_id';

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
  activeHint: string | null;
  hintPointsIfCorrect: number | null;
  doubleArmed: boolean;
  loading: boolean;
  error: string | null;
  phase: 'setup' | 'loading' | 'board' | 'question' | 'result' | 'finished';
  top5State: Top5State | null;
}

const initialState: GameState = {
  gameId: null,
  boardState: null,
  currentQuestion: null,
  currentQuestionId: null,
  lastResult: null,
  activeHint: null,
  hintPointsIfCorrect: null,
  doubleArmed: false,
  loading: false,
  error: null,
  phase: 'setup',
  top5State: null,
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
  })),
  withMethods((store, api = inject(GameApiService)) => ({
    async startGame(player1Name: string, player2Name: string): Promise<void> {
      patchState(store, { loading: true, error: null, phase: 'loading' });
      try {
        const response = await firstValueFrom(api.createGame({ player1Name, player2Name }));
        const boardState = await firstValueFrom(api.getGame(response.game_id));
        localStorage.setItem(STORAGE_KEY, response.game_id);
        patchState(store, {
          gameId: response.game_id,
          boardState,
          loading: false,
          phase: 'board',
        });
      } catch (err) {
        patchState(store, {
          loading: false,
          error: 'Failed to start game. Please try again.',
          phase: 'setup',
        });
      }
    },

    async selectQuestion(questionId: string): Promise<void> {
      const gameId = store.gameId();
      if (!gameId) return;
      patchState(store, { loading: true, currentQuestionId: questionId, activeHint: null, hintPointsIfCorrect: null, lastResult: null, top5State: null });
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
        patchState(store, {
          lastResult: result,
          boardState: updatedBoard,
          loading: false,
          phase: 'result',
          doubleArmed: false,
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
          patchState(store, {
            top5State,
            lastResult: answerResult,
            boardState: updatedBoard,
            phase: 'result',
            doubleArmed: false,
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
        patchState(store, { top5State, lastResult: answerResult, boardState: updatedBoard, phase: 'result', doubleArmed: false });
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
        const hint = await firstValueFrom(api.useLifeline(gameId, questionId, board.currentPlayerIndex));
        const updatedBoard = await firstValueFrom(api.getGame(gameId));
        patchState(store, {
          activeHint: hint.hint,
          hintPointsIfCorrect: hint.points_if_correct,
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
      if (!gameId || !questionId || !board) return;

      try {
        const result = await firstValueFrom(
          api.overrideAnswer(gameId, questionId, isCorrect, board.currentPlayerIndex === 0 ? 1 : 0)
        );
        const updatedBoard = await firstValueFrom(api.getGame(gameId));
        patchState(store, { lastResult: result, boardState: updatedBoard });
      } catch (err) {
        patchState(store, { error: 'Override failed' });
      }
    },

    continueToBoard(): void {
      const board = store.boardState();
      if (board?.status === 'FINISHED') {
        patchState(store, { phase: 'finished', currentQuestion: null, currentQuestionId: null });
      } else {
        patchState(store, { phase: 'board', currentQuestion: null, currentQuestionId: null, lastResult: null, activeHint: null });
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
        const boardState = await firstValueFrom(api.getGame(gameId));
        const phase = boardState.status === 'FINISHED' ? 'finished' : 'board';
        patchState(store, { gameId, boardState, loading: false, phase });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        patchState(store, { loading: false, phase: 'setup' });
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
