import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationsApiService } from '../../core/notifications-api.service';
import type { AppNotification, NotificationGroup } from '../../models/notification.model';

@Component({
  selector: 'app-notifications',
  standalone: true,
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly notificationsApi = inject(NotificationsApiService);

  readonly groups = signal<NotificationGroup[]>([]);
  readonly loading = signal(true);
  readonly empty = signal(false);
  readonly error = signal(false);
  private busy = false;

  async ngOnInit() {
    await this.loadNotifications();
  }

  private async loadNotifications() {
    this.loading.set(true);
    this.error.set(false);
    try {
      const all = await this.notificationsApi.fetchNotifications();
      this.groups.set(this.notificationsApi.groupByTime(all));
      this.empty.set(all.length === 0);
    } catch {
      this.error.set(true);
    }
    this.loading.set(false);
  }

  async retry() {
    await this.loadNotifications();
  }

  async onTapNotification(notification: AppNotification) {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.notificationsApi.markAsRead(notification);
      this.groups.update((groups) =>
        groups.map((g) => ({
          ...g,
          notifications: g.notifications.map((n) =>
            n.id === notification.id ? { ...n, read: true } : n,
          ),
        })),
      );
      this.router.navigateByUrl(notification.route);
    } finally {
      this.busy = false;
    }
  }

  async markAllRead() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.notificationsApi.markAllAsRead();
      await this.loadNotifications();
    } finally {
      this.busy = false;
    }
  }

  goBack() {
    this.router.navigate(['/']);
  }

  relativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }
}
