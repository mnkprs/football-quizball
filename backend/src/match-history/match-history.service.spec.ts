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
    it('uses limit 10 when a non-pro user views their own history', async () => {
      const userId = 'u1';
      supabase.getProStatus = jest.fn().mockResolvedValue({ is_pro: false });
      supabase.getMatchHistory = jest.fn().mockResolvedValue([]);
      await service.getHistory(userId, userId);
      expect(supabase.getMatchHistory).toHaveBeenCalledWith(userId, 10);
    });

    it('uses limit 100 when a pro user views their own history', async () => {
      const userId = 'u1';
      supabase.getProStatus = jest.fn().mockResolvedValue({ is_pro: true });
      supabase.getMatchHistory = jest.fn().mockResolvedValue([]);
      await service.getHistory(userId, userId);
      expect(supabase.getMatchHistory).toHaveBeenCalledWith(userId, 100);
    });

    it('uses limit 10 when a pro user views another user\u2019s history', async () => {
      supabase.getProStatus = jest.fn().mockResolvedValue({ is_pro: true });
      supabase.getMatchHistory = jest.fn().mockResolvedValue([]);
      await service.getHistory('u2', 'u1');
      expect(supabase.getMatchHistory).toHaveBeenCalledWith('u2', 10);
      expect(supabase.getProStatus).not.toHaveBeenCalled();
    });
  });

  describe('getMatchDetail — pro gating', () => {
    const userId = 'u1';
    const matchId = 'm1';

    it('keeps questions for pro users and sets flags', async () => {
      supabase.getMatchById = jest.fn().mockResolvedValue({
        id: matchId,
        player1_id: userId,
        player2_id: null,
        match_mode: 'duel',
        game_ref_id: 'g1',
        game_ref_type: 'duel',
        detail_snapshot: {
          duel_questions: [{ index: 0, winner: 'host', question_text: 'Q', correct_answer: 'A' }],
        },
      });
      supabase.getProStatus = jest.fn().mockResolvedValue({ is_pro: true });

      const detail = await service.getMatchDetail(matchId, userId);
      expect(detail.questionsAvailable).toBe(true);
      expect(detail.questionsLocked).toBe(false);
      expect(detail.duel_questions?.length).toBe(1);
    });

    it('strips questions for non-pro users and sets questionsLocked', async () => {
      supabase.getMatchById = jest.fn().mockResolvedValue({
        id: matchId,
        player1_id: userId,
        player2_id: null,
        match_mode: 'duel',
        game_ref_id: 'g1',
        game_ref_type: 'duel',
        detail_snapshot: {
          duel_questions: [{ index: 0, winner: 'host', question_text: 'Q', correct_answer: 'A' }],
        },
      });
      supabase.getProStatus = jest.fn().mockResolvedValue({ is_pro: false });

      const detail = await service.getMatchDetail(matchId, userId);
      expect(detail.questionsAvailable).toBe(true);
      expect(detail.questionsLocked).toBe(true);
      expect((detail as any).duel_questions).toBeUndefined();
      expect((detail as any).br_questions).toBeUndefined();
      expect((detail as any).question_results).toBeUndefined();
      // Regression guard: the nested snapshot must also be stripped so free
      // clients cannot read questions from detail.detail_snapshot.*_questions.
      expect((detail as any).detail_snapshot).toBeUndefined();
    });

    it('strips question_text / correct_answer / given_answer from detail.board for non-pro users', async () => {
      supabase.getMatchById = jest.fn().mockResolvedValue({
        id: matchId,
        player1_id: userId,
        player2_id: null,
        match_mode: 'local',
        game_ref_id: 'g1',
        game_ref_type: 'local',
        detail_snapshot: {
          players: [
            { name: 'A', score: 5, lifelineUsed: false, doubleUsed: false },
            { name: 'B', score: 3, lifelineUsed: false, doubleUsed: false },
          ],
          board: [[
            {
              category: 'HISTORY',
              difficulty: 'easy',
              points: 2,
              answered_by: 'A',
              question_text: 'Leaked?',
              correct_answer: 'secret',
              given_answer: 'wrong',
            },
          ]],
        },
      });
      supabase.getProStatus = jest.fn().mockResolvedValue({ is_pro: false });

      const detail = await service.getMatchDetail(matchId, userId);
      expect(detail.questionsLocked).toBe(true);
      const cell = detail.board?.[0]?.[0] as Record<string, unknown>;
      expect(cell?.category).toBe('HISTORY');
      expect(cell?.question_text).toBeUndefined();
      expect(cell?.correct_answer).toBeUndefined();
      expect(cell?.given_answer).toBeUndefined();
    });

    it('sets questionsAvailable=false when snapshot is missing and no game_ref', async () => {
      supabase.getMatchById = jest.fn().mockResolvedValue({
        id: matchId,
        player1_id: userId,
        player2_id: null,
        match_mode: 'duel',
        game_ref_id: null,
        game_ref_type: null,
        detail_snapshot: null,
      });
      supabase.getProStatus = jest.fn().mockResolvedValue({ is_pro: true });

      const detail = await service.getMatchDetail(matchId, userId);
      expect(detail.questionsAvailable).toBe(false);
    });

    it('enriches duel question_results with image_url for logo duels', async () => {
      supabase.getMatchById = jest.fn().mockResolvedValue({
        id: matchId,
        player1_id: userId,
        player2_id: null,
        match_mode: 'duel',
        game_ref_id: 'g1',
        game_ref_type: 'duel',
        detail_snapshot: null,
      });
      supabase.getDuelGameById = jest.fn().mockResolvedValue({
        id: 'g1',
        game_type: 'logo',
        question_results: [
          { index: 0, winner: 'host', question_text: 'Identify this club', correct_answer: 'Arsenal' },
          { index: 1, winner: 'guest', question_text: 'Identify this club', correct_answer: 'Chelsea' },
        ],
        questions: [
          { image_url: 'https://cdn/arsenal-obscured.png' },
          { image_url: 'https://cdn/chelsea-obscured.png' },
        ],
      });
      supabase.getProStatus = jest.fn().mockResolvedValue({ is_pro: true });

      const detail = await service.getMatchDetail(matchId, userId);
      expect(detail.question_results?.[0]?.image_url).toBe('https://cdn/arsenal-obscured.png');
      expect(detail.question_results?.[1]?.image_url).toBe('https://cdn/chelsea-obscured.png');
    });

    it('leaves question_results unchanged for standard (non-logo) duels', async () => {
      supabase.getMatchById = jest.fn().mockResolvedValue({
        id: matchId,
        player1_id: userId,
        player2_id: null,
        match_mode: 'duel',
        game_ref_id: 'g1',
        game_ref_type: 'duel',
        detail_snapshot: null,
      });
      supabase.getDuelGameById = jest.fn().mockResolvedValue({
        id: 'g1',
        game_type: 'standard',
        question_results: [
          { index: 0, winner: 'host', question_text: 'Who scored?', correct_answer: 'Messi' },
        ],
        questions: [
          // Standard duels may still carry question objects, but they have no image_url
          // and the enrichment path must leave results untouched.
          { category: 'HISTORY', difficulty: 'medium' },
        ],
      });
      supabase.getProStatus = jest.fn().mockResolvedValue({ is_pro: true });

      const detail = await service.getMatchDetail(matchId, userId);
      expect(detail.question_results?.[0]?.image_url).toBeUndefined();
    });

    it('strips image_url for non-pro users along with the rest of question_results', async () => {
      supabase.getMatchById = jest.fn().mockResolvedValue({
        id: matchId,
        player1_id: userId,
        player2_id: null,
        match_mode: 'duel',
        game_ref_id: 'g1',
        game_ref_type: 'duel',
        detail_snapshot: null,
      });
      supabase.getDuelGameById = jest.fn().mockResolvedValue({
        id: 'g1',
        game_type: 'logo',
        question_results: [
          { index: 0, winner: 'host', question_text: 'Identify this club', correct_answer: 'Arsenal' },
        ],
        questions: [{ image_url: 'https://cdn/arsenal-obscured.png' }],
      });
      supabase.getProStatus = jest.fn().mockResolvedValue({ is_pro: false });

      const detail = await service.getMatchDetail(matchId, userId);
      // question_results deleted entirely for non-pro — image_url implicitly gone.
      expect((detail as unknown as { question_results?: unknown }).question_results).toBeUndefined();
    });
  });
});
