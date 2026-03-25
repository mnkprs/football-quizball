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
  readonly trialBattleRoyaleUsed = signal(0);
  readonly trialBattleRoyaleRemaining = computed(() => Math.max(0, 1 - this.trialBattleRoyaleUsed()));
  readonly showUpgradeModal = signal(false);

  /** Number of free duels remaining today (0 = limit reached, null = not loaded). */
  readonly dailyDuelsRemaining = signal<number>(3);
  /** How the user purchased Pro: subscription, lifetime, or null (not pro). */
  readonly purchaseType = signal<'subscription' | 'lifetime' | null>(null);
  /** ISO date string for when the subscription expires (null for lifetime or non-pro). */
  readonly subscriptionExpiresAt = signal<string | null>(null);
  /** Which mode triggered the upgrade modal — used for contextual CTA in the modal. */
  readonly triggerContext = signal<'duel' | 'battle-royale' | 'general'>('general');

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
        this.http.get<{
          is_pro: boolean;
          trial_battle_royale_used: number;
          daily_duels_remaining: number;
          purchase_type: 'subscription' | 'lifetime' | null;
          subscription_expires_at: string | null;
        }>(
          `${this.base}/status`,
          { headers: this.headers() },
        ),
      );
      this.isPro.set(status.is_pro);
      this.trialBattleRoyaleUsed.set(status.trial_battle_royale_used ?? 0);
      this.dailyDuelsRemaining.set(status.daily_duels_remaining ?? 3);
      this.purchaseType.set(status.purchase_type ?? null);
      this.subscriptionExpiresAt.set(status.subscription_expires_at ?? null);
      this.loaded = true;
    } catch {
      // Non-fatal: defaults stay
    }
  }

  resetLoaded(): void {
    this.loaded = false;
  }
}
