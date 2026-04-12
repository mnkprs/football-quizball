import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { XP_VALUES, getStreakBonus } from './xp.constants';

export interface XpAwardResult {
  xp_gained: number;
  total_xp: number;
  level: number;
  leveled_up: boolean;
}

@Injectable()
export class XpService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Award XP to a user. Returns the result including level-up info. */
  async award(
    userId: string,
    source: string,
    amount: number,
    metadata?: Record<string, unknown>,
  ): Promise<XpAwardResult> {
    const client = this.supabase.getServiceClient();
    const { data, error } = await client.rpc('award_xp', {
      p_user_id: userId,
      p_amount: amount,
      p_source: source,
      p_metadata: metadata ?? {},
    });

    if (error || !data) {
      // Fail silently — XP is non-critical, don't break game flow
      return { xp_gained: 0, total_xp: 0, level: 1, leveled_up: false };
    }

    return {
      xp_gained: data.xp_gained,
      total_xp: data.total_xp,
      level: data.level,
      leveled_up: data.leveled_up,
    };
  }

  /** Award XP for a correct/wrong answer. Returns the result. */
  async awardForAnswer(userId: string, correct: boolean, mode: string): Promise<XpAwardResult> {
    const amount = correct ? XP_VALUES.CORRECT_ANSWER : XP_VALUES.WRONG_ANSWER;
    return this.award(userId, correct ? 'correct_answer' : 'wrong_answer', amount, { mode });
  }

  /** Award streak bonus XP if the streak is >= 3. Returns null if no bonus. */
  async awardStreakBonus(
    userId: string,
    currentStreak: number,
    mode: string,
  ): Promise<XpAwardResult | null> {
    const bonus = getStreakBonus(currentStreak);
    if (bonus === 0) return null;
    return this.award(userId, 'streak_bonus', bonus, { streak: currentStreak, mode });
  }
}
