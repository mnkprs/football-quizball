import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { inject, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../core/auth.service';
import { DuelApiService, DuelPublicView, DuelAnswerResult, DuelQuestionResult } from './duel-api.service';

export type DuelPhase =
  | 'lobby'       // before joining / creating
  | 'waiting'     // created, waiting for opponent
  | 'ready-up'    // both joined, waiting for both to press ready
  | 'active'      // game in progress, showing question
  | 'answered'    // I just submitted correct answer (waiting for next question via Realtime)
  | 'opponent-answered' // opponent answered correctly (brief flash)
  | 'finished';   // game over

export interface DuelState {
  gameId: string | null;
  gameView: DuelPublicView | null;
  myUserId: string | null;
  phase: DuelPhase;
  /** Last answer result for the current player */
  lastAnswerResult: DuelAnswerResult | null;
  /** Whether the current submission is in-flight */
  submitting: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: DuelState = {
  gameId: null,
  gameView: null,
  myUserId: null,
  phase: 'lobby',
  lastAnswerResult: null,
  submitting: false,
  loading: false,
  error: null,
};

function derivePhase(view: DuelPublicView): DuelPhase {
  if (view.status === 'finished' || view.status === 'abandoned') return 'finished';
  if (view.status === 'waiting') {
    if (view.guestUsername) return 'ready-up';
    return 'waiting';
  }
  // active
  return 'active';
}

export const DuelStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    myScore: computed(() => {
      const view = store.gameView();
      if (!view) return 0;
      return view.myRole === 'host' ? view.scores.host : view.scores.guest;
    }),
    opponentScore: computed(() => {
      const view = store.gameView();
      if (!view) return 0;
      return view.myRole === 'host' ? view.scores.guest : view.scores.host;
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
    imReady: computed(() => {
      const view = store.gameView();
      if (!view) return false;
      return view.myRole === 'host' ? view.hostReady : view.guestReady;
    }),
    opponentReady: computed(() => {
      const view = store.gameView();
      if (!view) return false;
      return view.myRole === 'host' ? view.guestReady : view.hostReady;
    }),
    currentQuestion: computed(() => store.gameView()?.currentQuestion ?? null),
    currentQuestionIndex: computed(() => store.gameView()?.currentQuestionIndex ?? 0),
    questionResults: computed(() => store.gameView()?.questionResults ?? ([] as DuelQuestionResult[])),
    isFinished: computed(() => store.phase() === 'finished'),
    inviteCode: computed(() => store.gameView()?.inviteCode ?? null),
    gameWinner: computed((): 'me' | 'opponent' | 'draw' | null => {
      const view = store.gameView();
      if (!view || view.status !== 'finished') return null;
      const myScore = view.myRole === 'host' ? view.scores.host : view.scores.guest;
      const oppScore = view.myRole === 'host' ? view.scores.guest : view.scores.host;
      if (myScore > oppScore) return 'me';
      if (oppScore > myScore) return 'opponent';
      return 'draw';
    }),
  })),
  withMethods((store, api = inject(DuelApiService), auth = inject(AuthService)) => {
    let channel: RealtimeChannel | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    return {
      async loadGame(gameId: string): Promise<void> {
        const myUserId = auth.user()?.id ?? null;
        patchState(store, { loading: true, gameId, myUserId, error: null });
        try {
          const view = await firstValueFrom(api.getGame(gameId));
          patchState(store, { gameView: view, loading: false, phase: derivePhase(view) });
        } catch {
          patchState(store, { loading: false, error: 'Failed to load duel' });
        }
      },

      async refreshGame(): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        try {
          const view = await firstValueFrom(api.getGame(gameId));
          const currentPhase = store.phase();
          // Stay in 'answered' / 'opponent-answered' phases until cleared by component
          const keepPhase: DuelPhase[] = ['answered', 'opponent-answered'];
          const newPhase = keepPhase.includes(currentPhase) ? currentPhase : derivePhase(view);
          patchState(store, { gameView: view, phase: newPhase });
        } catch {
          // silent
        }
      },

      subscribeRealtime(gameId: string): void {
        const client = auth.supabaseClient;
        channel = client
          .channel(`duel_game:${gameId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'duel_games', filter: `id=eq.${gameId}` },
            () => { this.refreshGame(); },
          )
          .subscribe();
        // Fallback polling every 5s (fast-paced game needs quick sync)
        pollTimer = setInterval(() => { this.refreshGame(); }, 5_000);
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

      async createGame(): Promise<string | null> {
        patchState(store, { loading: true, error: null });
        try {
          const view = await firstValueFrom(api.createGame());
          patchState(store, {
            gameId: view.id,
            gameView: view,
            myUserId: auth.user()?.id ?? null,
            phase: 'waiting',
            loading: false,
          });
          return view.id;
        } catch {
          patchState(store, { loading: false, error: 'Failed to create duel' });
          return null;
        }
      },

      async joinByCode(inviteCode: string): Promise<string | null> {
        patchState(store, { loading: true, error: null });
        try {
          const view = await firstValueFrom(api.joinByCode(inviteCode));
          patchState(store, {
            gameId: view.id,
            gameView: view,
            myUserId: auth.user()?.id ?? null,
            phase: derivePhase(view),
            loading: false,
          });
          return view.id;
        } catch {
          patchState(store, { loading: false, error: 'Invalid invite code' });
          return null;
        }
      },

      async joinQueue(): Promise<string | null> {
        patchState(store, { loading: true, error: null });
        try {
          const view = await firstValueFrom(api.joinQueue());
          patchState(store, {
            gameId: view.id,
            gameView: view,
            myUserId: auth.user()?.id ?? null,
            phase: derivePhase(view),
            loading: false,
          });
          return view.id;
        } catch {
          patchState(store, { loading: false, error: 'Failed to join queue' });
          return null;
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

      async submitAnswer(answer: string): Promise<DuelAnswerResult | null> {
        const gameId = store.gameId();
        const qIndex = store.currentQuestionIndex();
        if (!gameId) return null;

        patchState(store, { submitting: true, error: null });
        try {
          const result = await firstValueFrom(api.submitAnswer(gameId, answer, qIndex));
          patchState(store, { submitting: false, lastAnswerResult: result });

          if (result.correct && !result.lostRace) {
            // I won the question — transition to answered; Realtime will bring next question
            patchState(store, { phase: 'answered' });
          }
          return result;
        } catch {
          patchState(store, { submitting: false, error: 'Failed to submit answer' });
          return null;
        }
      },

      /** Called by component after showing the "opponent answered" flash */
      clearAnsweredPhase(): void {
        const view = store.gameView();
        if (!view) return;
        patchState(store, { phase: derivePhase(view), lastAnswerResult: null });
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

      /** Called when the 30s client timer reaches zero. Fires-and-forgets — server cron is the fallback. */
      async timeoutQuestion(questionIndex: number): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        try {
          await firstValueFrom(api.timeoutQuestion(gameId, questionIndex));
          // State update arrives via Realtime subscription
        } catch {
          // silent — cron will advance if the request fails
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
