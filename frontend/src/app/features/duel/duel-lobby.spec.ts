import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { signal, computed } from '@angular/core';
import { DuelLobbyComponent } from './duel-lobby';
import { DuelApiService } from './duel-api.service';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { LeaderboardApiService } from '../../core/leaderboard-api.service';
import { MatchHistoryApiService } from '../../core/match-history-api.service';
import { ProService } from '../../core/pro.service';
import type { MatchHistoryEntry } from '../../core/match-history-api.service';

const USER_ID = 'user-1';

function makeMatch(partial: Partial<MatchHistoryEntry> & { match_mode: string; winner_id: string | null }): MatchHistoryEntry {
  return {
    id: partial.id ?? 'm-' + Math.random(),
    player1_id: partial.player1_id ?? USER_ID,
    player2_id: partial.player2_id ?? 'user-2',
    player1_username: 'me',
    player2_username: 'them',
    winner_id: partial.winner_id,
    player1_score: 5,
    player2_score: 3,
    match_mode: partial.match_mode,
    played_at: new Date().toISOString(),
    game_ref_id: null,
    game_ref_type: null,
  };
}

function setupLobby(opts: { modeParam: 'logo' | null; history: MatchHistoryEntry[]; duelMe: any; logoDuelMe: any }) {
  TestBed.configureTestingModule({
    imports: [DuelLobbyComponent],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => k === 'mode' ? opts.modeParam : null } } } },
      { provide: DuelApiService, useValue: { listMyGames: () => of([]) } },
      { provide: AuthService, useValue: { user: () => ({ id: USER_ID }) } },
      { provide: LanguageService, useValue: { t: () => ({}) } },
      { provide: LeaderboardApiService, useValue: { getMyLeaderboardEntries: () => of({ soloMe: null, blitzMe: null, logoQuizMe: null, logoQuizHardcoreMe: null, duelMe: opts.duelMe, logoDuelMe: opts.logoDuelMe }) } },
      { provide: MatchHistoryApiService, useValue: { getHistory: () => of(opts.history) } },
      {
        provide: ProService,
        useValue: {
          ensureLoaded: () => Promise.resolve(),
          isDuelQueueBlocked: signal(false),
          duelQueueRetryLabel: computed(() => null),
          applyDuelQueueBlockFromError: () => false,
        },
      },
    ],
  });
  const fixture: ComponentFixture<DuelLobbyComponent> = TestBed.createComponent(DuelLobbyComponent);
  return { fixture, component: fixture.componentInstance };
}

describe('DuelLobbyComponent', () => {
  describe('loadWinStats filters by current mode', () => {
    const history = [
      makeMatch({ match_mode: 'duel', winner_id: USER_ID }),
      makeMatch({ match_mode: 'duel', winner_id: USER_ID }),
      makeMatch({ match_mode: 'duel', winner_id: 'user-2' }),
      makeMatch({ match_mode: 'logo_duel', winner_id: USER_ID }),
      makeMatch({ match_mode: 'logo_duel', winner_id: USER_ID }),
      makeMatch({ match_mode: 'logo_duel', winner_id: USER_ID }),
      makeMatch({ match_mode: 'battle_royale', winner_id: USER_ID }),
      makeMatch({ match_mode: 'online', winner_id: USER_ID }),
    ];

    it('standard lobby (no ?mode=logo) counts only match_mode === "duel"', async () => {
      const { fixture, component } = setupLobby({ modeParam: null, history, duelMe: null, logoDuelMe: null });
      fixture.detectChanges(); // fires ngOnInit
      await fixture.whenStable();
      expect(component.wins()).toBe(2);
      expect(component.losses()).toBe(1);
      expect(component.draws()).toBe(0);
    });

    it('logo lobby (?mode=logo) counts only match_mode === "logo_duel"', async () => {
      const { fixture, component } = setupLobby({ modeParam: 'logo', history, duelMe: null, logoDuelMe: null });
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.wins()).toBe(3);
      expect(component.losses()).toBe(0);
      expect(component.draws()).toBe(0);
    });

    // Tests above already prove mode isolation: standard lobby only counts
    // match_mode==='duel' (2+1=3 games out of 8 in history), logo lobby only
    // counts match_mode==='logo_duel' (3 games). Unrelated modes (BR, online)
    // are excluded in both cases by construction.
  });

  describe('loadRank reads the right leaderboard entry', () => {
    it('standard lobby reads duelMe.rank', async () => {
      const { fixture, component } = setupLobby({
        modeParam: null,
        history: [],
        duelMe: { rank: 7, wins: 10, losses: 3, games_played: 13, user_id: USER_ID, username: 'me' },
        logoDuelMe: { rank: 99, wins: 1, losses: 0, games_played: 1, user_id: USER_ID, username: 'me' },
      });
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.myRank()).toBe(7);
    });

    it('logo lobby reads logoDuelMe.rank', async () => {
      const { fixture, component } = setupLobby({
        modeParam: 'logo',
        history: [],
        duelMe: { rank: 7, wins: 10, losses: 3, games_played: 13, user_id: USER_ID, username: 'me' },
        logoDuelMe: { rank: 3, wins: 5, losses: 1, games_played: 6, user_id: USER_ID, username: 'me' },
      });
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.myRank()).toBe(3);
    });

    it('null when no leaderboard entry exists for current mode', async () => {
      const { fixture, component } = setupLobby({ modeParam: 'logo', history: [], duelMe: null, logoDuelMe: null });
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.myRank()).toBeNull();
    });
  });
});
