import { Test, TestingModule } from '@nestjs/testing';
import { DuelService } from './duel.service';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionPoolService } from '../questions/question-pool.service';
import { AnswerValidator } from '../questions/validators/answer.validator';
import { LogoQuizService } from '../logo-quiz/logo-quiz.service';
import { AchievementsService } from '../achievements/achievements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { XpService } from '../xp/xp.service';

/**
 * Scoped to `finalizeDuelGame` — the shared finalize pipeline extracted
 * from submitAnswer + advanceTimedOutQuestion during /review Fix #6.
 *
 * Pre-refactor bug: the timeout path skipped incrementDuelWins, XP,
 * achievements, and notifications, so timeout-won duels silently failed
 * to update duel_wins. These tests lock in that both sources fire the
 * same side effects.
 */

interface MockRow {
  id: string;
  host_id: string;
  guest_id: string | null;
  game_type: 'standard' | 'logo';
}

function mkRow(partial: Partial<MockRow> = {}): any {
  return {
    id: partial.id ?? 'game-1',
    host_id: partial.host_id ?? 'host-user',
    // Preserve explicit null — `?? 'guest-user'` would clobber null-on-purpose.
    guest_id: 'guest_id' in partial ? partial.guest_id : 'guest-user',
    game_type: partial.game_type ?? 'standard',
  };
}

