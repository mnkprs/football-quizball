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
  readonly dailyDuelsRemaining = signal<number>(1);
  /** ISO timestamp the duel queue is blocked until (3-strike no-show cooldown), or null. */
  readonly duelQueueBlockedUntil = signal<string | null>(null);
  /** Re-evaluated every second while a cooldown is active so the Find-Duel
   *  button label / disabled state stay in sync without manual subscriptions. */
  private readonly nowTick = signal<number>(Date.now());
  /** True iff the cooldown is currently in the future. */
  readonly isDuelQueueBlocked = computed(() => {
    const until = this.duelQueueBlockedUntil();
    if (!until) return false;
    return new Date(until).getTime() > this.nowTick();
  });
  /** "HH:MM:SS" countdown until the cooldown elapses, or null. */
  readonly duelQueueRetryLabel = computed(() => {
    const until = this.duelQueueBlockedUntil();
    if (!until) return null;
    const diff = new Date(until).getTime() - this.nowTick();
    if (diff <= 0) return null;
    const totalS = Math.ceil(diff / 1000);
    const h = Math.floor(totalS / 3600);
    const m = Math.floor((totalS % 3600) / 60);
    const s = totalS % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  });
  /** How the user purchased Pro: subscription, lifetime, or null (not pro). */
  readonly purchaseType = signal<'subscription' | 'lifetime' | null>(null);
  /** ISO date string for when the subscription expires (null for lifetime or non-pro). */
  readonly subscriptionExpiresAt = signal<string | null>(null);
  /** Which mode triggered the upgrade modal — used for contextual CTA in the modal. */
  readonly triggerContext = signal<'duel' | 'battle-royale' | 'general'>('general');

  private inflight: Promise<void> | null = null;
  private blockTicker?: ReturnType<typeof setInterval>;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  async ensureLoaded(): Promise<void> {
    if (this.inflight) return this.inflight;
    return this.loadStatus();
  }

  async loadStatus(): Promise<void> {
    if (!this.auth.isLoggedIn()) return;
    if (this.inflight) return this.inflight;
    this.inflight = this.doLoadStatus();
    return this.inflight;
  }

  private async doLoadStatus(): Promise<void> {
    try {
      const status = await firstValueFrom(
        this.http.get<{
          is_pro: boolean;
          trial_battle_royale_used: number;
          daily_duels_remaining: number;
          duel_queue_blocked_until: string | null;
          purchase_type: 'subscription' | 'lifetime' | null;
          subscription_expires_at: string | null;
        }>(
          `${this.base}/status`,
          { headers: this.headers() },
        ),
      );
      this.isPro.set(status.is_pro);
      this.trialBattleRoyaleUsed.set(status.trial_battle_royale_used ?? 0);
      this.dailyDuelsRemaining.set(status.daily_duels_remaining ?? 1);
      this.applyDuelQueueBlock(status.duel_queue_blocked_until ?? null);
      this.purchaseType.set(status.purchase_type ?? null);
      this.subscriptionExpiresAt.set(status.subscription_expires_at ?? null);
    } catch {
      // Non-fatal: defaults stay
    }
  }

  resetLoaded(): void {
    this.inflight = null;
  }

  /**
   * Apply (or clear) the duel-queue cooldown. Centralized so both /status
   * loads and 429 retry_after parses share one update path. Spins up a 1s
   * ticker while a block is active so the countdown computed signal updates
   * without manual subscriptions; tears it down once elapsed.
   */
  applyDuelQueueBlock(blockedUntil: string | null): void {
    if (!blockedUntil || new Date(blockedUntil).getTime() <= Date.now()) {
      this.duelQueueBlockedUntil.set(null);
      this.stopBlockTicker();
      return;
    }
    this.duelQueueBlockedUntil.set(blockedUntil);
    this.startBlockTicker();
  }

  /**
   * Convenience adapter for the two Find-Duel callsites: parse retry_after
   * out of a 429 HttpErrorResponse and apply it. Returns true if the error
   * was a queue-block 429 we recognized (so callers can suppress generic
   * error toasts), false otherwise.
   */
  applyDuelQueueBlockFromError(err: unknown): boolean {
    const status = (err as { status?: number })?.status;
    if (status !== 429) return false;
    const body = (err as { error?: { retry_after?: string; message?: string } })?.error;
    const retryAfter = body?.retry_after;
    if (!retryAfter) return false;
    // Daily-limit 429 also carries retry_after but it's tomorrow's midnight.
    // Distinguish from the queue cooldown by message; daily-limit messages
    // are kept separate so we don't clobber the queue countdown signal with
    // a tomorrow-midnight value (which would mis-render the button).
    if ((body?.message ?? '').toLowerCase().includes('queue')) {
      this.applyDuelQueueBlock(retryAfter);
      return true;
    }
    return false;
  }

  private startBlockTicker(): void {
    if (this.blockTicker) return;
    this.blockTicker = setInterval(() => {
      const until = this.duelQueueBlockedUntil();
      const now = Date.now();
      this.nowTick.set(now);
      if (until && new Date(until).getTime() <= now) {
        // Cooldown elapsed — clear and stop ticking.
        this.duelQueueBlockedUntil.set(null);
        this.stopBlockTicker();
      }
    }, 1000);
  }

  private stopBlockTicker(): void {
    if (this.blockTicker) {
      clearInterval(this.blockTicker);
      this.blockTicker = undefined;
    }
  }
}
