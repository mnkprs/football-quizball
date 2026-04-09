import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { inject, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../core/auth.service';
import { OnlineGameApiService, OnlinePublicView } from './online-game-api.service';

export type OnlineGamePhase =
  | 'lobby'           // no game loaded
  | 'waiting'         // created, waiting for guest
  | 'ready-up'        // guest joined, waiting for both ready
  | 'board'           // my turn: pick a question
  | 'spectate-board'  // opponent's turn: watching board
  | 'question'        // my turn: answering
  | 'spectating'      // opponent's turn: watching them answer
  | 'result'          // both see result
  | 'finished';       // game over

export interface OnlineGameState {
  gameId: string | null;
  gameView: OnlinePublicView | null;
  phase: OnlineGamePhase;
  fiftyFiftyOptions: string[] | null;
  doubleArmed: boolean;
  loading: boolean;
  submitting: boolean;
  error: string | null;
}

const initialState: OnlineGameState = {
  gameId: null,
  gameView: null,
  phase: 'lobby',
  fiftyFiftyOptions: null,
  doubleArmed: false,
  loading: false,
  submitting: false,
  error: null,
};

function derivePhase(view: OnlinePublicView): OnlineGamePhase {
  if (view.status === 'finished' || view.status === 'abandoned') return 'finished';
  if (view.status === 'waiting') {
    if (view.players[1]?.name !== '???' && view.players[1]?.name) return 'ready-up';
    return 'waiting';
  }
  const isMyTurn = view.currentPlayerIndex === view.myPlayerIndex;
  if (view.lastResult) return 'result';
  if (view.turnState) return isMyTurn ? 'question' : 'spectating';
  return isMyTurn ? 'board' : 'spectate-board';
}

export const OnlineGameStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    isMyTurn: computed(() => {
      const view = store.gameView();
      if (!view) return false;
      return view.currentPlayerIndex === view.myPlayerIndex;
    }),
    myPlayer: computed(() => {
      const view = store.gameView();
      if (!view) return null;
      return view.players[view.myPlayerIndex] ?? null;
    }),
    opponentPlayer: computed(() => {
      const view = store.gameView();
      if (!view) return null;
      const otherIndex: 0 | 1 = view.myPlayerIndex === 0 ? 1 : 0;
      return view.players[otherIndex] ?? null;
    }),
    board: computed(() => store.gameView()?.board ?? null),
    categories: computed(() => store.gameView()?.categories ?? []),
    turnState: computed(() => store.gameView()?.turnState ?? null),
    lastResult: computed(() => store.gameView()?.lastResult ?? null),
    inviteCode: computed(() => store.gameView()?.inviteCode ?? null),
    players: computed(() => store.gameView()?.players ?? null),
  })),
  withMethods((store, api = inject(OnlineGameApiService), auth = inject(AuthService)) => {
    let channel: RealtimeChannel | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    return {
      async createGame(playerName: string): Promise<string | null> {
        patchState(store, { loading: true, error: null });
        try {
          const view = await firstValueFrom(api.createGame(playerName));
          patchState(store, {
            gameId: view.id,
            gameView: view,
            phase: 'waiting',
            loading: false,
          });
          return view.id;
        } catch {
          patchState(store, { loading: false, error: 'Failed to create game' });
          return null;
        }
      },

      async joinGame(inviteCode: string, playerName?: string): Promise<string | null> {
        const name = playerName
          ?? (auth.user()?.user_metadata?.['username'] as string | undefined)
          ?? auth.user()?.email
          ?? 'Player';
        patchState(store, { loading: true, error: null });
        try {
          const view = await firstValueFrom(api.joinByCode(inviteCode, name));
          patchState(store, {
            gameId: view.id,
            gameView: view,
            phase: derivePhase(view),
            loading: false,
          });
          return view.id;
        } catch {
          patchState(store, { loading: false, error: 'Invalid invite code' });
          return null;
        }
      },

      async loadGame(gameId: string): Promise<void> {
        patchState(store, { loading: true, gameId, error: null });
        try {
          const view = await firstValueFrom(api.getGame(gameId));
          patchState(store, { gameView: view, loading: false, phase: derivePhase(view) });
        } catch {
          patchState(store, { loading: false, error: 'Failed to load game' });
        }
      },

      async refreshGame(): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        try {
          const view = await firstValueFrom(api.getGame(gameId));
          patchState(store, { gameView: view, phase: derivePhase(view) });
        } catch {
          // silent
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
        // Fallback polling every 15s — Realtime handles fast updates, this is just a safety net
        pollTimer = setInterval(() => { this.refreshGame(); }, 15_000);
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

      async markReady(): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        try {
          const view = await firstValueFrom(api.markReady(gameId));
          patchState(store, { gameView: view, phase: derivePhase(view) });
        } catch {
          patchState(store, { error: 'Failed to mark ready' });
        }
      },

      async selectQuestion(questionId: string): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        patchState(store, { submitting: true, error: null });
        try {
          const view = await firstValueFrom(api.selectQuestion(gameId, questionId));
          patchState(store, { gameView: view, phase: derivePhase(view), submitting: false });
        } catch {
          patchState(store, { submitting: false, error: 'Failed to select question' });
        }
      },

      async submitAnswer(questionId: string, answer: string): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        const useDouble = store.doubleArmed();
        patchState(store, { submitting: true, error: null, doubleArmed: false });
        try {
          const view = await firstValueFrom(api.submitAnswer(gameId, questionId, answer, useDouble || undefined));
          patchState(store, { gameView: view, phase: derivePhase(view), submitting: false });
        } catch {
          patchState(store, { submitting: false, error: 'Failed to submit answer' });
        }
      },

      async useLifeline(questionId: string): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        patchState(store, { submitting: true, error: null });
        try {
          const result = await firstValueFrom(api.useLifeline(gameId, questionId));
          patchState(store, { fiftyFiftyOptions: result.options, submitting: false });
        } catch {
          patchState(store, { submitting: false, error: 'Failed to use lifeline' });
        }
      },

      async submitTop5Guess(questionId: string, answer: string): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        const useDouble = store.doubleArmed();
        patchState(store, { submitting: true, error: null, doubleArmed: false });
        try {
          const view = await firstValueFrom(api.submitTop5Guess(gameId, questionId, answer, useDouble || undefined));
          patchState(store, { gameView: view, phase: derivePhase(view), submitting: false });
        } catch {
          patchState(store, { submitting: false, error: 'Failed to submit guess' });
        }
      },

      async stopTop5Early(questionId: string): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        patchState(store, { submitting: true, error: null });
        try {
          const view = await firstValueFrom(api.stopTop5Early(gameId, questionId));
          patchState(store, { gameView: view, phase: derivePhase(view), submitting: false });
        } catch {
          patchState(store, { submitting: false, error: 'Failed to stop top 5' });
        }
      },

      async continueToBoard(): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        patchState(store, { submitting: true, error: null });
        try {
          const view = await firstValueFrom(api.continueToBoard(gameId));
          patchState(store, {
            gameView: view,
            phase: derivePhase(view),
            submitting: false,
            fiftyFiftyOptions: null,
          });
        } catch {
          patchState(store, { submitting: false, error: 'Failed to continue' });
        }
      },

      armDouble(): void {
        patchState(store, { doubleArmed: true });
      },

      async abandonGame(): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        try {
          await firstValueFrom(api.abandonGame(gameId));
          patchState(store, { phase: 'finished' });
        } catch {
          // silent
        }
      },

      /** Alias for abandonGame — used by queue/lobby flow */
      async leaveQueue(): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        try {
          await firstValueFrom(api.abandonGame(gameId));
        } catch {
          // ignore — navigate back regardless
        }
      },

      reset(): void {
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