describe('DuelService.finalizeDuelGame', () => {
  let service: DuelService;
  let supabase: any;
  let achievements: any;
  let notifications: any;
  let xp: any;

  beforeEach(async () => {
    supabase = {
      saveMatchResult: jest.fn().mockResolvedValue(true),
      incrementDuelWins: jest.fn().mockResolvedValue(1),
      getDuelWinCount: jest.fn().mockResolvedValue(1),
      getDuelGameCount: jest.fn().mockResolvedValue(1),
      updateDailyStreak: jest.fn().mockResolvedValue({ current_daily_streak: 1 }),
      addModePlayed: jest.fn().mockResolvedValue(['duel']),
      getProfile: jest.fn().mockResolvedValue({ id: 'host-user', username: 'host' }),
    };
    achievements = {
      checkAndAward: jest.fn().mockResolvedValue([]),
      getByIds: jest.fn().mockResolvedValue([]),
    };
    notifications = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    xp = {
      award: jest.fn().mockResolvedValue({ xp_gained: 50, total_xp: 100, level: 1, leveled_up: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuelService,
        { provide: SupabaseService, useValue: supabase },
        { provide: QuestionPoolService, useValue: {} },
        { provide: AnswerValidator, useValue: {} },
        { provide: LogoQuizService, useValue: {} },
        { provide: AchievementsService, useValue: achievements },
        { provide: NotificationsService, useValue: notifications },
        { provide: XpService, useValue: xp },
      ],
    }).compile();
    service = module.get<DuelService>(DuelService);

    // Stub the private getUsername so we don't hit the mocked supabase chain.
    (service as any).getUsername = jest.fn().mockResolvedValue('user');
    // Stub sendDuelResultNotifications (it uses getPushTokens etc. not relevant here).
    (service as any).sendDuelResultNotifications = jest.fn().mockResolvedValue(undefined);
  });

  // Helper: invoke private finalizeDuelGame + wait for fire-and-forget chains.
  async function finalize(row: any, scores: { host: number; guest: number }, winnerId: string | null, source: 'submit' | 'timeout') {
    (service as any).finalizeDuelGame(row, scores, winnerId, source);
    // Give fire-and-forget async blocks time to resolve.
    await new Promise((r) => setTimeout(r, 50));
  }

  describe('match_history save', () => {
    it("saves match_mode='duel' for standard game_type", async () => {
      await finalize(mkRow({ game_type: 'standard' }), { host: 5, guest: 3 }, 'host-user', 'submit');
      expect(supabase.saveMatchResult).toHaveBeenCalledWith(jasmine_like({ match_mode: 'duel', game_ref_type: 'duel' }));
    });

    it("saves match_mode='logo_duel' for logo game_type", async () => {
      await finalize(mkRow({ game_type: 'logo' }), { host: 5, guest: 3 }, 'host-user', 'submit');
      expect(supabase.saveMatchResult).toHaveBeenCalledWith(jasmine_like({ match_mode: 'logo_duel', game_ref_type: 'duel' }));
    });

    it('saves match_history on BOTH submit and timeout sources', async () => {
      await finalize(mkRow(), { host: 5, guest: 3 }, 'host-user', 'submit');
      expect(supabase.saveMatchResult).toHaveBeenCalledTimes(1);
      supabase.saveMatchResult.mockClear();
      await finalize(mkRow(), { host: 3, guest: 0 }, 'host-user', 'timeout');
      expect(supabase.saveMatchResult).toHaveBeenCalledTimes(1);
    });
  });

  describe('per-player win increment', () => {
    it("calls incrementDuelWins on the WINNER only, with correct game_type", async () => {
      await finalize(mkRow({ game_type: 'standard' }), { host: 5, guest: 3 }, 'host-user', 'submit');
      expect(supabase.incrementDuelWins).toHaveBeenCalledWith('host-user', 'standard');
      expect(supabase.incrementDuelWins).not.toHaveBeenCalledWith('guest-user', expect.anything());
    });

    it('logo game_type routes winner increment with p_game_type=logo', async () => {
      await finalize(mkRow({ game_type: 'logo' }), { host: 0, guest: 5 }, 'guest-user', 'submit');
      expect(supabase.incrementDuelWins).toHaveBeenCalledWith('guest-user', 'logo');
    });

    it('fires on timeout source (Fix #6 — pre-refactor bug)', async () => {
      await finalize(mkRow(), { host: 3, guest: 0 }, 'host-user', 'timeout');
      expect(supabase.incrementDuelWins).toHaveBeenCalledWith('host-user', 'standard');
    });

    it('no increment when winnerId is null (draw)', async () => {
      await finalize(mkRow(), { host: 3, guest: 3 }, null, 'submit');
      expect(supabase.incrementDuelWins).not.toHaveBeenCalled();
    });
  });

  describe('XP + achievements pipeline', () => {
    it('awards DUEL_WIN XP to the winner', async () => {
      await finalize(mkRow(), { host: 5, guest: 3 }, 'host-user', 'submit');
      expect(xp.award).toHaveBeenCalledWith('host-user', 'duel_win', expect.any(Number), { mode: 'duel' });
    });

    it('does NOT award XP to the loser', async () => {
      await finalize(mkRow(), { host: 5, guest: 3 }, 'host-user', 'submit');
      const awardedUserIds = xp.award.mock.calls.map((call: any[]) => call[0]);
      expect(awardedUserIds).not.toContain('guest-user');
    });

    it('checks achievements for BOTH players regardless of winner', async () => {
      await finalize(mkRow(), { host: 5, guest: 3 }, 'host-user', 'submit');
      const checkedUserIds = achievements.checkAndAward.mock.calls.map((call: any[]) => call[0]);
      expect(checkedUserIds).toContain('host-user');
      expect(checkedUserIds).toContain('guest-user');
    });

    it("scopes duel-win count to standard when fetching for achievement context", async () => {
      await finalize(mkRow({ game_type: 'logo' }), { host: 5, guest: 3 }, 'host-user', 'submit');
      // Winner's count is fetched with 'standard' scope — logo duels don't
      // count toward duel_5_wins/etc (plan decision).
      expect(supabase.getDuelWinCount).toHaveBeenCalledWith('host-user', 'standard');
      expect(supabase.getDuelGameCount).toHaveBeenCalledWith('host-user', 'standard');
    });

    it('timeout source still triggers achievement pipeline (Fix #6)', async () => {
      await finalize(mkRow(), { host: 3, guest: 0 }, 'host-user', 'timeout');
      expect(achievements.checkAndAward).toHaveBeenCalled();
      expect(xp.award).toHaveBeenCalledWith('host-user', 'duel_win', expect.any(Number), expect.anything());
    });
  });

  describe('guard clauses', () => {
    it('no-ops when guest_id is null (no 2P duel to finalize)', async () => {
      await finalize(mkRow({ guest_id: null }), { host: 5, guest: 0 }, 'host-user', 'submit');
      expect(supabase.saveMatchResult).not.toHaveBeenCalled();
      expect(supabase.incrementDuelWins).not.toHaveBeenCalled();
    });
  });
});

function jasmine_like<T extends object>(partial: T): T {
  return expect.objectContaining(partial) as unknown as T;
}
