import { Test, TestingModule } from '@nestjs/testing';
import { AchievementsService, getEloTier, AchievementContext } from './achievements.service';
import { SupabaseService } from '../supabase/supabase.service';

function buildMockSupabase(alreadyEarned: Set<string> = new Set()) {
  return {
    getUserAchievementIds: jest.fn().mockResolvedValue(alreadyEarned),
    awardAchievement: jest.fn().mockResolvedValue(undefined),
  };
}

describe('getEloTier', () => {
  it.each([
    [500, 'iron', '#6b7280', 'Iron'],
    [600, 'iron', '#6b7280', 'Iron'],
    [749, 'iron', '#6b7280', 'Iron'],
    [750, 'bronze', '#b45309', 'Bronze'],
    [900, 'bronze', '#b45309', 'Bronze'],
    [999, 'bronze', '#b45309', 'Bronze'],
    [1000, 'silver', '#94a3b8', 'Silver'],
    [1100, 'silver', '#94a3b8', 'Silver'],
    [1299, 'silver', '#94a3b8', 'Silver'],
    [1300, 'gold', '#f59e0b', 'Gold'],
    [1500, 'gold', '#f59e0b', 'Gold'],
    [1649, 'gold', '#f59e0b', 'Gold'],
    [1650, 'platinum', '#06b6d4', 'Platinum'],
    [1800, 'platinum', '#06b6d4', 'Platinum'],
    [1999, 'platinum', '#06b6d4', 'Platinum'],
    [2000, 'diamond', '#a855f7', 'Diamond'],
    [2200, 'diamond', '#a855f7', 'Diamond'],
    [2399, 'diamond', '#a855f7', 'Diamond'],
    [2400, 'challenger', '#e8ff7a', 'Challenger'],
    [3000, 'challenger', '#e8ff7a', 'Challenger'],
  ])(
    'elo=%i → tier=%s, color=%s, label=%s',
    (elo, expectedTier, expectedColor, expectedLabel) => {
      const result = getEloTier(elo);
      expect(result).toEqual({
        tier: expectedTier,
        color: expectedColor,
        label: expectedLabel,
      });
    },
  );

  it('returns iron for values below 500', () => {
    expect(getEloTier(0)).toEqual({ tier: 'iron', color: '#6b7280', label: 'Iron' });
    expect(getEloTier(499)).toEqual({ tier: 'iron', color: '#6b7280', label: 'Iron' });
  });
});

