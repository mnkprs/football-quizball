import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AnalyticsApiService, AnalyticsSummary } from '../../core/analytics-api.service';
import { ProService } from '../../core/pro.service';
import { AuthService } from '../../core/auth.service';
import { EloTrajectoryComponent } from './widgets/elo-trajectory';
import { CategoryHeatmapComponent } from './widgets/category-heatmap';
import { DifficultyBreakdownComponent } from './widgets/difficulty-breakdown';
import { EraBreakdownComponent } from './widgets/era-breakdown';
import { LeagueTierBreakdownComponent } from './widgets/league-tier-breakdown';
import { ProTeaserComponent } from './widgets/pro-teaser';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    CommonModule,
    EloTrajectoryComponent,
    CategoryHeatmapComponent,
    DifficultyBreakdownComponent,
    EraBreakdownComponent,
    LeagueTierBreakdownComponent,
    ProTeaserComponent,
  ],
  templateUrl: './analytics.html',
  styleUrls: ['./analytics.css'],
})
export class AnalyticsComponent implements OnInit {
  private readonly api = inject(AnalyticsApiService);
  private readonly pro = inject(ProService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly summary = signal<AnalyticsSummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly isPro = this.pro.isPro;

  async ngOnInit(): Promise<void> {
    if (!this.auth.session()) {
      this.router.navigate(['/login']);
      return;
    }
    await this.pro.ensureLoaded();
    if (!this.pro.isPro()) {
      this.loading.set(false);
      return;
    }
    try {
      const data = await this.api.getMySummary();
      this.summary.set(data);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      this.loading.set(false);
    }
  }
}
