import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import type { Profile, ProStatus, SetProParams } from '../common/interfaces/profile.interface';

@Injectable()
export class ProfileRepository {
  private readonly logger = new Logger(ProfileRepository.name);

  constructor(
    @Inject(forwardRef(() => SupabaseService))
    private supabaseService: SupabaseService,
  ) {}

  private get client() {
    return this.supabaseService.client;
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data: profile } = await this.client
      .from('profiles')
      .select('id, username, elo, logo_quiz_elo, logo_quiz_hardcore_elo, logo_quiz_games_played, logo_quiz_hardcore_games_played, games_played, questions_answered, correct_answers, country_code')
      .eq('id', userId)
      .maybeSingle();
    if (profile) return profile as Profile;
    const { data: dummy } = await this.client
      .from('dummy_users')
      .select('id, username, elo, games_played, questions_answered, correct_answers')
      .eq('id', userId)
      .maybeSingle();
    if (!dummy) return null;
    const d = dummy as { id: string; username: string; elo: number; games_played: number; questions_answered: number; correct_answers: number };
    return {
      ...d,
      logo_quiz_elo: 1000,
      logo_quiz_hardcore_elo: 1000,
      logo_quiz_games_played: 0,
      logo_quiz_hardcore_games_played: 0,
      country_code: null,
      max_correct_streak: 0,
      logo_quiz_correct: 0,
      duel_wins: 0,
      br_wins: 0,
      last_active_date: null,
      current_daily_streak: 0,
      total_questions_all_modes: 0,
      modes_played: [],
    };
  }

  async getProStatus(userId: string): Promise<ProStatus | null> {
    const { data } = await this.client
      .from('profiles')
      .select('is_pro, trial_battle_royale_used, purchase_type, pro_lifetime_owned, subscription_expires_at, daily_duels_played, daily_duels_reset_at')
      .eq('id', userId)
      .maybeSingle();
    return data ?? null;
  }

  async setProStatus(userId: string, params: SetProParams): Promise<void> {
    const update: Record<string, unknown> = { is_pro: params.isPro };

    if (params.proSource !== undefined) {
      update['purchase_type'] = params.proSource;
    }
    if (params.proExpiresAt !== undefined) {
      update['subscription_expires_at'] = params.proExpiresAt;
    }
    if (params.iapPlatform !== undefined) {
      update['iap_platform'] = params.iapPlatform;
    }
    if (params.iapOriginalTransactionId !== undefined) {
      update['iap_original_transaction_id'] = params.iapOriginalTransactionId;
    }

    // Lifetime-wins rule: if setting proLifetimeOwned to true, always set purchase_type to 'lifetime'
    if (params.proLifetimeOwned === true) {
      update['pro_lifetime_owned'] = true;
      update['purchase_type'] = 'lifetime';
      update['is_pro'] = true; // Lifetime always means pro
      update['pro_purchased_at'] = new Date().toISOString();
    } else if (params.proLifetimeOwned === false) {
      update['pro_lifetime_owned'] = false;
    }

    await this.client.from('profiles').update(update).eq('id', userId);
  }

  /**
   * Atomically increments games_played, questions_answered, correct_answers via DB function.
   */
  async incrementGamesPlayed(userId: string, questionsAnswered: number, correctAnswers: number): Promise<void> {
    const { error } = await this.client.rpc('increment_stats', {
      p_user_id: userId,
      p_questions: questionsAnswered,
      p_correct: correctAnswers,
    });
    if (error) {
      // Fallback to read-modify-write if RPC not yet created
      const { data: profile } = await this.client
        .from('profiles')
        .select('games_played, questions_answered, correct_answers')
        .eq('id', userId)
        .single();
      if (!profile) return;
      await this.client.from('profiles').update({
        games_played: profile.games_played + 1,
        questions_answered: profile.questions_answered + questionsAnswered,
        correct_answers: profile.correct_answers + correctAnswers,
      }).eq('id', userId);
    }
  }

  /**
   * Increment only questions_answered and correct_answers on the profile (no games_played bump).
   * Used by modes that track questions individually (logo quiz, duel, battle royale, etc.).
   */
  async incrementQuestionStats(userId: string, correctAnswers: number, questionsAnswered = 1): Promise<void> {
    const { error } = await this.client.rpc('increment_question_stats', {
      p_user_id: userId,
      p_questions: questionsAnswered,
      p_correct: correctAnswers,
    });
    if (error) {
      const { data: profile } = await this.client
        .from('profiles')
        .select('questions_answered, correct_answers')
        .eq('id', userId)
        .single();
      if (!profile) return;
      await this.client.from('profiles').update({
        questions_answered: profile.questions_answered + questionsAnswered,
        correct_answers: profile.correct_answers + correctAnswers,
      }).eq('id', userId);
    }
  }

  async updateUsername(userId: string, username: string): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ username, username_set: true })
      .eq('id', userId);
    if (error) throw error;
  }

  async updateCountryCode(userId: string, countryCode: string): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ country_code: countryCode })
      .eq('id', userId);
    if (error) throw error;
  }

  /** Returns true if the given UUID belongs to a dummy_user (bot) rather than a real profile. */
  async isDummyUser(userId: string): Promise<boolean> {
    const { data } = await this.client
      .from('dummy_users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    return !!data;
  }

  /** Increment stats on a dummy_user (bot) after a game. */
  async updateDummyUserStats(botId: string, questionsAnswered: number, correctAnswers: number): Promise<void> {
    const { error } = await this.client.rpc('increment_dummy_user_stats', {
      p_id: botId,
      p_questions: questionsAnswered,
      p_correct: correctAnswers,
    });
    if (error) this.logger.warn(`[updateDummyUserStats] ${error.message}`);
  }

  async deleteUser(userId: string): Promise<void> {
    // Delete avatar from storage if any files exist under the user's prefix
    const { data: avatarFiles } = await this.client.storage
      .from('avatars')
      .list(userId);
    if (avatarFiles?.length) {
      await this.client.storage
        .from('avatars')
        .remove(avatarFiles.map((f) => `${userId}/${f.name}`));
    }

    // Delete the auth user — cascades to profiles and all FK-linked tables
    const { error } = await this.client.auth.admin.deleteUser(userId);
    if (error) throw new Error(`Failed to delete user: ${error.message}`);
  }

  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    const [profile, eloHistory, achievements, matchHistory, modeStats, blitzStats] =
      await Promise.all([
        this.client.from('profiles').select('*').eq('id', userId).single(),
        this.client
          .from('elo_history')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        this.client.from('user_achievements').select('*').eq('user_id', userId),
        this.client
          .from('match_history')
          .select('*')
          .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
          .order('played_at', { ascending: false }),
        this.client.from('user_mode_stats').select('*').eq('user_id', userId),
        this.client.from('blitz_scores').select('*').eq('user_id', userId),
      ]);

    return {
      exported_at: new Date().toISOString(),
      profile: profile.data,
      elo_history: eloHistory.data ?? [],
      achievements: achievements.data ?? [],
      match_history: matchHistory.data ?? [],
      mode_stats: modeStats.data ?? [],
      blitz_scores: blitzStats.data ?? [],
    };
  }

  /**
   * Atomically increments the daily duel counter (auto-resets at midnight UTC).
   * Returns the new count after increment.
   */
  async incrementDailyDuel(userId: string): Promise<number> {
    const { data, error } = await this.client.rpc('increment_daily_duel', { p_user_id: userId });
    if (error) {
      this.logger.error(`incrementDailyDuel RPC failed: ${error.message}`);
      // Fallback: return a high number to be safe (deny rather than allow on error)
      return 999;
    }
    return data as number;
  }

  /**
   * Returns how many daily duels the user has remaining (out of 1).
   * Auto-resets if the stored reset date is before today.
   */
  async getDailyDuelsRemaining(userId: string): Promise<number> {
    const { data } = await this.client
      .from('profiles')
      .select('daily_duels_played, daily_duels_reset_at, is_pro')
      .eq('id', userId)
      .maybeSingle();

    if (!data) return 1;
    if (data.is_pro) return -1; // -1 signals unlimited for pro users

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const resetAt = data.daily_duels_reset_at as string | null;

    // If reset date is before today, counter is effectively 0
    if (!resetAt || resetAt < today) return 1;

    return Math.max(0, 1 - (data.daily_duels_played ?? 0));
  }

  async incrementBattleRoyaleTrial(userId: string): Promise<void> {
    await this.client.rpc('increment_trial_battle_royale', { p_user_id: userId });
  }

  /** Returns question IDs the user has seen (60-day window maintained by cleanup cron). */
  async getSeenQuestionIds(userId: string): Promise<string[]> {
    const { data } = await this.client
      .from('user_question_history')
      .select('question_id')
      .eq('user_id', userId);
    return (data ?? []).map((r: { question_id: string }) => r.question_id);
  }

  /** Records that a user has seen a question (fire-and-forget safe). */
  async recordSeenQuestion(userId: string, questionId: string): Promise<void> {
    await this.client
      .from('user_question_history')
      .upsert({ user_id: userId, question_id: questionId, seen_at: new Date().toISOString() }, { onConflict: 'user_id,question_id' });
  }
}
