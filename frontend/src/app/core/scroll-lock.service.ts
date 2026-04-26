import { DestroyRef, Injectable, inject } from '@angular/core';

/**
 * Reference-counted body scroll lock so multiple stacked modals can each
 * acquire the lock without their individual cleanups re-enabling background
 * scrolling while another modal is still open.
 */
@Injectable({ providedIn: 'root' })
export class ScrollLockService {
  private count = 0;
  private previousOverflow = '';
  private previousPaddingRight = '';
  private previousOverscrollBehavior = '';

  /**
   * Acquires the scroll lock for the lifetime of the current injection
   * context. Cleanup is registered automatically via DestroyRef, so callers
   * only need to invoke this once from a component constructor.
   */
  acquireForLifetime(): void {
    this.acquire();
    inject(DestroyRef).onDestroy(() => this.release());
  }

  acquire(): void {
    if (this.count === 0) {
      const body = document.body;
      this.previousOverflow = body.style.overflow;
      this.previousPaddingRight = body.style.paddingRight;
      this.previousOverscrollBehavior = body.style.overscrollBehavior;

      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = 'hidden';
      body.style.overscrollBehavior = 'none';
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    this.count++;
  }

  release(): void {
    if (this.count === 0) return;
    this.count--;
    if (this.count === 0) {
      const body = document.body;
      body.style.overflow = this.previousOverflow;
      body.style.paddingRight = this.previousPaddingRight;
      body.style.overscrollBehavior = this.previousOverscrollBehavior;
    }
  }
}
