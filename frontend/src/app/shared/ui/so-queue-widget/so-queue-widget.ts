import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { QueueStateService } from '../../../core/queue-state.service';
import { SoButtonComponent } from '../so-button/so-button';

/**
 * Floating duel queue widget. Sticky below the top-nav.
 *
 * Three visual states driven by QueueStateService.widgetState():
 *   searching → glass background, pulse dot, elapsed counter, Leave
 *   reserved  → red-glass background, opponent + countdown, Tap to Play
 *   hidden    → not rendered
 *
 * Day 1 = mocked. Day 3 wires real backend (DuelApiService.acceptGame).
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
