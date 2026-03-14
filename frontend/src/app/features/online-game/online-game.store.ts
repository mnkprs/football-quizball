import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { inject, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../core/auth.service';
import {
  OnlineGameApiService,
  OnlineGamePublicView,
  OnlineQuestion,
  OnlineAnswerResult,
  OnlineTop5GuessResult,
} from '../../core/online-game-api.service';

export interface OnlineTop5State {
  filledSlots: Array<{ name: string; stat: string } | null>;
  wrongGuesses: Array<{ name: string; stat: string }>;
  wrongCount: number;
  filledCount: number;
  complete: boolean;
  won: boolean;
}

export interface OnlineGameState {
  gameId: string | null;
  gameView: OnlineGamePublicView | null;
  myUserId: string | null;
  currentQuestion: OnlineQuestion | null;
  currentQuestionId: string | null;
  lastResult: OnlineAnswerResult | null;
  fiftyFiftyOptions: string[] | null;
  doubleArmed: boolean;
  loading: boolean;
  error: string | null;
  phase: 'lobby' | 'waiting' | 'queued' | 'board' | 'question' | 'result' | 'opponent-turn' | 'finished';
  top5State: OnlineTop5State | null;
}

const initialState: OnlineGameState = {
  gameId: null,
  gameView: null,
  myUserId: null,
  currentQuestion: null,
  currentQuestionId: null,
  lastResult: null,
  fiftyFiftyOptions: null,
  doubleArmed: false,
  loading: false,
  error: null,
  phase: 'lobby',
  top5State: null,
};

function derivePhase(view: OnlineGamePublicView, myUserId: string): OnlineGameState['phase'] {
  if (view.status === 'finished' || view.status === 'abandoned') return 'finished';
  if (view.status === 'waiting') return 'waiting';
  if (view.status === 'queued') return 'queued';
  // active
  if (view.currentPlayerId === myUserId) return 'board';
  return 'opponent-turn';
}

export const OnlineGameStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    isMyTurn: computed(() => store.gameView()?.currentPlayerId === store.myUserId()),
    myScore: computed(() => {
      const view = store.gameView();
      if (!view) return 0;
      return view.myRole === 'host' ? view.playerScores.host : view.playerScores.guest;
    }),
    opponentScore: computed(() => {
      const view = store.gameView();
      if (!view) return 0;
      return view.myRole === 'host' ? view.playerScores.guest : view.playerScores.host;
    }),
    opponentUsername: computed(() => {
      const view = store.gameView();
      if (!view) return null;
      return view.myRole === 'host' ? view.guestUsername : view.hostUsername;
    }),
    myUsername: computed(() => {
      const view = store.gameView();
      if (!view) return null;
      return view.myRole === 'host' ? view.hostUsername : view.guestUsername;
    }),
    myMeta: computed(() => {
      const view = store.gameView();
      if (!view) return null;
      return view.playerMeta[view.myRole];
    }),
    // Stubs for BoardComponent compatibility (offline-only stats)
    currentStreak: computed(() => [0, 0] as [number, number]),
    totalAnswered: computed(() => [0, 0] as [number, number]),
    accuracy: computed(() => [0, 0] as [number, number]),
    // Adapter computed for Board/Question/Result component compatibility
    boardState: computed(() => {
      const view = store.gameView();
      if (!view) return null;
      return {
        id: view.id,
        status: view.status === 'finished' ? 'FINISHED' : 'ACTIVE',
        players: [
          { name: view.hostUsername, score: view.playerScores.host, lifelineUsed: view.playerMeta.host.lifelineUsed, doubleUsed: view.playerMeta.host.doubleUsed },
          { name: view.guestUsername ?? '...', score: view.playerScores.guest, lifelineUsed: view.playerMeta.guest.lifelineUsed, doubleUsed: view.playerMeta.guest.doubleUsed },
        ],
        currentPlayerIndex: view.currentPlayerId === view.hostId ? 0 : 1,
        board: view.board,
        categories: view.categories,
      };
    }),
    currentPlayer: computed(() => {
      const view = store.gameView();
      if (!view) return null;
      const isHostTurn = view.currentPlayerId === view.hostId;
      return {
        name: isHostTurn ? view.hostUsername : (view.guestUsername ?? '...'),
        score: isHostTurn ? view.playerScores.host : view.playerScores.guest,
        lifelineUsed: isHostTurn ? view.playerMeta.host.lifelineUsed : view.playerMeta.guest.lifelineUsed,
        doubleUsed: isHostTurn ? view.playerMeta.host.doubleUsed : view.playerMeta.guest.doubleUsed,
      };
    }),
    currentPlayerIndex: computed(() => {
      const view = store.gameView();
      if (!view) return 0;
      return view.currentPlayerId === view.hostId ? 0 : 1;
    }),
    players: computed(() => {
      const view = store.gameView();
      if (!view) return [];
      return [
        { name: view.hostUsername, score: view.playerScores.host, lifelineUsed: view.playerMeta.host.lifelineUsed, doubleUsed: view.playerMeta.host.doubleUsed },
        { name: view.guestUsername ?? '...', score: view.playerScores.guest, lifelineUsed: view.playerMeta.guest.lifelineUsed, doubleUsed: view.playerMeta.guest.doubleUsed },
      ];
    }),
    isFinished: computed(() => {
      const view = store.gameView();
      return view?.status === 'finished' || view?.status === 'abandoned' || store.phase() === 'finished';
    }),
  })),
  withMethods((store, api = inject(OnlineGameApiService), auth = inject(AuthService)) => {
    let channel: RealtimeChannel | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    return {
      async loadGame(gameId: string): Promise<void> {
        const myUserId = auth.user()?.id ?? null;
        patchState(store, { loading: true, gameId, myUserId, error: null });
        try {
          const view = await firstValueFrom(api.getGame(gameId));
          const phase = derivePhase(view, myUserId ?? '');
          patchState(store, { gameView: view, loading: false, phase });
        } catch {
          patchState(store, { loading: false, error: 'Failed to load game' });
        }
      },

      async refreshGame(): Promise<void> {
        const gameId = store.gameId();
        const myUserId = store.myUserId();
        if (!gameId || !myUserId) return;
        try {
          const view = await firstValueFrom(api.getGame(gameId));
          const phase = derivePhase(view, myUserId);
          // If we were in question/result phase, stay there until explicitly navigated away
          const currentPhase = store.phase();
          const keepPhase = currentPhase === 'question' || currentPhase === 'result';
          patchState(store, { gameView: view, phase: keepPhase ? currentPhase : phase });
        } catch {
          // silent refresh failure
        }
      },

      subscribeRealtime(gameId: string): void {
        const client = auth.supabaseClient;
        channel = client
          .channel(`online_game:${gameId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'online_games', filter: `id=eq.${gameId}` },
            () => { this.refreshGame(); },
          )
          .subscribe();
        pollTimer = setInterval(() => { this.refreshGame(); }, 30_000);
      },

      unsubscribeRealtime(): void {
        if (channel) {
          auth.supabaseClient.removeChannel(channel);
          channel = null;
        }
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
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
        } catch {
          patchState(store, { loading: false, error: 'Failed to load question' });
        }
      },

      async submitAnswer(answer: string): Promise<OnlineAnswerResult | null> {
        const gameId = store.gameId();
        const questionId = store.currentQuestionId();
        if (!gameId || !questionId) return null;
        const useDouble = store.doubleArmed();
        patchState(store, { loading: true });
        try {
          const rawResult = await firstValueFrom(api.submitAnswer(gameId, questionId, answer, useDouble || undefined));
          const view = await firstValueFrom(api.getGame(gameId));
          // Normalize player_scores from {host,guest} object to [host,guest] tuple
          const rawScores = rawResult.player_scores as unknown as { host: number; guest: number } | [number, number];
          const normalizedScores: [number, number] = Array.isArray(rawScores)
            ? rawScores as [number, number]
            : [rawScores.host, rawScores.guest];
          const result: OnlineAnswerResult = { ...rawResult, player_scores: normalizedScores };
          patchState(store, {
            lastResult: result,
            gameView: view,
            loading: false,
            phase: 'result',
            doubleArmed: false,
          });
          return result;
        } catch {
          patchState(store, { loading: false, error: 'Failed to submit answer' });
          return null;
        }
      },

      async submitTop5Guess(answer: string): Promise<OnlineTop5GuessResult | null> {
        const gameId = store.gameId();
        const questionId = store.currentQuestionId();
        if (!gameId || !questionId) return null;
        const useDouble = store.doubleArmed();
        try {
          const result = await firstValueFrom(api.submitTop5Guess(gameId, questionId, answer, useDouble || undefined));
          const top5State: OnlineTop5State = {
            filledSlots: result.filledSlots,
            wrongGuesses: result.wrongGuesses,
            wrongCount: result.wrongCount,
            filledCount: result.filledCount,
            complete: result.complete,
            won: result.won,
          };
          if (result.complete) {
            const view = await firstValueFrom(api.getGame(gameId));
            const rawScores = result.player_scores ?? store.gameView()?.playerScores ?? { host: 0, guest: 0 };
          const answerResult: OnlineAnswerResult = {
              correct: result.won,
              correct_answer: result.correct_answer ?? '',
              explanation: result.explanation ?? '',
              points_awarded: result.points_awarded ?? 0,
              player_scores: [rawScores.host, rawScores.guest],
              lifeline_used: false,
              double_used: useDouble,
            };
            patchState(store, {
              top5State,
              lastResult: answerResult,
              gameView: view,
              phase: 'result',
              doubleArmed: false,
            });
          } else {
            patchState(store, { top5State });
          }
          return result;
        } catch {
          patchState(store, { error: 'Failed to submit guess' });
          return null;
        }
      },

      async stopTop5Early(): Promise<void> {
        const gameId = store.gameId();
        const questionId = store.currentQuestionId();
        if (!gameId || !questionId) return;
        try {
          const result = await firstValueFrom(api.stopTop5Early(gameId, questionId));
          const view = await firstValueFrom(api.getGame(gameId));
          const rawScoresStop = result.player_scores ?? store.gameView()?.playerScores ?? { host: 0, guest: 0 };
          const answerResult: OnlineAnswerResult = {
            correct: true,
            correct_answer: result.correct_answer ?? '',
            explanation: result.explanation ?? '',
            points_awarded: result.points_awarded ?? 1,
            player_scores: [rawScoresStop.host, rawScoresStop.guest],
            lifeline_used: false,
            double_used: false,
          };
          const top5State: OnlineTop5State = {
            filledSlots: result.filledSlots,
            wrongGuesses: result.wrongGuesses,
            wrongCount: result.wrongCount,
            filledCount: result.filledCount,
            complete: true,
            won: true,
          };
          patchState(store, { top5State, lastResult: answerResult, gameView: view, phase: 'result', doubleArmed: false });
        } catch {
          patchState(store, { error: 'Failed to stop early' });
        }
      },

      armDouble(): void {
        patchState(store, { doubleArmed: true });
      },

      async useLifeline(): Promise<void> {
        const gameId = store.gameId();
        const questionId = store.currentQuestionId();
        if (!gameId || !questionId) return;
        try {
          const result = await firstValueFrom(api.useLifeline(gameId, questionId));
          const view = await firstValueFrom(api.getGame(gameId));
          patchState(store, { fiftyFiftyOptions: result.options, gameView: view });
        } catch {
          patchState(store, { error: 'Failed to use lifeline' });
        }
      },

      continueToBoard(): void {
        const view = store.gameView();
        const myUserId = store.myUserId() ?? '';
        if (!view) return;
        const phase = derivePhase(view, myUserId);
        patchState(store, { phase, currentQuestion: null, currentQuestionId: null, lastResult: null, fiftyFiftyOptions: null, top5State: null });
      },

      // No-op overrideAnswer for interface compatibility with Board/Question/Result components
      async overrideAnswer(_isCorrect: boolean): Promise<void> {
        // Online mode does not support host override
      },

      async endGame(): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        try {
          await firstValueFrom(api.abandonGame(gameId));
          patchState(store, { phase: 'finished' });
        } catch {
          patchState(store, { phase: 'finished' });
        }
      },

      resetStore(): void {
        if (channel) {
          auth.supabaseClient.removeChannel(channel);
          channel = null;
        }
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        patchState(store, initialState);
      },
    };
  }),
);
