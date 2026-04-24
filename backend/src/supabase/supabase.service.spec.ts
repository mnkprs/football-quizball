import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from './supabase.service';
import { RedisService } from '../redis/redis.service';

/**
 * Tests scoped to the duel/logo-duel methods added or modified in the
 * feat/profile-leaderboard-zoom branch. The rest of SupabaseService is
 * covered implicitly by integration tests and the match-history spec.
 *
 * Strategy: mock `client.rpc` and `getProfile` directly — the methods
 * under test route all DB access through those two entry points, so we
 * don't need to mock the full supabase-js query chain.
 */

function buildConfigStub() {
  return {
    get: jest.fn((key: string) => {
      if (key === 'SUPABASE_URL') return 'http://localhost:54321';
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'stub-key';
      return undefined;
    }),
  } as Partial<ConfigService>;
}

function buildRedisStub() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  } as Partial<RedisService>;
}

describe('SupabaseService — duel/logo-duel methods', () => {
  let service: SupabaseService;
  let rpcMock: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseService,
        { provide: ConfigService, useValue: buildConfigStub() },
        { provide: RedisService, useValue: buildRedisStub() },
      ],
    }).compile();
    service = module.get<SupabaseService>(SupabaseService);

    // Replace the real supabase client's rpc method with a mock. We don't
    // replace the whole client object because getProfile (when called) uses
    // .from().select().eq().maybeSingle() — we stub getProfile instead.
    rpcMock = jest.fn();
    (service.client as any).rpc = rpcMock;
  });

  describe('getDuelLeaderboardEntryForUser', () => {
    beforeEach(() => {
      jest.spyOn(service, 'getProfile').mockResolvedValue({ id: 'u1', username: 'me' } as any);
    });

    it('returns null when user never played a duel (games_played === 0)', async () => {
      rpcMock.mockResolvedValueOnce({ data: [{ wins: 0, losses: 0, games_played: 0 }], error: null });
      const result = await service.getDuelLeaderboardEntryForUser('u1');
      expect(result).toBeNull();
    });

    it('returns null when RPC returns no rows', async () => {
      rpcMock.mockResolvedValueOnce({ data: null, error: null });
      const result = await service.getDuelLeaderboardEntryForUser('u1');
      expect(result).toBeNull();
    });

    it('surfaces losses for 0W/5L player (the Fix #1 behavior)', async () => {
      rpcMock
        .mockResolvedValueOnce({ data: [{ wins: 0, losses: 5, games_played: 5 }], error: null }) // get_duel_user_stats
        .mockResolvedValueOnce({ data: 0, error: null }); // get_duel_rank (not called in this path)
      const result = await service.getDuelLeaderboardEntryForUser('u1');
      expect(result).not.toBeNull();
      expect(result!.wins).toBe(0);
      expect(result!.losses).toBe(5);
      expect(result!.rank).toBe(0); // wins===0 clamps rank to 0, not null (interface is `number`)
    });

    it('returns full record + rank for a ranked player', async () => {
      rpcMock
        .mockResolvedValueOnce({ data: [{ wins: 10, losses: 3, games_played: 13 }], error: null })
        .mockResolvedValueOnce({ data: 7, error: null });
      const result = await service.getDuelLeaderboardEntryForUser('u1');
      expect(result).toEqual(jasmine_like({
        user_id: 'u1',
        username: 'me',
        wins: 10,
        losses: 3,
        games_played: 13,
        rank: 7,
      }));
    });
  });

  describe('getLogoDuelLeaderboardEntryForUser', () => {
    beforeEach(() => {
      jest.spyOn(service, 'getProfile').mockResolvedValue({ id: 'u1', username: 'me' } as any);
    });

    it('mirrors standard-duel null-handling for never-played', async () => {
      rpcMock.mockResolvedValueOnce({ data: [{ wins: 0, losses: 0, games_played: 0 }], error: null });
      const result = await service.getLogoDuelLeaderboardEntryForUser('u1');
      expect(result).toBeNull();
    });

    it('surfaces losses for 0W/5L logo duel player', async () => {
      rpcMock
        .mockResolvedValueOnce({ data: [{ wins: 0, losses: 5, games_played: 5 }], error: null })
        .mockResolvedValueOnce({ data: 0, error: null });
      const result = await service.getLogoDuelLeaderboardEntryForUser('u1');
      expect(result).not.toBeNull();
      expect(result!.losses).toBe(5);
    });

    it('calls the logo-specific RPC names', async () => {
      rpcMock
        .mockResolvedValueOnce({ data: [{ wins: 3, losses: 1, games_played: 4 }], error: null })
        .mockResolvedValueOnce({ data: 2, error: null });
      await service.getLogoDuelLeaderboardEntryForUser('u1');
      // First call should be get_logo_duel_user_stats, second get_logo_duel_rank
      expect(rpcMock.mock.calls[0][0]).toBe('get_logo_duel_user_stats');
      expect(rpcMock.mock.calls[1][0]).toBe('get_logo_duel_rank');
    });
  });

  describe('incrementDuelWins (atomic RPC)', () => {
    it('calls the increment_duel_wins RPC with correct game_type', async () => {
      rpcMock.mockResolvedValueOnce({ data: 8, error: null });
      const result = await service.incrementDuelWins('u1', 'standard');
      expect(rpcMock).toHaveBeenCalledWith('increment_duel_wins', {
        p_user_id: 'u1',
        p_game_type: 'standard',
      });
      expect(result).toBe(8);
    });

    it('routes logo game_type to the same RPC with p_game_type=logo', async () => {
      rpcMock.mockResolvedValueOnce({ data: 11, error: null });
      const result = await service.incrementDuelWins('u1', 'logo');
      expect(rpcMock).toHaveBeenCalledWith('increment_duel_wins', {
        p_user_id: 'u1',
        p_game_type: 'logo',
      });
      expect(result).toBe(11);
    });

    it('defaults to standard when gameType omitted', async () => {
      rpcMock.mockResolvedValueOnce({ data: 1, error: null });
      await service.incrementDuelWins('u1');
      expect(rpcMock.mock.calls[0][1]).toEqual({ p_user_id: 'u1', p_game_type: 'standard' });
    });

    it('throws when the RPC returns an error', async () => {
      rpcMock.mockResolvedValueOnce({ data: null, error: new Error('race condition') });
      await expect(service.incrementDuelWins('u1', 'standard')).rejects.toThrow('race condition');
    });

    it('returns 0 when data is nullish but no error', async () => {
      rpcMock.mockResolvedValueOnce({ data: null, error: null });
      const result = await service.incrementDuelWins('u1', 'standard');
      expect(result).toBe(0);
    });
  });
});

// Jest doesn't have jasmine.objectContaining's semantics of "partial match" for
// structural equality — expect(obj).toEqual(partial) requires exact keys. When
// the caller only cares about a subset, use this helper to assert key subset.
function jasmine_like<T extends object>(partial: T): T {
  return expect.objectContaining(partial) as unknown as T;
}
