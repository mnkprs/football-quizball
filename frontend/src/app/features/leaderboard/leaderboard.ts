import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { SoloApiService, LeaderboardEntry } from '../../core/solo-api.service';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-background p-4">
      <div class="max-w-2xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between mb-8 pt-2">
          <a routerLink="/" class="text-muted-foreground hover:text-foreground transition text-sm">← Home</a>
          <h1 class="text-2xl font-black text-foreground">Leaderboard</h1>
          <button (click)="load()" [disabled]="loading()" class="text-accent hover:text-accent-light transition text-sm">
            {{ loading() ? '...' : 'Refresh' }}
          </button>
        </div>

        @if (loading() && entries().length === 0) {
          <div class="text-center text-muted-foreground py-12">Loading...</div>
        }

        @if (error()) {
          <div class="text-center text-loss py-6">{{ error() }}</div>
        }

        <!-- Table -->
        @if (entries().length > 0) {
          <div class="space-y-2">
            @for (entry of entries(); track entry.id; let i = $index) {
              <div
                class="flex items-center gap-4 p-4 rounded-xl border transition"
                [class]="isCurrentUser(entry.id) ? 'bg-accent/10 border-accent/50' : 'bg-card border-border shadow-card'"
              >
                <!-- Rank -->
                <div class="w-8 text-center font-black text-lg"
                     [class]="i === 0 ? 'text-accent' : i === 1 ? 'text-foreground' : i === 2 ? 'text-amber-700' : 'text-muted-foreground'">
                  {{ i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) }}
                </div>

                <!-- Username -->
                <div class="flex-1 min-w-0">
                  <div class="text-foreground font-semibold truncate">
                    {{ entry.username }}
                    @if (isCurrentUser(entry.id)) { <span class="text-accent text-xs ml-1">(you)</span> }
                  </div>
                  <div class="text-muted-foreground text-xs">
                    {{ entry.questions_answered }} questions · {{ accuracy(entry) }}% accuracy
                  </div>
                </div>

                <!-- ELO -->
                <div class="text-right">
                  <div class="text-accent font-black text-xl">{{ entry.elo }}</div>
                  <div class="text-muted-foreground text-xs">ELO</div>
                </div>
              </div>
            }
          </div>
        }

        @if (!loading() && entries().length === 0 && !error()) {
          <div class="text-center text-muted-foreground py-12">No players yet. Be the first!</div>
        }
      </div>
    </div>
  `,
})
export class LeaderboardComponent implements OnInit {
  private api = inject(SoloApiService);
  auth = inject(AuthService);

  entries = signal<LeaderboardEntry[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await firstValueFrom(this.api.getLeaderboard());
      this.entries.set(data);
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
