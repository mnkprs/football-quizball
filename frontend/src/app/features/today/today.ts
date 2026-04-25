import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DailyApiService, DailyMetadata } from '../../core/daily-api.service';
import { NewsApiService, NewsMetadata } from '../../core/news-api.service';
import { LanguageService } from '../../core/language.service';
import { ShellUiService } from '../../core/shell-ui.service';
import { RefreshService } from '../../core/refresh.service';
import { MatIconModule } from '@angular/material/icon';
import { DailyHeroComponent } from '../../shared/daily-hero/daily-hero';

@Component({
  selector: 'app-today',
  standalone: true,
  imports: [DailyHeroComponent, MatIconModule],
  templateUrl: './today.html',
  styleUrl: './today.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodayComponent implements OnInit, OnDestroy {
  lang = inject(LanguageService);
  private router = inject(Router);
  private dailyApi = inject(DailyApiService);
  private newsApi = inject(NewsApiService);
  private shellUi = inject(ShellUiService);
  private refreshSvc = inject(RefreshService);

  private countdownTick = signal(0);
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  private dailyMeta = signal<DailyMetadata | null>(null);
  private newsMeta = signal<NewsMetadata | null>(null);

  todayDate = computed(() => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  });

  dailyCount = computed(() => this.dailyMeta()?.count ?? null);

  dailyResetsIn = computed(() => {
    const meta = this.dailyMeta();
    this.countdownTick();
    if (!meta?.resetsAt) return '—';
    const ms = new Date(meta.resetsAt).getTime() - Date.now();
    if (ms <= 0) return '0:00:00';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  });

  newsCount = computed(() => this.newsMeta()?.questions_remaining ?? null);

  newsUpdatesIn = computed(() => {
    const meta = this.newsMeta();
    this.countdownTick();
    if (!meta?.expires_at) return '—';
    const ms = new Date(meta.expires_at).getTime() - Date.now();
    if (ms <= 0) return '0:00:00';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  });

  ngOnInit(): void {
    this.shellUi.showTopNavBar.set(true);
    this.refreshSvc.register(() => this.loadMetadata());
    this.loadMetadata();
    this.countdownInterval = setInterval(() => this.countdownTick.update((v) => v + 1), 1000);
  }

  ngOnDestroy(): void {
    this.shellUi.showTopNavBar.set(false);
    this.refreshSvc.unregister();
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }

  async loadMetadata(): Promise<void> {
    const [daily, news] = await Promise.all([
      firstValueFrom(this.dailyApi.getMetadata()).catch(() => null),
      firstValueFrom(this.newsApi.getMetadata()).catch(() => null),
    ]);
    this.dailyMeta.set(daily);
    this.newsMeta.set(news);
  }

  goDaily(): void {
    this.router.navigate(['/daily']);
  }

  goNews(): void {
    this.router.navigate(['/news']);
  }
}
