import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DuelService } from './duel.service';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionPoolService } from '../questions/question-pool.service';
import { AnswerValidator } from '../questions/validators/answer.validator';
import { LogoQuizService } from '../logo-quiz/logo-quiz.service';
import { AchievementsService } from '../achievements/achievements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { XpService } from '../xp/xp.service';

/**
 * Focused tests for the reservation system added in v0.10.0.19 (Day 2).
 *
 * Coverage:
 *   • acceptGame — idempotency, status guard, both-accept-flips-active
 *   • forfeitOnReservationTimeout — CAS prevents double-forfeit
 *   • applyForfeitPenalty — -5 ELO with floor at 500
 *   • joinQueue — global exclusivity rejects cross-mode (S0b regression)
 *
 * Mocks the chained supabase.client query builder via a thenable-with-update
 * style stub. Each test sets the next return value explicitly.
 */

function makeChainable<T>(result: T) {
  const chain: any = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
    then: undefined as any,
  };
  // Make the chain awaitable for queries that don't end in .single()
  chain.then = (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

describe('DuelService — reservation system', () => {
  let service: DuelService;
  let supabase: any;
  let notifications: any;
  let questionPool: any;

  beforeEach(async () => {
    const chain = makeChainable({ data: null, error: null });
    supabase = {
      client: chain,
      getProfile: jest.fn().mockResolvedValue({ id: 'u1', username: 'u1', elo: 1000 }),
      updateElo: jest.fn().mockResolvedValue(undefined),
      insertEloHistory: jest.fn().mockResolvedValue(undefined),
      consumeDuelTrial: jest.fn().mockResolvedValue(0),
      recordDuelNoShow: jest.fn().mockResolvedValue(null),
    };
    notifications = { create: jest.fn().mockResolvedValue(undefined) };
    questionPool = {
      returnUnansweredToPool: jest.fn().mockResolvedValue(undefined),
      drawForDuel: jest.fn().mockResolvedValue([]),
      recordBoardHistory: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuelService,
        { provide: SupabaseService, useValue: supabase },
        { provide: QuestionPoolService, useValue: questionPool },
        { provide: AnswerValidator, useValue: {} },
        { provide: LogoQuizService, useValue: { getFreePoolCutoff: jest.fn().mockResolvedValue(null) } },
        { provide: AchievementsService, useValue: {} },
        { provide: NotificationsService, useValue: notifications },
        { provide: XpService, useValue: {} },
      ],
    }).compile();
    service = module.get<DuelService>(DuelService);
    (service as any).getUsername = jest.fn().mockResolvedValue('user');
  });

  describe('acceptGame', () => {
    it('rejects when game status is not "reserved"', async () => {
      (service as any).fetchGame = jest.fn().mockResolvedValue({
        id: 'g1', status: 'active', host_id: 'host', guest_id: 'guest',
      });
      await expect(service.acceptGame('host', 'g1')).rejects.toThrow(ConflictException);
    });

    it('is idempotent when user already accepted', async () => {
      const row = {
        id: 'g1', status: 'reserved', host_id: 'host', guest_id: 'guest',
        host_accepted_at: '2026-04-26T00:00:00Z', guest_accepted_at: null,
        reserved_at: '2026-04-26T00:00:00Z', game_type: 'logo',
        question_results: [], questions: [], current_question_index: 0,
        host_ready: false, guest_ready: false, scores: { host: 0, guest: 0 },
        invite_code: null,
      };
      (service as any).fetchGame = jest.fn().mockResolvedValue(row);
      const view = await service.acceptGame('host', 'g1');
      expect(view.status).toBe('reserved');
      expect(supabase.client.update).not.toHaveBeenCalled();
    });

    it('flips status to "active" when SECOND player accepts', async () => {
      const row = {
        id: 'g1', status: 'reserved', host_id: 'host', guest_id: 'guest',
        host_accepted_at: '2026-04-26T00:00:00Z', guest_accepted_at: null,
        reserved_at: '2026-04-26T00:00:00Z', game_type: 'logo',
        question_results: [], questions: [], current_question_index: 0,
        host_ready: false, guest_ready: false, scores: { host: 0, guest: 0 },
        invite_code: null,
      };
      (service as any).fetchGame = jest.fn().mockResolvedValue(row);
      const updatedRow = { ...row, status: 'active', host_ready: true, guest_ready: true, guest_accepted_at: '2026-04-26T00:00:05Z' };
      const updateChain = makeChainable({ data: updatedRow, error: null });
      supabase.client.from = jest.fn().mockReturnValue(updateChain);

      const view = await service.acceptGame('guest', 'g1');
      expect(updateChain.update).toHaveBeenCalled();
      const updateCall = updateChain.update.mock.calls[0][0];
      expect(updateCall.status).toBe('active');
      expect(updateCall.host_ready).toBe(true);
      expect(updateCall.guest_ready).toBe(true);
      expect(updateCall.guest_accepted_at).toBeTruthy();
      expect(view.status).toBe('active');
    });

    it('only stamps own accepted_at when FIRST player accepts', async () => {
      const row = {
        id: 'g1', status: 'reserved', host_id: 'host', guest_id: 'guest',
        host_accepted_at: null, guest_accepted_at: null,
        reserved_at: '2026-04-26T00:00:00Z', game_type: 'logo',
        question_results: [], questions: [], current_question_index: 0,
        host_ready: false, guest_ready: false, scores: { host: 0, guest: 0 },
        invite_code: null,
      };
      (service as any).fetchGame = jest.fn().mockResolvedValue(row);
      const updatedRow = { ...row, host_accepted_at: '2026-04-26T00:00:03Z' };
      const updateChain = makeChainable({ data: updatedRow, error: null });
      supabase.client.from = jest.fn().mockReturnValue(updateChain);

      await service.acceptGame('host', 'g1');
      const updateCall = updateChain.update.mock.calls[0][0];
      expect(updateCall.host_accepted_at).toBeTruthy();
      // Status should NOT flip yet — only one acceptance.
      expect(updateCall.status).toBeUndefined();
      expect(updateCall.guest_ready).toBeUndefined();
    });
  });

  describe('forfeitOnReservationTimeout', () => {
    it('no-ops when game is not reserved (already accepted/abandoned)', async () => {
      const fetchChain = makeChainable({ data: { status: 'active' }, error: null });
      const updateChain = makeChainable({ data: null, error: null });
      let calls = 0;
      supabase.client.from = jest.fn().mockImplementation(() => {
        calls++;
        return calls === 1 ? fetchChain : updateChain;
      });

      await service.forfeitOnReservationTimeout('g1');
      expect(updateChain.update).not.toHaveBeenCalled();
    });

    it('returns silently when row not found', async () => {
      const fetchChain = makeChainable({ data: null, error: null });
      supabase.client.from = jest.fn().mockReturnValue(fetchChain);
      await expect(service.forfeitOnReservationTimeout('missing')).resolves.toBeUndefined();
    });
  });

  describe('applyForfeitPenalty', () => {
    it('writes -5 elo_history entry with mode=duel_forfeit', async () => {
      supabase.getProfile.mockResolvedValue({ id: 'u1', username: 'u1', elo: 1000 });
      await (service as any).applyForfeitPenalty('u1');
      expect(supabase.updateElo).toHaveBeenCalledWith('u1', 995);
      expect(supabase.insertEloHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'u1',
          elo_before: 1000,
          elo_after: 995,
          elo_change: -5,
          mode: 'duel_forfeit',
          question_difficulty: 'reservation_forfeit',
          correct: false,
          timed_out: true,
        }),
      );
    });

    it('respects ELO floor of 500', async () => {
      supabase.getProfile.mockResolvedValue({ id: 'u1', username: 'u1', elo: 502 });
      await (service as any).applyForfeitPenalty('u1');
      expect(supabase.updateElo).toHaveBeenCalledWith('u1', 500);
      const elo_history_call = supabase.insertEloHistory.mock.calls[0][0];
      expect(elo_history_call.elo_change).toBe(-2); // capped at floor
      expect(elo_history_call.elo_after).toBe(500);
    });

    it('handles missing profile gracefully (defaults elo_before=1000)', async () => {
      supabase.getProfile.mockResolvedValue(null);
      await (service as any).applyForfeitPenalty('u1');
      expect(supabase.updateElo).toHaveBeenCalledWith('u1', 995);
    });
  });

  describe('abandonGame — active state forfeit', () => {
    it('finalizes with opponent as winner when host abandons during active duel', async () => {
      const row = {
        id: 'g1',
        status: 'active',
        host_id: 'host',
        guest_id: 'guest',
        scores: { host: 2, guest: 3 },
        pool_question_ids: [],
        game_type: 'logo',
        questions: [],
        question_results: [],
        current_question_index: 0,
        host_ready: true,
        guest_ready: true,
        invite_code: null,
      };
      (service as any).fetchGame = jest.fn().mockResolvedValue(row);
      const finalizeSpy = jest.spyOn(service as any, 'finalizeDuelGame').mockImplementation(() => undefined);
      const updateChain = makeChainable({ data: { id: 'g1' }, error: null });
      supabase.client.from = jest.fn().mockReturnValue(updateChain);

      await service.abandonGame('host', 'g1');

      expect(finalizeSpy).toHaveBeenCalledWith(row, row.scores, 'guest', 'abandon');
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'abandoned' }),
      );
    });

    it('finalizes with HOST as winner when guest abandons during active duel', async () => {
      const row = {
        id: 'g1', status: 'active', host_id: 'host', guest_id: 'guest',
        scores: { host: 4, guest: 1 }, pool_question_ids: [], game_type: 'standard',
        questions: [], question_results: [], current_question_index: 0,
        host_ready: true, guest_ready: true, invite_code: null,
      };
      (service as any).fetchGame = jest.fn().mockResolvedValue(row);
      const finalizeSpy = jest.spyOn(service as any, 'finalizeDuelGame').mockImplementation(() => undefined);
      supabase.client.from = jest.fn().mockReturnValue(makeChainable({ data: { id: 'g1' }, error: null }));

      await service.abandonGame('guest', 'g1');

      expect(finalizeSpy).toHaveBeenCalledWith(row, row.scores, 'host', 'abandon');
    });

    it('does NOT finalize when waiting state has no guest (queue cleanup, no winner)', async () => {
      const row = {
        id: 'g1', status: 'waiting', host_id: 'host', guest_id: null,
        scores: { host: 0, guest: 0 }, pool_question_ids: [], game_type: 'logo',
        questions: [], question_results: [], current_question_index: 0,
        host_ready: false, guest_ready: false, invite_code: null,
      };
      (service as any).fetchGame = jest.fn().mockResolvedValue(row);
      const finalizeSpy = jest.spyOn(service as any, 'finalizeDuelGame').mockImplementation(() => undefined);
      supabase.client.from = jest.fn().mockReturnValue(makeChainable({ data: null, error: null }));

      await service.abandonGame('host', 'g1');

      expect(finalizeSpy).not.toHaveBeenCalled();
    });

    it('does NOT finalize when ready-up phase (waiting + guest, pre-active, no scores yet)', async () => {
      const row = {
        id: 'g1', status: 'waiting', host_id: 'host', guest_id: 'guest',
        scores: { host: 0, guest: 0 }, pool_question_ids: [], game_type: 'standard',
        questions: [], question_results: [], current_question_index: 0,
        host_ready: false, guest_ready: false, invite_code: 'ABC123',
      };
      (service as any).fetchGame = jest.fn().mockResolvedValue(row);
      const finalizeSpy = jest.spyOn(service as any, 'finalizeDuelGame').mockImplementation(() => undefined);
      supabase.client.from = jest.fn().mockReturnValue(makeChainable({ data: null, error: null }));

      await service.abandonGame('host', 'g1');

      expect(finalizeSpy).not.toHaveBeenCalled();
    });

    it('throws when game already finished', async () => {
      (service as any).fetchGame = jest.fn().mockResolvedValue({
        id: 'g1', status: 'finished', host_id: 'host', guest_id: 'guest',
      });
      await expect(service.abandonGame('host', 'g1')).rejects.toThrow('Game is already over.');
    });

    it('does NOT finalize when CAS loses (concurrent timeout/submit already finalized)', async () => {
      // Race scenario: fetchGame sees status='active', but between fetch and
      // the CAS update another caller (advanceTimedOutQuestion or submitAnswer)
      // already transitioned the row to 'finished'. The CAS .eq('status','active')
      // returns null, so finalize must NOT fire — preventing double match_history /
      // double XP / double achievements.
      const row = {
        id: 'g1', status: 'active', host_id: 'host', guest_id: 'guest',
        scores: { host: 2, guest: 3 }, pool_question_ids: [], game_type: 'logo',
        questions: [], question_results: [], current_question_index: 0,
        host_ready: true, guest_ready: true, invite_code: null,
      };
      (service as any).fetchGame = jest.fn().mockResolvedValue(row);
      const finalizeSpy = jest.spyOn(service as any, 'finalizeDuelGame').mockImplementation(() => undefined);
      // CAS update returns null => lost the race
      supabase.client.from = jest.fn().mockReturnValue(makeChainable({ data: null, error: null }));

      await service.abandonGame('host', 'g1');

      expect(finalizeSpy).not.toHaveBeenCalled();
    });
  });

  describe('joinQueue global exclusivity (S0b regression)', () => {
    it('rejects with ConflictException when user has active queue in DIFFERENT game_type', async () => {
      const fetchChain = makeChainable({
        data: { id: 'g1', status: 'waiting', host_id: 'u1', guest_id: null, invite_code: null, game_type: 'logo' },
        error: null,
      });
      supabase.client.from = jest.fn().mockReturnValue(fetchChain);
      await expect(service.joinQueue('u1', { gameType: 'standard' })).rejects.toThrow(ConflictException);
    });
  });
});
