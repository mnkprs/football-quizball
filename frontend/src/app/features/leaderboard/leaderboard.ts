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
    <div class="min-h-screen bg-slate-900 p-4">
      <div class="max-w-2xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between mb-8 pt-2">
          <a routerLink="/" class="text-slate-400 hover:text-white transition text-sm">← Home</a>
          <h1 class="text-2xl font-black text-white">Leaderboard</h1>
          <button (click)="load()" [disabled]="loading()" class="text-amber-400 hover:text-amber-300 transition text-sm">
            {{ loading() ? '...' : 'Refresh' }}
          </button>
        </div>

        @if (loading() && entries().length === 0) {
          <div class="text-center text-slate-400 py-12">Loading...</div>
        }

        @if (error()) {
          <div class="text-center text-red-400 py-6">{{ error() }}</div>
        }

        <!-- Table -->
        @if (entries().length > 0) {
          <div class="space-y-2">
            @for (entry of entries(); track entry.id; let i = $index) {
              <div
                class="flex items-center gap-4 p-4 rounded-xl border transition"
                [class]="isCurrentUser(entry.id) ? 'bg-amber-400/10 border-amber-400/50' : 'bg-slate-800 border-slate-700'"
              >
                <!-- Rank -->
                <div class="w-8 text-center font-black text-lg"
                     [class]="i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-700' : 'text-slate-500'">
                  {{ i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) }}
                </div>

                <!-- Username -->
                <div class="flex-1 min-w-0">
                  <div class="text-white font-semibold truncate">
                    {{ entry.username }}
                    @if (isCurrentUser(entry.id)) { <span class="text-amber-400 text-xs ml-1">(you)</span> }
                  </div>
                  <div class="text-slate-500 text-xs">
                    {{ entry.questions_answered }} questions · {{ accuracy(entry) }}% accuracy
                  </div>
                </div>

                <!-- ELO -->
                <div class="text-right">
                  <div class="text-amber-400 font-black text-xl">{{ entry.elo }}</div>
                  <div class="text-slate-500 text-xs">ELO</div>
                </div>
              </div>
            }
          </div>
        }

        @if (!loading() && entries().length === 0 && !error()) {
          <div class="text-center text-slate-400 py-12">No players yet. Be the first!</div>
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
