import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import { QueueStateService } from '../../../core/queue-state.service';
import { ShellUiService } from '../../../core/shell-ui.service';
import { SoButtonComponent } from '../so-button/so-button';

const DRAG_POSITION_KEY = 'so-queue-widget:position';

interface DragPosition {
  x: number;
  y: number;
}

/**
 * Floating duel queue widget. Draggable, sits above all app chrome.
 *
 * Three visual states driven by QueueStateService.displayState():
 *   searching → glass background, pulse dot, elapsed counter, Leave
 *   reserved  → red-glass background, opponent + countdown
 *               • iAccepted=false → "TAP TO PLAY" CTA
 *               • iAccepted=true  → "WAITING FOR OPPONENT" disabled CTA
 *   hidden    → not rendered
 *
 * Positioning:
 *   - Default: position: fixed, anchored under the top-nav (or under the
 *     safe-area inset on routes where top-nav is hidden).
 *   - Once user drags, position persists in localStorage (per device) and
 *     survives state transitions and reloads. cdkDrag's freeDragPosition
 *     binding keeps the rendered position in sync with the saved value.
 *   - z-index 9999 so the widget tops top-nav (50), bottom-nav (40), modals,
 *     and toasts. The user can park it anywhere on screen including over
 *     other chrome.
 *
 * Drag handle: the entire glass strip is the handle EXCEPT for buttons
 * (so-button absorbs pointer events first). cdkDrag's built-in click vs
 * drag threshold (5px) prevents accidental drags from a normal tap.
 */
@Component({
  selector: 'so-queue-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SoButtonComponent, CdkDrag],
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
   * Inline top offset for the fixed widget (pre-drag default position).
   * Once dragged, cdkDragFreeDragPosition takes over via transform.
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

  /** Persisted drag position (px offsets from the default fixed top/center). */
  readonly dragPosition = signal<DragPosition>(this.loadDragPosition());

  onLeave(): void {
    this.queue.leaveQueue();
  }

  onAccept(): void {
    this.queue.acceptMatch();
  }

  /** Persist new position to localStorage on drag release. */
  onDragEnd(event: CdkDragEnd): void {
    const pos = event.source.getFreeDragPosition();
    this.dragPosition.set(pos);
    try {
      localStorage.setItem(DRAG_POSITION_KEY, JSON.stringify(pos));
    } catch {
      // localStorage can throw in private mode / quota exceeded — non-fatal.
    }
  }

  private loadDragPosition(): DragPosition {
    try {
      const raw = localStorage.getItem(DRAG_POSITION_KEY);
      if (!raw) return { x: 0, y: 0 };
      const parsed = JSON.parse(raw) as DragPosition;
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
        return parsed;
      }
    } catch {
      // Invalid JSON or unavailable storage — fall through to default.
    }
    return { x: 0, y: 0 };
  }
}
