import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BattleRoyaleApiService, BRPublicView, BRPublicQuestion, BRPlayerEntry } from './battle-royale-api.service';

export type BRPhase =
  | 'lobby'       // not yet in a room
  | 'waiting'     // in room, waiting for host to start
  | 'active'      // answering questions
  | 'answered'    // just submitted — brief flash, waiting for next question state
  | 'finished';   // all done

export interface BRState {
  roomId: string | null;
  roomView: BRPublicView | null;
  myUserId: string | null;
  phase: BRPhase;
  lastAnswer: {
    correct: boolean;
    correctAnswer: string;
    pointsAwarded: number;
    timeBonus: number;
    original_image_url?: string;
  } | null;
  currentQuestion: BRPublicQuestion | null;
  myScore: number;
  myIndex: number;
  players: BRPlayerEntry[];
  submitting: boolean;
  loading: boolean;
  error: string | null;
  questionDeadline: number | null; // epoch ms when current question expires
}

const initialState: BRState = {
  roomId: null,
  roomView: null,
  myUserId: null,
  phase: 'lobby',
  lastAnswer: null,
  currentQuestion: null,
  myScore: 0,
  myIndex: 0,
  players: [],
  submitting: false,
  loading: false,
  error: null,
  questionDeadline: null,
};

function derivePhase(view: BRPublicView): BRPhase {
  if (view.status === 'finished') return 'finished';
  if (view.status === 'active') return 'active';
  return 'waiting';
}

