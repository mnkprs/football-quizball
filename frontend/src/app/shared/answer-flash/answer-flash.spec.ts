import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnswerFlashComponent } from './answer-flash';

/*
 * Regression guard for <app-answer-flash> — the shared a11y + motion
 * shell used by Blitz, Duel, and Battle Royale to surface in-flow
 * correct/wrong banners.
 *
 * The shell's single job is to ensure every mode's real-time flash
 * includes role="status" aria-live="assertive" + the announcement span
 * and offers tap-dismiss when used as an overlay. Visual styling is
 * always the consumer's responsibility (via ng-content + host classes),
 * so these tests deliberately don't check colors, layouts, or emoji.
 */

@Component({
  standalone: true,
  imports: [AnswerFlashComponent],
  template: `
    <app-answer-flash
      [correct]="true"
      announcement="Correct."
    >
      <div class="projected">hooray</div>
    </app-answer-flash>
  `,
})
class CorrectHost {}

@Component({
  standalone: true,
  imports: [AnswerFlashComponent],
  template: `
    <app-answer-flash
      [correct]="false"
      announcement="Wrong. The correct answer was Roma."
    >
      <div class="projected">bummer</div>
    </app-answer-flash>
  `,
})
class WrongHost {}

@Component({
  standalone: true,
  imports: [AnswerFlashComponent],
  template: `
    <app-answer-flash
      [correct]="true"
      announcement="Correct."
      [dismissible]="true"
      (dismiss)="onDismiss()"
    >
      tap me
    </app-answer-flash>
  `,
})
class DismissibleHost {
  dismissed = 0;
  onDismiss() { this.dismissed++; }
}

describe('AnswerFlashComponent', () => {
  it('wraps correct flash with role="status" aria-live="assertive" and announces "Correct."', () => {
    const fixture = TestBed.createComponent(CorrectHost);
    fixture.detectChanges();
    const host = fixture.nativeElement;

    const region = host.querySelector('[role="status"]');
    expect(region).withContext('role="status" wrapper must exist').toBeTruthy();
    expect(region.getAttribute('aria-live')).toBe('assertive');
    expect(region.getAttribute('aria-atomic')).toBe('true');

    const srText = host.querySelector('.sr-only');
    expect(srText?.textContent?.trim()).toBe('Correct.');

    const af = host.querySelector('.af');
    expect(af?.classList.contains('af--correct')).toBe(true);
    expect(af?.classList.contains('af--wrong')).toBe(false);

    // Projected content still renders
    expect(host.querySelector('.projected')?.textContent).toContain('hooray');
  });

  it('uses af--wrong and announces full correct-answer context on wrong', () => {
    const fixture = TestBed.createComponent(WrongHost);
    fixture.detectChanges();
    const host = fixture.nativeElement;

    const af = host.querySelector('.af');
    expect(af?.classList.contains('af--wrong')).toBe(true);
    expect(af?.classList.contains('af--correct')).toBe(false);

    const srText = host.querySelector('.sr-only');
    expect(srText?.textContent?.trim()).toBe('Wrong. The correct answer was Roma.');
  });

  it('emits dismiss on click only when dismissible=true', () => {
    const fixture = TestBed.createComponent(DismissibleHost);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const af = fixture.nativeElement.querySelector('.af') as HTMLElement;

    expect(host.dismissed).toBe(0);
    af.click();
    expect(host.dismissed).toBe(1);

    expect(af.classList.contains('af--dismissible')).toBe(true);
  });

  it('does NOT emit dismiss when dismissible=false (default)', () => {
    const fixture = TestBed.createComponent(CorrectHost);
    fixture.detectChanges();
    const af = fixture.nativeElement.querySelector('.af') as HTMLElement;

    expect(af.classList.contains('af--dismissible')).toBe(false);
    af.click();  // should be a no-op
    // No (dismiss) listener in CorrectHost — but component still must not throw
  });
});
