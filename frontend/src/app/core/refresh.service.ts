import { Injectable, computed, signal } from '@angular/core';

export type RefreshHandler = () => Promise<void> | void;

/**
 * Coordinates pull-to-refresh between the shell-mounted gesture directive
 * and whichever feature page is currently active.
 *
 * Pages opt in by calling register() in ngOnInit and unregister() in ngOnDestroy.
 * When no handler is registered, the directive ignores the gesture entirely.
 *
 * The handler is held in a signal so the shell's OnPush template re-evaluates
 * @if (refresh.hasHandler()) the moment a page registers/unregisters.
 */
@Injectable({ providedIn: 'root' })
export class RefreshService {
  private handler = signal<RefreshHandler | null>(null);

  readonly hasHandler = computed(() => this.handler() !== null);
  readonly pullPx = signal(0);
  readonly isPulling = signal(false);
  readonly isReady = signal(false);
  readonly isLoading = signal(false);

  register(handler: RefreshHandler): void {
    this.handler.set(handler);
  }

  unregister(): void {
    this.handler.set(null);
    this.reset();
  }

  async trigger(): Promise<void> {
    const fn = this.handler();
    if (!fn || this.isLoading()) return;
    this.isLoading.set(true);
    try {
      await fn();
    } catch (err) {
      // Swallow handler errors so a failing refresh doesn't break the
      // gesture pipeline. The page-level handler is responsible for its
      // own user-visible error state (toast, error banner, etc).
      console.error('[refresh] handler threw', err);
    } finally {
      this.isLoading.set(false);
      this.reset();
    }
  }

  reset(): void {
    this.pullPx.set(0);
    this.isPulling.set(false);
    this.isReady.set(false);
  }
}
