import { Injectable } from '@nestjs/common';
import { BotLogger } from './bot-logger';
import { SupabaseService } from '../supabase/supabase.service';

export interface BotProfile {
  id: string;
  username: string;
  elo: number;
  bot_skill: number;
}

export type BotGameMode = 'online' | 'duel' | 'battle-royale';

/** How many real seconds a bot waits before acting (simulates human reaction). */
const THINK_TIME_MS: Record<BotGameMode, { min: number; max: number }> = {
  online:          { min: 30_000,   max: 480_000  }, // 30s–8min (async turn-based)
  duel:            { min: 1_500,    max: 7_000    }, // 1.5–7s   (real-time race)
  'battle-royale': { min: 8_000,    max: 25_000   }, // 8–25s    (per MC question, nerfed to let humans win)
};

/** Difficulty multipliers for answer accuracy. */
const DIFFICULTY_MULTIPLIER: Record<string, number> = {
  EASY:   1.2,
  MEDIUM: 1.0,
  HARD:   0.8,
  EXPERT: 0.65,
};

/** Skill thresholds by player ELO — aligned to tier system. */
function targetSkillForElo(playerElo: number): number {
  if (playerElo < 750)  return 0.20;  // Iron
  if (playerElo < 1000) return 0.30;  // Bronze
  if (playerElo < 1300) return 0.40;  // Silver
  if (playerElo < 1650) return 0.50;  // Gold
  if (playerElo < 2000) return 0.60;  // Platinum
  return 0.70;                         // Diamond/Challenger
}

@Injectable()
export class BotService {
  private readonly logger = new BotLogger('Service');

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Pick a bot from dummy_users whose ELO is within ±400 of playerElo.
   * Returns null if no suitable bot is available.
   */
  async selectBot(playerElo: number): Promise<BotProfile | null> {
    const minElo = playerElo - 400;
    const maxElo = playerElo + 400;

    const { data, error } = await this.supabaseService.client
      .from('dummy_users')
      .select('id, username, elo, bot_skill')
      .eq('is_bot', true)
      .gte('elo', minElo)
      .lte('elo', maxElo)
      .limit(10);

    if (error || !data || data.length === 0) {
      // Fallback: pick any bot
      const { data: fallback } = await this.supabaseService.client
        .from('dummy_users')
        .select('id, username, elo, bot_skill')
        .eq('is_bot', true)
        .limit(5)
        .maybeSingle();
      return fallback as BotProfile | null;
    }

    const bots = data as BotProfile[];
    return bots[Math.floor(Math.random() * bots.length)];
  }

  /**
   * Pick multiple bots for a Battle Royale room, with varied ELO to create a
   * realistic leaderboard spread.
   */
  async selectBotsForRoom(count: number, avgPlayerElo: number): Promise<BotProfile[]> {
    const { data, error } = await this.supabaseService.client
      .from('dummy_users')
      .select('id, username, elo, bot_skill')
      .eq('is_bot', true)
      .limit(30);

    if (error || !data) return [];

    const bots = data as BotProfile[];
    // Sort by ELO proximity to avgPlayerElo but keep some variety
    bots.sort(() => Math.random() - 0.5);
    return bots.slice(0, count);
  }

  /** Skill level to assign when injecting a bot for a player of the given ELO. */
  getTargetSkill(playerElo: number): number {
    return targetSkillForElo(playerElo);
  }

  /**
   * Determine whether the bot should answer correctly for this question.
   * Difficulty modifies the bot's base skill probability.
   */
  shouldAnswerCorrectly(botSkill: number, difficulty = 'MEDIUM'): boolean {
    const multiplier = DIFFICULTY_MULTIPLIER[difficulty] ?? 1.0;
    const adjustedProb = Math.min(0.95, botSkill * multiplier);
    return Math.random() < adjustedProb;
  }

  /**
   * Return a random think-time in milliseconds for the given game mode,
   * simulating human reading and response behaviour.
   */
  simulateThinkTimeMs(mode: BotGameMode): number {
    const { min, max } = THINK_TIME_MS[mode];
    return Math.floor(Math.random() * (max - min) + min);
  }

  /** Update bot stats after participating in a game (fire-and-forget). */
  updateBotStats(botId: string, questionsAnswered: number, correctAnswers: number): void {
    void this.supabaseService.updateDummyUserStats(botId, questionsAnswered, correctAnswers).catch((err) => {
      this.logger.warn(`Stats update failed for bot ${botId}: ${err}`);
    });
  }
}
