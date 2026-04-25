import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { RefreshService } from '../../core/refresh.service';

/**
 * Pull-to-refresh gesture detector.
 *
 * Attach to the scroll container (e.g. .shell-main). PTR engages ONLY when
 * the finger lands while scrollTop is exactly 0 and then pulls downward.
 * Once a gesture starts mid-page (scrollTop > 0), PTR stays disarmed for
 * the entire touch — even if native scroll carries the page to the top.
 * The user must lift and re-touch at the top to pull-to-refresh.
 *
 * All listeners are passive — we never preventDefault. iOS native rubber-band
 * coexists with our indicator; the indicator lives outside .shell-main
 * (in shell-layout) so the native bounce doesn't double-translate it.
 */
@Directive({
  selector: '[soPullToRefresh]',
  standalone: true,
})
export class SoPullToRefreshDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  private refresh = inject(RefreshService);
  private zone = inject(NgZone);

  private startY = 0;
  private active = false;

  /**
   * Resolve "are we at the top of the page?" robustly.
   *
   * The actual scrolling element varies across pages on Capacitor's WebKit:
   * sometimes .shell-main is constrained and scrolls; sometimes the body or
   * documentElement scrolls instead; some feature pages introduce their own
   * intermediate `overflow-y: auto` wrapper. Walking the entire ancestor
   * chain from this.el up through the body — plus checking window.scrollY
   * for the document-level scroller — guarantees we catch every case.
   */
  private isAtTop(): boolean {
    let node: Element | null = this.el.nativeElement;
    while (node) {
      if ((node.scrollTop ?? 0) > 0) return false;
      node = node.parentElement;
    }
    if ((window.scrollY ?? 0) > 0) return false;
    return true;
  }

  private readonly onTouchStart = (e: TouchEvent): void => {
    this.active = false;
    if (!this.refresh.hasHandler()) return;
    if (this.refresh.isLoading()) return;
    // Strict gate: arm PTR only if the gesture begins exactly at the top.
    if (!this.isAtTop()) return;
    this.startY = e.touches[0].clientY;
    this.active = true;
  };

  private readonly onTouchMove = (e: TouchEvent): void => {
    if (!this.active) return;

    const delta = e.touches[0].clientY - this.startY;
    if (delta <= 0) {
      // Finger reversed direction or no movement — abandon for this gesture.
      this.active = false;
      this.zone.run(() => this.refresh.reset());
      return;
    }

    // No mid-gesture scrollTop check — once armed at touchstart with the
    // strict isAtTop gate, we trust the gesture. Re-checking mid-pull
    // produced false negatives from iOS rubber-band briefly fluctuating
    // ancestor scroll positions, which silently aborted valid pulls.

    const { offset, ready } = computePullState(delta);
    this.zone.run(() => {
      this.refresh.pullPx.set(offset);
      this.refresh.isReady.set(ready);
      this.refresh.isPulling.set(true);
    });
  };

  private readonly onTouchEnd = (): void => {
    if (!this.active) return;
    this.active = false;
    this.zone.run(() => {
      this.refresh.isPulling.set(false);
      if (this.refresh.isReady()) {
        this.refresh.trigger();
      } else {
        this.refresh.reset();
      }
    });
  };

  // touchcancel = system interception (swipe-from-edge for notifications,
  // app backgrounding, etc). Treat as abort — never fire refresh even if
  // the user happened to be past the threshold.
  private readonly onTouchCancel = (): void => {
    if (!this.active) return;
    this.active = false;
    this.zone.run(() => this.refresh.reset());
  };

  ngOnInit(): void {
    const host = this.el.nativeElement;
    // ALL listeners passive: true — zero scroll latency on every gesture.
    // We never preventDefault; native rubber-band at scrollTop=0 is welcome
    // and visually complements our indicator (which lives outside this
    // scroll container so it doesn't get double-translated).
    this.zone.runOutsideAngular(() => {
      host.addEventListener('touchstart', this.onTouchStart, { passive: true });
      host.addEventListener('touchmove', this.onTouchMove, { passive: true });
      host.addEventListener('touchend', this.onTouchEnd, { passive: true });
      host.addEventListener('touchcancel', this.onTouchCancel, { passive: true });
    });
  }

  ngOnDestroy(): void {
    const host = this.el.nativeElement;
    host.removeEventListener('touchstart', this.onTouchStart);
    host.removeEventListener('touchmove', this.onTouchMove);
    host.removeEventListener('touchend', this.onTouchEnd);
    host.removeEventListener('touchcancel', this.onTouchCancel);
  }
}

// iOS-style: 0.5x damping, 80px commit threshold, 130px visual cap.
const TRIGGER_PX = 80;
const MAX_OFFSET_PX = 110;
const DAMPING = 0.5;

function computePullState(rawPx: number): { offset: number; ready: boolean } {
  const offset = Math.min(rawPx * DAMPING, MAX_OFFSET_PX);
  const ready = rawPx >= TRIGGER_PX;
  return { offset, ready };
}
