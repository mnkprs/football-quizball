import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { catchError, of } from 'rxjs';
import { NewsApiService } from '../../core/news-api.service';
import { DailyApiService } from '../../core/daily-api.service';

interface BannerState {
  visible: boolean;
  batchKey: string; // ISO timestamp of the next batch — used as dismiss key
}

const LS_NEWS_DISMISS = 'qb_notif_news_dismissed';
const LS_DAILY_DISMISS = 'qb_notif_daily_dismissed';

@Component({
  selector: 'app-notification-banner',
  standalone: true,
  templateUrl: './notification-banner.html',
  styleUrl: './notification-banner.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBannerComponent implements OnInit {
  private router = inject(Router);
  private newsApi = inject(NewsApiService);
  private dailyApi = inject(DailyApiService);

  news = signal<BannerState>({ visible: false, batchKey: '' });
  daily = signal<BannerState>({ visible: false, batchKey: '' });

  hasAny = computed(() => this.news().visible || this.daily().visible);

  ngOnInit(): void {
    this.loadNewsState();
    this.loadDailyState();
  }

  private async loadNewsState(): Promise<void> {
    try {
      const meta = await firstValueFrom(
        this.newsApi.getMetadata().pipe(catchError(() => of(null))),
      );
      if (!meta || meta.count === 0) return;

      const batchKey = meta.updatesAt;
      const dismissed = this.readDismissed(LS_NEWS_DISMISS);
      if (dismissed !== batchKey) {
        this.news.set({ visible: true, batchKey });
      }
    } catch {
      // silently ignore — banners are non-critical
    }
  }

  private async loadDailyState(): Promise<void> {
    try {
      const meta = await firstValueFrom(
        this.dailyApi.getMetadata().pipe(catchError(() => of(null))),
      );
      if (!meta || meta.count === 0) return;

      const batchKey = meta.resetsAt;
      const dismissed = this.readDismissed(LS_DAILY_DISMISS);
      if (dismissed !== batchKey) {
        this.daily.set({ visible: true, batchKey });
      }
    } catch {
      // silently ignore
    }
  }

  dismissNews(): void {
    const { batchKey } = this.news();
    this.writeDismissed(LS_NEWS_DISMISS, batchKey);
    this.news.set({ visible: false, batchKey });
  }

  dismissDaily(): void {
    const { batchKey } = this.daily();
    this.writeDismissed(LS_DAILY_DISMISS, batchKey);
    this.daily.set({ visible: false, batchKey });
  }

  playNews(): void {
    this.dismissNews();
    this.router.navigate(['/news']);
  }

  playDaily(): void {
    this.dismissDaily();
    this.router.navigate(['/daily']);
  }

  private readDismissed(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeDismissed(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore quota errors
    }
  }
}
