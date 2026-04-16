import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, catchError, of } from 'rxjs';
import { AuthService } from './auth.service';
import { NewsApiService } from './news-api.service';
import { DailyApiService } from './daily-api.service';
import { environment } from '../../environments/environment';
import type { AppNotification, NotificationGroup } from '../models/notification.model';

const ONE_DAY_MS = 86_400_000;

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly newsApi = inject(NewsApiService);
  private readonly dailyApi = inject(DailyApiService);
  private readonly base = `${environment.apiUrl}/api/notifications`;

  readonly unreadCount = signal(0);

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  async fetchNotifications(): Promise<AppNotification[]> {
    const [backendNotifs, frontendNotifs] = await Promise.all([
      this.fetchBackendNotifications(),
      this.buildFrontendNotifications(),
    ]);

    const merged = [...backendNotifs, ...frontendNotifs];
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return merged;
  }

  private async fetchBackendNotifications(): Promise<AppNotification[]> {
    try {
      const rows = await firstValueFrom(
        this.http.get<any[]>(this.base, { headers: this.headers() }).pipe(
          catchError(() => of([])),
        ),
      );
      return (rows ?? []).map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        icon: r.icon ?? '',
        route: r.route ?? '/',
        read: r.read,
        createdAt: r.created_at,
        source: 'backend' as const,
      }));
    } catch {
      return [];
    }
  }

  private async buildFrontendNotifications(): Promise<AppNotification[]> {
    const notifs: AppNotification[] = [];

    try {
      const newsMeta = await firstValueFrom(
        this.newsApi.getMetadata().pipe(catchError(() => of(null))),
      );
      if (newsMeta && newsMeta.questions_remaining > 0) {
        const dismissedKey = localStorage.getItem('qb_notif_news_dismissed');
        const isRead = dismissedKey === newsMeta.expires_at;
        const publishedAt = newsMeta.round_created_at
          ?? (newsMeta.expires_at ? new Date(new Date(newsMeta.expires_at).getTime() - ONE_DAY_MS).toISOString() : new Date().toISOString());
        notifs.push({
          id: `frontend-news-${newsMeta.expires_at}`,
          type: 'new_news_round',
          title: 'New News questions!',
          body: `${newsMeta.questions_remaining} questions — play now`,
          icon: '📰',
          route: '/news',
          read: isRead,
          createdAt: publishedAt,
          source: 'frontend',
        });
      }
    } catch { /* ignore */ }

    try {
      const dailyMeta = await firstValueFrom(
        this.dailyApi.getMetadata().pipe(catchError(() => of(null))),
      );
      if (dailyMeta && dailyMeta.count > 0) {
        const dismissedKey = localStorage.getItem('qb_notif_daily_dismissed');
        const isRead = dismissedKey === dailyMeta.resetsAt;
        const publishedAt = dailyMeta.publishedAt
          ?? new Date(new Date(dailyMeta.resetsAt).getTime() - ONE_DAY_MS).toISOString();
        notifs.push({
          id: `frontend-daily-${dailyMeta.resetsAt}`,
          type: 'new_daily_round',
          title: 'New Today in Football questions!',
          body: 'New Today in Football questions available',
          icon: '📅',
          route: '/daily',
          read: isRead,
          createdAt: publishedAt,
          source: 'frontend',
        });
      }
    } catch { /* ignore */ }

    return notifs;
  }

  async markAsRead(notification: AppNotification): Promise<void> {
    if (notification.source === 'backend') {
      await firstValueFrom(
        this.http.patch(`${this.base}/${notification.id}/read`, {}, { headers: this.headers() }).pipe(
          catchError(() => of(null)),
        ),
      );
    } else if (notification.type === 'new_news_round') {
      const batchKey = notification.id.replace('frontend-news-', '');
      localStorage.setItem('qb_notif_news_dismissed', batchKey);
    } else if (notification.type === 'new_daily_round') {
      const batchKey = notification.id.replace('frontend-daily-', '');
      localStorage.setItem('qb_notif_daily_dismissed', batchKey);
    }

    this.unreadCount.update((c) => Math.max(0, c - 1));
  }

  async markAllAsRead(): Promise<void> {
    await firstValueFrom(
      this.http.patch(`${this.base}/read-all`, {}, { headers: this.headers() }).pipe(
        catchError(() => of(null)),
      ),
    );

    try {
      const newsMeta = await firstValueFrom(this.newsApi.getMetadata().pipe(catchError(() => of(null))));
      if (newsMeta) localStorage.setItem('qb_notif_news_dismissed', newsMeta.expires_at ?? '');
    } catch { /* ignore */ }
    try {
      const dailyMeta = await firstValueFrom(this.dailyApi.getMetadata().pipe(catchError(() => of(null))));
      if (dailyMeta) localStorage.setItem('qb_notif_daily_dismissed', dailyMeta.resetsAt);
    } catch { /* ignore */ }

    this.unreadCount.set(0);
  }

  async refreshUnreadCount(): Promise<void> {
    if (!this.auth.accessToken()) {
      this.unreadCount.set(0);
      return;
    }

    try {
      const [backendResult, frontendNotifs] = await Promise.all([
        firstValueFrom(
          this.http.get<{ count: number }>(`${this.base}/unread-count`, { headers: this.headers() }).pipe(
            catchError(() => of({ count: 0 })),
          ),
        ),
        this.buildFrontendNotifications(),
      ]);

      const frontendUnread = frontendNotifs.filter((n) => !n.read).length;
      this.unreadCount.set((backendResult?.count ?? 0) + frontendUnread);
    } catch {
      this.unreadCount.set(0);
    }
  }

  groupByTime(notifications: AppNotification[]): NotificationGroup[] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    const groups: Record<string, AppNotification[]> = {
      Today: [],
      Yesterday: [],
      'Earlier this week': [],
      Older: [],
    };

    for (const n of notifications) {
      const d = new Date(n.createdAt);
      if (d >= today) groups['Today'].push(n);
      else if (d >= yesterday) groups['Yesterday'].push(n);
      else if (d >= weekAgo) groups['Earlier this week'].push(n);
      else groups['Older'].push(n);
    }

    return Object.entries(groups)
      .filter(([, notifs]) => notifs.length > 0)
      .map(([label, notifications]) => ({ label, notifications }));
  }
}
