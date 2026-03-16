import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class SessionStoreService {
  private readonly logger = new Logger(SessionStoreService.name);

  constructor(private supabaseService: SupabaseService) {}

  async get<T>(key: string): Promise<T | undefined> {
    const { data, error } = await this.supabaseService.client
      .from('game_sessions')
      .select('data, expires_at')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      this.logger.warn(`[SessionStore] get error for key "${key}": ${error.message}`);
      return undefined;
    }
    if (!data) return undefined;

    // Treat expired sessions as missing — they'll be overwritten on next set()
    if (new Date(data.expires_at) < new Date()) return undefined;

    return data.data as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const { error } = await this.supabaseService.client
      .from('game_sessions')
      .upsert({ key, data: value, expires_at: expiresAt }, { onConflict: 'key' });

    if (error) {
      this.logger.warn(`[SessionStore] set error for key "${key}": ${error.message}`);
    }
  }

  async del(key: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('game_sessions')
      .delete()
      .eq('key', key);

    if (error) {
      this.logger.warn(`[SessionStore] del error for key "${key}": ${error.message}`);
    }
  }
}
