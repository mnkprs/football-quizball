import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { DailyApiService } from '../../core/daily-api.service';
import { NewsApiService } from '../../core/news-api.service';
import { LanguageService } from '../../core/language.service';
import { DailyHeroComponent } from '../../shared/daily-hero/daily-hero';

@Component({
  selector: 'app-today',
  standalone: true,
  imports: [DailyHeroComponent],
  templateUrl: './today.html',
  styleUrl: './today.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodayComponent implements OnInit, OnDestroy {
  lang = inject(LanguageService);
  private router = inject(Router);
  private dailyApi = inject(DailyApiService);
  private newsApi = inject(NewsApiService);

  private countdownTick = signal(0);
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  private dailyMeta = toSignal(
    this.dailyApi.getMetadata().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  private newsMeta = toSignal(
    this.newsApi.getMetadata().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

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
    this.countdownInterval = setInterval(() => this.countdownTick.update((v) => v + 1), 1000);
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }

  goDaily(): void {
    this.router.navigate(['/daily']);
  }

  goNews(): void {
    this.router.navigate(['/news']);
  }
}