export const BattleRoyaleStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, api = inject(BattleRoyaleApiService), auth = inject(AuthService), router = inject(Router)) => {
    let roomChannel: RealtimeChannel | null = null;
    let playersChannel: RealtimeChannel | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let refreshDebounce: ReturnType<typeof setTimeout> | null = null;
    let refreshInFlight = false;

    async function refreshRoom(roomId: string): Promise<void> {
      try {
        const view = await firstValueFrom(api.getRoom(roomId));
        const phase = store.phase();
        // Don't override 'answered' or user-local 'finished' from a background refresh,
        // but always honor room-level 'finished' status.
        let newPhase: BRPhase;
        if (view.status === 'finished') {
          newPhase = 'finished';
        } else if (phase === 'answered' || phase === 'finished') {
          newPhase = phase;
        } else {
          newPhase = derivePhase(view);
        }
        patchState(store, {
          roomView: view,
          phase: newPhase,
          currentQuestion: view.currentQuestion,
          players: view.players,
          myIndex: view.myCurrentIndex,
        });
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 404) {
          // Room was deleted (stale cleanup or host left) — redirect to lobby
          router.navigate(['/battle-royale']);
        }
      }
    }

    /** Debounced refresh: collapses multiple realtime events within 500ms into one fetch. */
    function debouncedRefresh(roomId: string): void {
      if (refreshDebounce) clearTimeout(refreshDebounce);
      refreshDebounce = setTimeout(async () => {
        refreshDebounce = null;
        if (refreshInFlight) return; // skip if a fetch is already running
        refreshInFlight = true;
        await refreshRoom(roomId);
        refreshInFlight = false;
      }, 500);
    }

    return {
      async createRoom(language?: 'en' | 'el'): Promise<string | null> {
        patchState(store, { loading: true, error: null });
        try {
          const { roomId } = await firstValueFrom(api.createRoom(language));
          patchState(store, {
            roomId,
            myUserId: auth.user()?.id ?? null,
            phase: 'waiting',
            loading: false,
          });
          return roomId;
        } catch {
          patchState(store, { loading: false, error: 'Could not create room' });
          return null;
        }
      },

      async createTeamLogoRoom(): Promise<string | null> {
        patchState(store, { loading: true, error: null });
        try {
          const { roomId } = await firstValueFrom(api.createTeamLogoRoom());
          patchState(store, {
            roomId,
            myUserId: auth.user()?.id ?? null,
            phase: 'waiting',
            loading: false,
          });
          return roomId;
        } catch {
          patchState(store, { loading: false, error: 'Could not create team logo room' });
          return null;
        }
      },

      async joinByCode(inviteCode: string): Promise<string | null> {
        patchState(store, { loading: true, error: null });
        try {
          const { roomId } = await firstValueFrom(api.joinByCode(inviteCode));
          patchState(store, {
            roomId,
            myUserId: auth.user()?.id ?? null,
            phase: 'waiting',
            loading: false,
          });
          return roomId;
        } catch {
          patchState(store, { loading: false, error: 'Room not found or not accepting players' });
          return null;
        }
      },

      async joinQueue(): Promise<string | null> {
        patchState(store, { loading: true, error: null });
        try {
          const { roomId } = await firstValueFrom(api.joinQueue());
          patchState(store, {
            roomId,
            myUserId: auth.user()?.id ?? null,
            phase: 'waiting',
            loading: false,
          });
          return roomId;
        } catch {
          patchState(store, { loading: false, error: 'Could not find a room' });
          return null;
        }
      },

      async loadRoom(roomId: string): Promise<void> {
        const myUserId = auth.user()?.id ?? null;
        patchState(store, { loading: true, roomId, myUserId, error: null });
        try {
          const view = await firstValueFrom(api.getRoom(roomId));
          const loadedPhase = derivePhase(view);
          patchState(store, {
            roomView: view,
            phase: loadedPhase,
            currentQuestion: view.currentQuestion,
            players: view.players,
            myIndex: view.myCurrentIndex,
            loading: false,
            questionDeadline: loadedPhase === 'active' && view.currentQuestion ? Date.now() + 30_000 : null,
          });
        } catch {
          patchState(store, { loading: false, error: 'Failed to load room' });
        }
      },

      async leaveRoom(): Promise<void> {
        const roomId = store.roomId();
        if (!roomId) return;
        patchState(store, { submitting: true });
        try {
          await firstValueFrom(api.leaveRoom(roomId));
        } finally {
          patchState(store, { submitting: false });
        }
      },

      async startRoom(): Promise<void> {
        const roomId = store.roomId();
        if (!roomId) return;
        try {
          await firstValueFrom(api.startRoom(roomId));
        } catch {
          patchState(store, { error: 'Could not start the game' });
        }
      },

      async submitAnswer(answer: string): Promise<void> {
        const roomId = store.roomId();
        const questionIndex = store.myIndex();
        if (!roomId || store.submitting()) return;

        patchState(store, { submitting: true, lastAnswer: null });
        try {
          const result = await firstValueFrom(api.submitAnswer(roomId, questionIndex, answer));
          patchState(store, {
            submitting: false,
            myScore: result.myScore,
            myIndex: result.finished ? questionIndex + 1 : (result.nextQuestion?.index ?? questionIndex + 1),
            lastAnswer: { correct: result.correct, correctAnswer: result.correct_answer, pointsAwarded: result.pointsAwarded, timeBonus: result.timeBonus, original_image_url: result.original_image_url },
            currentQuestion: result.nextQuestion,
            phase: result.finished ? 'finished' : 'answered',
            questionDeadline: null, // clear while showing answer flash
          });

          if (!result.finished) {
            // Clear the 'answered' flash after 1.5s and go back to 'active'
            setTimeout(() => {
              if (store.phase() === 'answered') {
                patchState(store, { phase: 'active', lastAnswer: null, questionDeadline: Date.now() + 30_000 });
              }
            }, 1500);
          }
        } catch {
          patchState(store, { submitting: false, error: 'Failed to submit answer' });
        }
      },

      subscribeRealtime(roomId: string): void {
        const client = auth.supabaseClient;
        let realtimeConnected = false;

        // Subscribe to room status changes (active, finished)
        roomChannel = client
          .channel(`br_room:${roomId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'battle_royale_rooms', filter: `id=eq.${roomId}` },
            () => { debouncedRefresh(roomId); },
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') realtimeConnected = true;
          });

        // Subscribe to player score/progress changes for live leaderboard
        playersChannel = client
          .channel(`br_players:${roomId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'battle_royale_players', filter: `room_id=eq.${roomId}` },
            () => { debouncedRefresh(roomId); },
          )
          .subscribe();

        // Fallback polling — only fires if realtime isn't connected, and at a slower rate
        pollTimer = setInterval(() => {
          if (!realtimeConnected) refreshRoom(roomId);
        }, 10_000);
      },

      unsubscribeRealtime(): void {
        if (roomChannel) {
          auth.supabaseClient.removeChannel(roomChannel);
          roomChannel = null;
        }
        if (playersChannel) {
          auth.supabaseClient.removeChannel(playersChannel);
          playersChannel = null;
        }
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        if (refreshDebounce) {
          clearTimeout(refreshDebounce);
          refreshDebounce = null;
        }
      },

      reset(): void {
        patchState(store, initialState);
      },
    };
  }),
);
