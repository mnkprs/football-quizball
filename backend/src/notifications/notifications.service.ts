import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  icon: string | null;
  route: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async create(dto: CreateNotificationDto): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('notifications')
      .insert({
        user_id: dto.userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        icon: dto.icon ?? null,
        route: dto.route ?? null,
        metadata: dto.metadata ?? {},
      });

    if (error) {
      this.logger.error(`Failed to create notification: ${error.message}`);
    }
  }

  async getForUser(userId: string, limit = 50, offset = 0): Promise<NotificationRow[]> {
    const { data, error } = await this.supabaseService.client
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error(`Failed to fetch notifications: ${error.message}`);
      return [];
    }

    return (data ?? []) as NotificationRow[];
  }

  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Failed to mark notification as read: ${error.message}`);
    }
  }

  async markAllAsRead(userId: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      this.logger.error(`Failed to mark all as read: ${error.message}`);
    }
  }

  private static readonly CHALLENGE_TEMPLATES = [
    { title: 'Daily Challenge', body: 'Win 3 Solo games today', icon: '🎮', route: '/solo' },
    { title: 'Daily Challenge', body: 'Answer 10 questions correctly in Solo', icon: '🎮', route: '/solo' },
    { title: 'Daily Challenge', body: 'Play a Duel and win', icon: '⚔️', route: '/duel' },
    { title: 'Daily Challenge', body: 'Complete a Logo Quiz session', icon: '🏟️', route: '/logo-quiz' },
    { title: 'Daily Challenge', body: 'Reach a new ELO high in Solo', icon: '📈', route: '/solo' },
    { title: 'Daily Challenge', body: 'Play 3 different game modes today', icon: '🌟', route: '/' },
    { title: 'Daily Challenge', body: 'Win a Logo Duel', icon: '⚔️', route: '/duel?mode=logo' },
  ];

  @Cron('0 0 * * *') // midnight UTC daily
  async generateDailyChallenges(): Promise<void> {
    this.logger.log('[generateDailyChallenges] Starting daily challenge generation');

    try {
      // Get users active in the last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: activeUsers, error } = await this.supabaseService.client
        .from('profiles')
        .select('id')
        .gte('last_active_date', sevenDaysAgo.split('T')[0]);

      if (error || !activeUsers) {
        this.logger.error(`[generateDailyChallenges] Failed to fetch active users: ${error?.message}`);
        return;
      }

      // Pick today's challenge (rotate by day of year)
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
      const template = NotificationsService.CHALLENGE_TEMPLATES[dayOfYear % NotificationsService.CHALLENGE_TEMPLATES.length];

      this.logger.log(`[generateDailyChallenges] Sending "${template.body}" to ${activeUsers.length} users`);

      // Batch insert for efficiency
      const rows = activeUsers.map((u: { id: string }) => ({
        user_id: u.id,
        type: 'challenge_system',
        title: template.title,
        body: template.body,
        icon: template.icon,
        route: template.route,
        metadata: { dayOfYear },
      }));

      // Insert in batches of 100
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error: insertError } = await this.supabaseService.client
          .from('notifications')
          .insert(batch);

        if (insertError) {
          this.logger.error(`[generateDailyChallenges] Batch insert failed: ${insertError.message}`);
        }
      }

      this.logger.log(`[generateDailyChallenges] Done — ${activeUsers.length} notifications created`);
    } catch (err) {
      this.logger.error(`[generateDailyChallenges] Unexpected error: ${(err as Error)?.message}`);
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await this.supabaseService.client
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      this.logger.error(`Failed to get unread count: ${error.message}`);
      return 0;
    }

    return count ?? 0;
  }
}