describe('AchievementsService', () => {
  let service: AchievementsService;
  let mockSupabase: ReturnType<typeof buildMockSupabase>;

  beforeEach(async () => {
    mockSupabase = buildMockSupabase();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementsService,
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    }).compile();

    service = module.get<AchievementsService>(AchievementsService);
  });

  describe('checkAndAward — solo game achievements', () => {
    it('awards first_solo_win when soloGamesPlayed >= 1', async () => {
      const awarded = await service.checkAndAward('user-1', { soloGamesPlayed: 1 });
      expect(awarded).toContain('first_solo_win');
    });

    it('awards solo_10_games when soloGamesPlayed >= 10', async () => {
      const awarded = await service.checkAndAward('user-1', { soloGamesPlayed: 10 });
      expect(awarded).toContain('first_solo_win');
      expect(awarded).toContain('solo_10_games');
    });

    it('awards solo_50_games when soloGamesPlayed >= 50', async () => {
      const awarded = await service.checkAndAward('user-1', { soloGamesPlayed: 50 });
      expect(awarded).toContain('solo_50_games');
    });

    it('awards solo_100_games when soloGamesPlayed >= 100', async () => {
      const awarded = await service.checkAndAward('user-1', { soloGamesPlayed: 100 });
      expect(awarded).toContain('solo_100_games');
    });

    it('awards solo_500_games when soloGamesPlayed >= 500', async () => {
      const awarded = await service.checkAndAward('user-1', { soloGamesPlayed: 500 });
      expect(awarded).toContain('solo_500_games');
    });

    it('does not award solo_10_games when soloGamesPlayed < 10', async () => {
      const awarded = await service.checkAndAward('user-1', { soloGamesPlayed: 9 });
      expect(awarded).not.toContain('solo_10_games');
    });
  });

  describe('checkAndAward — already earned skipping', () => {
    it('does not re-award achievements the user already has', async () => {
      mockSupabase.getUserAchievementIds.mockResolvedValue(
        new Set(['first_solo_win', 'solo_10_games']),
      );

      const awarded = await service.checkAndAward('user-1', { soloGamesPlayed: 50 });

      expect(awarded).not.toContain('first_solo_win');
      expect(awarded).not.toContain('solo_10_games');
      expect(awarded).toContain('solo_50_games');
    });
  });

  describe('checkAndAward — ELO tier achievements', () => {
    it('awards all ELO thresholds at or below currentElo=1300', async () => {
      const awarded = await service.checkAndAward('user-1', { currentElo: 1300 });

      expect(awarded).toContain('elo_750');
      expect(awarded).toContain('elo_1000');
      expect(awarded).toContain('elo_1200');
      expect(awarded).toContain('elo_1300');
    });

    it('does not award ELO thresholds above currentElo=1300', async () => {
      const awarded = await service.checkAndAward('user-1', { currentElo: 1300 });

      expect(awarded).not.toContain('elo_1400');
      expect(awarded).not.toContain('elo_1600');
      expect(awarded).not.toContain('elo_1650');
      expect(awarded).not.toContain('elo_1800');
      expect(awarded).not.toContain('elo_2000');
      expect(awarded).not.toContain('elo_2400');
    });
  });

  describe('checkAndAward — streak logic', () => {
    it('uses maxCorrectStreak over currentStreak when both are provided', async () => {
      const awarded = await service.checkAndAward('user-1', {
        maxCorrectStreak: 10,
        currentStreak: 3,
      });

      expect(awarded).toContain('streak_3');
      expect(awarded).toContain('streak_10');
      expect(awarded).not.toContain('streak_25');
    });

    it('falls back to currentStreak when maxCorrectStreak is undefined', async () => {
      const awarded = await service.checkAndAward('user-1', {
        currentStreak: 5,
      });

      expect(awarded).toContain('streak_3');
      expect(awarded).not.toContain('streak_10');
    });

    it('awards streak_3 and streak_10 but not streak_25 for streak=10', async () => {
      const awarded = await service.checkAndAward('user-1', {
        maxCorrectStreak: 10,
      });

      expect(awarded).toContain('streak_3');
      expect(awarded).toContain('streak_10');
      expect(awarded).not.toContain('streak_25');
    });
  });

  describe('checkAndAward — empty context', () => {
    it('awards nothing when context is empty', async () => {
      const awarded = await service.checkAndAward('user-1', {});

      expect(awarded).toEqual([]);
    });

    it('does not call awardAchievement when nothing is awarded', async () => {
      await service.checkAndAward('user-1', {});

      expect(mockSupabase.awardAchievement).not.toHaveBeenCalled();
    });
  });

  describe('checkAndAward — calls awardAchievement for each new achievement', () => {
    it('calls awardAchievement once per newly awarded achievement', async () => {
      const awarded = await service.checkAndAward('user-1', {
        soloGamesPlayed: 10,
        currentElo: 750,
      });

      expect(mockSupabase.awardAchievement).toHaveBeenCalledTimes(awarded.length);

      for (const id of awarded) {
        expect(mockSupabase.awardAchievement).toHaveBeenCalledWith('user-1', id);
      }
    });

    it('calls awardAchievement with correct userId and achievement id', async () => {
      await service.checkAndAward('user-42', { soloGamesPlayed: 1 });

      expect(mockSupabase.awardAchievement).toHaveBeenCalledWith(
        'user-42',
        'first_solo_win',
      );
    });
  });
});
