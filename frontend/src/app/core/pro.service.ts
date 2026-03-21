import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ProService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/subscription`;

  readonly isPro = signal(false);
  readonly trialGamesUsed = signal(0);
  readonly trialBattleRoyaleUsed = signal(0);
  readonly trialDuelUsed = signal(0);
  readonly trialBattleRoyaleRemaining = computed(() => Math.max(0, 1 - this.trialBattleRoyaleUsed()));
  readonly trialDuelRemaining = computed(() => Math.max(0, 2 - this.trialDuelUsed()));
  readonly showUpgradeModal = signal(false);

  private loaded = false;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.loadStatus();
  }

  async loadStatus(): Promise<void> {
    if (!this.auth.isLoggedIn()) return;
    try {
      const status = await firstValueFrom(
        this.http.get<{ is_pro: boolean; trial_games_used: number; trial_battle_royale_used: number; trial_duel_used: number }>(
          `${this.base}/status`,
          { headers: this.headers() },
        ),
      );
      this.isPro.set(status.is_pro);
      this.trialGamesUsed.set(status.trial_games_used);
      this.trialBattleRoyaleUsed.set(status.trial_battle_royale_used ?? 0);
      this.trialDuelUsed.set(status.trial_duel_used ?? 0);
      this.loaded = true;
    } catch {
      // Non-fatal: defaults stay false/0
    }
  }

  async createCheckout(): Promise<void> {
    const result = await firstValueFrom(
      this.http.post<{ url: string }>(`${this.base}/checkout`, {}, { headers: this.headers() }),
    );
    window.location.href = result.url;
  }

  async openPortal(): Promise<void> {
    const result = await firstValueFrom(
      this.http.post<{ url: string }>(`${this.base}/portal`, {}, { headers: this.headers() }),
    );
    window.location.href = result.url;
  }

  resetLoaded(): void {
    this.loaded = false;
  }
}
