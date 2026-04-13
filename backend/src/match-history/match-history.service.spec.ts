import { Test, TestingModule } from '@nestjs/testing';
import { MatchHistoryService } from './match-history.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AchievementsService } from '../achievements/achievements.service';
import { CacheService } from '../cache/cache.service';

function buildMockSupabase() {
  return {
    getProfile: jest.fn().mockResolvedValue(null),
    getProStatus: jest.fn().mockResolvedValue(null),
    getMatchHistory: jest.fn().mockResolvedValue([]),
    saveMatchResult: jest.fn().mockResolvedValue(true),
    getMatchWinCount: jest.fn().mockResolvedValue(0),
    updateDailyStreak: jest.fn().mockResolvedValue({ current_daily_streak: 0 }),
    getMatchById: jest.fn().mockResolvedValue(null),
    getDuelGameById: jest.fn().mockResolvedValue(null),
    getOnlineGameById: jest.fn().mockResolvedValue(null),
    getBRRoomWithPlayers: jest.fn().mockResolvedValue({ room: null, players: [] }),
  };
}

function buildMockAchievements() {
  return {
    checkAndAward: jest.fn().mockResolvedValue([]),
  };
}

function buildMockCache() {
  return {
    get: jest.fn().mockResolvedValue(null),
  };
}

describe('MatchHistoryService', () => {
  let service: MatchHistoryService;
  let supabase: ReturnType<typeof buildMockSupabase>;

  beforeEach(async () => {
    supabase = buildMockSupabase();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchHistoryService,
        { provide: SupabaseService, useValue: supabase },
        { provide: AchievementsService, useValue: buildMockAchievements() },
        { provide: CacheService, useValue: buildMockCache() },
      ],
    }).compile();

    service = module.get<MatchHistoryService>(MatchHistoryService);
  });

  describe('getHistory — pro gating', () => {
    it('uses limit 10 for non-pro users', async () => {
      const userId = 'u1';
      supabase.getProStatus = jest.fn().mockResolvedValue({ is_pro: false });
      supabase.getMatchHistory = jest.fn().mockResolvedValue([]);
      await service.getHistory(userId);
      expect(supabase.getMatchHistory).toHaveBeenCalledWith(userId, 10);
    });

    it('uses limit 100 for pro users', async () => {
      const userId = 'u1';
      supabase.getProStatus = jest.fn().mockResolvedValue({ is_pro: true });
      supabase.getMatchHistory = jest.fn().mockResolvedValue([]);
      await service.getHistory(userId);
      expect(supabase.getMatchHistory).toHaveBeenCalledWith(userId, 100);
    });
  });
});
