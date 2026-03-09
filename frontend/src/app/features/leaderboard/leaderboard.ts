import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { SoloApiService, LeaderboardEntry } from '../../core/solo-api.service';
import { BlitzApiService, BlitzLeaderboardEntry } from '../../core/blitz-api.service';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [RouterLink, MatCardModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div class="leaderboard-page">
      <header class="leaderboard-header">
        <h1 class="leaderboard-title">Leaderboard</h1>
        <button mat-button (click)="load()" [disabled]="loading()">
          {{ loading() ? '...' : 'Refresh' }}
        </button>
      </header>

      @if (loading() && entries().length === 0) {
        <div class="leaderboard-loading">
          <mat-spinner diameter="32"></mat-spinner>
          <span>Loading...</span>
        </div>
      }

      @if (error()) {
        <div class="leaderboard-error">{{ error() }}</div>
      }

      <section class="leaderboard-section">
        <h2 class="leaderboard-section-title">🏆 Solo Ranked</h2>
        @if (entries().length > 0) {
          <div class="leaderboard-list">
            @for (entry of entries(); track entry.id; let i = $index) {
              <a [routerLink]="['/profile', entry.id]" class="leaderboard-card-link">
                <mat-card class="leaderboard-card" [class.leaderboard-card--you]="isCurrentUser(entry.id)">
                  <mat-card-content class="leaderboard-card-content">
                  <div class="leaderboard-rank" [class.leaderboard-rank--top]="i < 3">
                    {{ i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) }}
                  </div>
                  <div class="leaderboard-info">
                    <div class="leaderboard-name">
                      {{ entry.username }}
                      @if (isCurrentUser(entry.id)) { <span class="leaderboard-you">(you)</span> }
                    </div>
                    <div class="leaderboard-meta">
                      {{ entry.questions_answered }} questions · {{ accuracy(entry) }}% accuracy
                    </div>
                  </div>
                  <div class="leaderboard-score">
                    <span class="leaderboard-score-value">{{ entry.elo }}</span>
                    <span class="leaderboard-score-label">ELO</span>
                  </div>
                </mat-card-content>
              </mat-card>
              </a>
            }
          </div>
        } @else if (!loading()) {
          <mat-card class="leaderboard-empty">
            <mat-card-content>No players yet. Be the first!</mat-card-content>
          </mat-card>
        }
      </section>

      <section class="leaderboard-section">
        <h2 class="leaderboard-section-title">⚡ Blitz Mode</h2>
        @if (blitzEntries().length > 0) {
          <div class="leaderboard-list">
            @for (entry of blitzEntries(); track entry.user_id; let i = $index) {
              <a [routerLink]="['/profile', entry.user_id]" class="leaderboard-card-link">
                <mat-card class="leaderboard-card" [class.leaderboard-card--you]="isCurrentUser(entry.user_id)">
                  <mat-card-content class="leaderboard-card-content">
                  <div class="leaderboard-rank" [class.leaderboard-rank--top]="i < 3">
                    {{ i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) }}
                  </div>
                  <div class="leaderboard-info">
                    <div class="leaderboard-name">
                      {{ entry.username }}
                      @if (isCurrentUser(entry.user_id)) { <span class="leaderboard-you">(you)</span> }
                    </div>
                    <div class="leaderboard-meta">
                      {{ entry.total_answered }} answered
                    </div>
                  </div>
                  <div class="leaderboard-score">
                    <span class="leaderboard-score-value">{{ entry.score }}</span>
                    <span class="leaderboard-score-label">Best</span>
                  </div>
                </mat-card-content>
              </mat-card>
              </a>
            }
          </div>
        } @else if (!loading()) {
          <mat-card class="leaderboard-empty">
            <mat-card-content>No Blitz scores yet. Play now!</mat-card-content>
          </mat-card>
        }
      </section>
    </div>
  `,
  styles: [`
    .leaderboard-page {
      padding: 1rem;
      max-width: 28rem;
      margin: 0 auto;
    }

    .leaderboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-top: 0.5rem;
    }

    .leaderboard-title {
      font-size: 1.5rem;
      font-weight: 800;
      margin: 0;
    }

    .leaderboard-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 3rem 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .leaderboard-error {
      text-align: center;
      color: var(--mat-sys-error);
      padding: 1.5rem 0;
    }

    .leaderboard-section {
      margin-bottom: 2.5rem;
    }

    .leaderboard-section-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 600;
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 1rem 0;
    }

    .leaderboard-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .leaderboard-card-link {
      display: block;
      text-decoration: none;
      color: inherit;
    }

    .leaderboard-card-link:hover .leaderboard-card {
      background: color-mix(in srgb, var(--mat-sys-primary) 5%, var(--mat-sys-surface));
    }

    .leaderboard-card {
      &.leaderboard-card--you {
        background: color-mix(in srgb, var(--mat-sys-primary) 10%, var(--mat-sys-surface));
        border: 1px solid color-mix(in srgb, var(--mat-sys-primary) 40%, transparent);
      }
    }

    .leaderboard-card-content {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem !important;
    }

    .leaderboard-rank {
      width: 2rem;
      text-align: center;
      font-weight: 700;
      font-size: 1.125rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .leaderboard-rank--top {
      color: var(--mat-sys-primary);
    }

    .leaderboard-info {
      flex: 1;
      min-width: 0;
    }

    .leaderboard-name {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .leaderboard-you {
      color: var(--mat-sys-primary);
      font-size: 0.75rem;
      margin-left: 0.25rem;
    }

    .leaderboard-meta {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .leaderboard-score {
      text-align: right;
    }

    .leaderboard-score-value {
      display: block;
      font-weight: 700;
      font-size: 1.25rem;
      color: var(--mat-sys-primary);
    }

    .leaderboard-score-label {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .leaderboard-empty {
      text-align: center;
    }

    .leaderboard-empty mat-card-content {
      color: var(--mat-sys-on-surface-variant);
      padding: 2rem !important;
    }
  `],
})
export class LeaderboardComponent implements OnInit {
  private soloApi = inject(SoloApiService);
  private blitzApi = inject(BlitzApiService);
  auth = inject(AuthService);

  entries = signal<LeaderboardEntry[]>([]);
  blitzEntries = signal<BlitzLeaderboardEntry[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [soloData, blitzData] = await Promise.all([
        firstValueFrom(this.soloApi.getLeaderboard()),
        firstValueFrom(this.blitzApi.getLeaderboard()).catch(() => []),
      ]);
      this.entries.set(soloData);
      this.blitzEntries.set(blitzData);
    } catch (err: any) {
      this.error.set('Failed to load leaderboard');
    } finally {
      this.loading.set(false);
    }
  }

  isCurrentUser(userId: string): boolean {
    return this.auth.user()?.id === userId;
  }

  accuracy(entry: LeaderboardEntry): number {
    if (!entry.questions_answered) return 0;
    return Math.round((entry.correct_answers / entry.questions_answered) * 100);
  }
}
