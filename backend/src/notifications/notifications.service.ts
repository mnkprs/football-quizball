import { Injectable, Logger } from '@nestjs/common';
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
