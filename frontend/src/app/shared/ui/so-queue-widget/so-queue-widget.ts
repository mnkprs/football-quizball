import { Component, ChangeDetectionStrategy, inject, computed, signal, effect } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import { QueueStateService } from '../../../core/queue-state.service';
import { ShellUiService } from '../../../core/shell-ui.service';
import { SoButtonComponent } from '../so-button/so-button';

const STATE_KEY = 'so-queue-widget:state';
const HINT_AUTO_DISMISS_MS = 4000;
const HINT_REVEAL_DELAY_MS = 1500;

interface DragPosition {
  x: number;
  y: number;
}

interface PersistedState {
  expandedPos: DragPosition;
  collapsedPos: DragPosition;
  isCollapsed: boolean;
  hintShown: boolean;
}

const DEFAULT_STATE: PersistedState = {
  expandedPos: { x: 0, y: 0 },
  collapsedPos: { x: 0, y: 0 },
  isCollapsed: false,
  hintShown: false,
};

/**
 * Floating duel queue widget. Draggable, collapsible, sits above all app chrome.
 *
 * Visual modes:
 *   expanded  → full-width glass strip docked under top-nav (or floating with
 *               radius+shadow if user has dragged it elsewhere)
 *   collapsed → 56×56 round badge anchored top-right, draggable independently
 *
 * Queue states (drive content within both modes via QueueStateService):
 *   searching → pulse dot, mode label, elapsed timer, Leave button
 *   reserved  → opponent name, BIG countdown (28px), Tap-to-Play / Waiting status
 *               • Background: --color-warning tint (positive urgency, NOT destructive)
 *               • Calmer tint after the player has accepted
 *   hidden    → not rendered
 *
 * Persistence (localStorage key `so-queue-widget:state`):
 *   - expandedPos / collapsedPos — independent drag positions per mode
 *   - isCollapsed — last-known collapse flag
 *   - hintShown — first-time hint already seen
 *
 * z-index 9999 keeps the widget above top-nav (50), bottom-nav (40), modals,
 * and toasts. The user can park it anywhere on screen.
 *
 * Drag handle is the entire surface EXCEPT for buttons (SoButton absorbs
 * pointer events first). cdkDrag's built-in 5px click-vs-drag threshold
 * prevents accidental drags from a normal tap.
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

  /** Persisted widget state (collapsed flag + per-mode drag positions + hint). */
  private readonly state = signal<PersistedState>(this.loadState());

  readonly isCollapsed = computed(() => this.state().isCollapsed);

  /** Active drag position depending on which mode is shown. */
  readonly dragPosition = computed<DragPosition>(() => {
    const s = this.state();
    return s.isCollapsed ? s.collapsedPos : s.expandedPos;
  });

  /** True iff the user has dragged the widget away from its default position. */
  readonly isFloating = computed(() => {
    const p = this.dragPosition();
    return p.x !== 0 || p.y !== 0;
  });

  /** First-time hint visibility. Shown once per device, auto-dismiss. */
  readonly hintVisible = signal(false);

  constructor() {
    // Surface the drag/collapse hint the first time the widget appears.
    effect((onCleanup) => {
      const s = this.queue.displayState();
      if (s === 'hidden' || this.state().hintShown) return;
      const reveal = window.setTimeout(() => this.hintVisible.set(true), HINT_REVEAL_DELAY_MS);
      const dismiss = window.setTimeout(() => this.dismissHint(), HINT_REVEAL_DELAY_MS + HINT_AUTO_DISMISS_MS);
      onCleanup(() => {
        clearTimeout(reveal);
        clearTimeout(dismiss);
      });
    });
  }

  onLeave(): void {
    this.queue.leaveQueue();
  }

  onAccept(): void {
    this.queue.acceptMatch();
  }

  toggleCollapsed(): void {
    this.updateState(s => ({ ...s, isCollapsed: !s.isCollapsed }));
  }

  dismissHint(): void {
    if (!this.hintVisible() && this.state().hintShown) return;
    this.hintVisible.set(false);
    if (!this.state().hintShown) this.updateState(s => ({ ...s, hintShown: true }));
  }

  /** Persist new position to localStorage on drag release. */
  onDragEnd(event: CdkDragEnd): void {
    const pos = event.source.getFreeDragPosition();
    this.updateState(s =>
      s.isCollapsed
        ? { ...s, collapsedPos: pos }
        : { ...s, expandedPos: pos },
    );
    // First drag implicitly dismisses the hint — the user clearly understood it.
    if (this.hintVisible()) this.dismissHint();
  }

  private updateState(mutator: (s: PersistedState) => PersistedState): void {
    const next = mutator(this.state());
    this.state.set(next);
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(next));
    } catch {
      // localStorage can throw in private mode / quota exceeded — non-fatal.
    }
  }

  private loadState(): PersistedState {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return { ...DEFAULT_STATE };
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        expandedPos: this.coercePos(parsed.expandedPos),
        collapsedPos: this.coercePos(parsed.collapsedPos),
        isCollapsed: parsed.isCollapsed === true,
        hintShown: parsed.hintShown === true,
      };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  /**
   * Coerce a raw value into a DragPosition AND clamp to viewport bounds so a
   * previously-saved off-screen drag (e.g. user dragged the strip past the
   * viewport edge during a wider browser session, then opened on a smaller
   * device) doesn't render the widget where it can't be reached. Anything
   * outside the viewport envelope resets to {0,0}, the natural docked
   * position. The envelope is intentionally generous — only obviously-broken
   * positions get reset; small overshoots are kept so user-chosen placements
   * survive.
   */
  private coercePos(p: DragPosition | undefined): DragPosition {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
      return { x: 0, y: 0 };
    }
    const w = window.innerWidth || 0;
    const h = window.innerHeight || 0;
    if (Math.abs(p.x) > w || Math.abs(p.y) > h) {
      return { x: 0, y: 0 };
    }
    return p;
  }
}
