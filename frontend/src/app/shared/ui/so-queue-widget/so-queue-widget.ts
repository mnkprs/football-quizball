import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { QueueStateService } from '../../../core/queue-state.service';
import { ShellUiService } from '../../../core/shell-ui.service';
import { SoButtonComponent } from '../so-button/so-button';

/**
 * Floating duel queue widget. Sticky below the top-nav (or below the safe-area
 * inset on routes where the top-nav is hidden).
 *
 * Three visual states driven by QueueStateService.displayState():
 *   searching → glass background, pulse dot, elapsed counter, Leave
 *   reserved  → red-glass background, opponent + countdown, Tap to Play
 *   hidden    → not rendered
 *
 * Day 1 = mocked. Day 3 wires real backend (DuelApiService.acceptGame).
 *
 * Positioning: position: fixed below top-nav. Top offset is bound dynamically
 * to var(--top-nav-reserve) when the top-nav is shown, else env(safe-area-inset-top).
 * Anchoring inline keeps the widget glued under whatever chrome is actually
 * rendered on the current route, instead of leaving a gap when top-nav hides.
 */
@Component({
  selector: 'so-queue-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SoButtonComponent],
  templateUrl: './so-queue-widget.html',
  styleUrl: './so-queue-widget.css',
})
export class SoQueueWidgetComponent {
  queue = inject(QueueStateService);
  private shellUi = inject(ShellUiService);
  private router = inject(Router);

  /** True when the user is on the home route (top-nav is always visible there). */
  private readonly isHome = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects.split('?')[0] === '/'),
      startWith(this.router.url.split('?')[0] === '/'),
    ),
    { initialValue: false },
  );

  /** Whether the top-nav is currently shown (mirrors shell.html's logic). */
  private readonly topNavVisible = computed(() =>
    this.isHome() || this.shellUi.showTopNavBar(),
  );

  /**
   * Inline top offset for the fixed widget.
   * - Top-nav visible: anchor at var(--top-nav-reserve) (3.75rem + safe-area-inset-top)
   * - Top-nav hidden: anchor at env(safe-area-inset-top) only
   */
  readonly topOffset = computed(() =>
    this.topNavVisible()
      ? 'var(--top-nav-reserve)'
      : 'env(safe-area-inset-top, 0px)',
  );

  /** Mode label for the searching row. Logo Duel today; Standard Duel later. */
  readonly modeLabel = computed(() => {
    const t = this.queue.activeQueue()?.gameType;
    return t === 'logo' ? 'Logo Duel' : 'Duel';
  });

  /** ARIA live politeness — assertive on reserved (interrupts), polite otherwise. */
  readonly ariaLive = computed(() =>
    this.queue.displayState() === 'reserved' ? 'assertive' : 'polite',
  );

  onLeave(): void {
    this.queue.leaveQueue();
  }

  onAccept(): void {
    this.queue.acceptMatch();
  }
}
