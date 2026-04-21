import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Upsert a device token. If the token already exists (different user logged
   * in on the same device), it is reassigned to the new user.
   */
  async registerToken(userId: string, token: string, platform: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('device_tokens')
      .upsert(
        { user_id: userId, token, platform, updated_at: new Date().toISOString() },
        { onConflict: 'token' },
      );

    if (error) {
      this.logger.error(`Failed to register token: ${error.message}`);
      throw error;
    }
  }

  /** Remove a specific device token (called on logout). */
  async unregisterToken(userId: string, token: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('device_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);

    if (error) {
      this.logger.error(`Failed to unregister token: ${error.message}`);
    }
  }

  /** Get all tokens for a user (for sending push notifications). */
  async getTokensForUser(userId: string): Promise<{ token: string; platform: string }[]> {
    const { data, error } = await this.supabaseService.client
      .from('device_tokens')
      .select('token, platform')
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Failed to get tokens: ${error.message}`);
      return [];
    }

    return (data ?? []) as { token: string; platform: string }[];
  }
}
