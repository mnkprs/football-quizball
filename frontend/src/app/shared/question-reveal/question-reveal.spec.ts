import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QuestionRevealComponent } from './question-reveal';

/*
 * Regression guard for v0.8.6.1: <app-question-reveal> is the shared
 * end-of-question block for /solo and /logo-quiz (Blitz + Duel to adopt
 * later). It has two render modes — 'text' (strikethrough user answer →
 * morph connector → correct answer card) and 'options' (footer-only, since
 * MC options already show correct/wrong inline).
 *
 * These tests lock in the three contracts that matter for real users:
 *   1. Wrong text-mode answers show the strikethrough/correct pair with
 *      inline negative ELO chip + explanation + NEXT CTA.
 *   2. Correct text-mode answers show a single-row confirm with positive
 *      ELO chip (no strikethrough pair).
 *   3. Options-mode (MC) never renders the strikethrough pair — the options
 *      grid in the parent already conveys that.
 *
 * Any future refactor that regresses these (e.g., accidentally hiding the
 * strikethrough, dropping the ELO chip, rendering the answer pair in MC
 * mode) breaks a test instead of silently degrading the UX.
 */

@Component({
  standalone: true,
  imports: [QuestionRevealComponent],
  template: `
    <app-question-reveal
      renderMode="text"
      [correct]="false"
      userAnswer="idk"
      correctAnswer="Roda JC"
      explanation="PSV beat Roda JC in the 1988 KNVB Cup final."
      [eloChange]="-22" />
  `,
})
class WrongTextHost {}

@Component({
  standalone: true,
  imports: [QuestionRevealComponent],
  template: `
    <app-question-reveal
      renderMode="text"
      [correct]="true"
      userAnswer="Roda JC"
      correctAnswer="Roda JC"
      [eloChange]="12" />
  `,
})
class CorrectTextHost {}

@Component({
  standalone: true,
  imports: [QuestionRevealComponent],
  template: `
    <app-question-reveal
      renderMode="options"
      [correct]="false"
      correctAnswer="Roda JC"
      [eloChange]="-18" />
  `,
})
class WrongOptionsHost {}

describe('QuestionRevealComponent render contracts', () => {
  it('renders the strikethrough → connector → correct-answer pair + inline negative ELO chip in wrong text mode', () => {
    const fixture = TestBed.createComponent(WrongTextHost);
    fixture.detectChanges();
    const host = fixture.nativeElement;

    const userAnswerValue = host.querySelector('.qr__user-answer-value');
    expect(userAnswerValue).withContext('user answer card must render in wrong text mode').toBeTruthy();
    expect(userAnswerValue.textContent).toContain('idk');

    expect(host.querySelector('.qr__connector')).withContext('morph connector must bridge user-answer and correct-answer').toBeTruthy();

    const correctValue = host.querySelector('.qr__correct-answer-value');
    expect(correctValue).withContext('correct-answer card must render').toBeTruthy();
    expect(correctValue.textContent).toContain('Roda JC');

    const eloInline = host.querySelector('.qr__elo-inline--negative');
    expect(eloInline).withContext('negative ELO chip must inline with correct answer').toBeTruthy();
    expect(eloInline.textContent).toContain('-22');

    expect(host.querySelector('.qr__explanation')?.textContent).toContain('PSV beat Roda JC');
    expect(host.querySelector('.qr__next-btn')).toBeTruthy();

    // Accessibility: live region announces result to screen readers
    const liveRegion = host.querySelector('[role="status"]');
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
    expect(host.querySelector('.qr__sr-only')?.textContent).toContain('Wrong');
  });

  it('renders a single-row correct-confirm with positive ELO chip and no strikethrough pair in correct text mode', () => {
    const fixture = TestBed.createComponent(CorrectTextHost);
    fixture.detectChanges();
    const host = fixture.nativeElement;

    expect(host.querySelector('.qr__user-answer')).withContext('strikethrough pair must not render on correct').toBeNull();
    expect(host.querySelector('.qr__connector')).withContext('connector only exists in wrong state').toBeNull();

    const confirm = host.querySelector('.qr__correct-confirm');
    expect(confirm).withContext('correct-confirm row must render').toBeTruthy();
    expect(confirm.textContent).toContain('Roda JC');

    const eloInline = host.querySelector('.qr__elo-inline--positive');
    expect(eloInline).withContext('positive ELO chip must render').toBeTruthy();
    expect(eloInline.textContent).toContain('+12');

    expect(host.querySelector('.qr__sr-only')?.textContent).toContain('Correct');
  });

  it('renders footer-only (no strikethrough pair, no correct-confirm) in options mode', () => {
    const fixture = TestBed.createComponent(WrongOptionsHost);
    fixture.detectChanges();
    const host = fixture.nativeElement;

    expect(host.querySelector('.qr__user-answer')).withContext('options mode must not render strikethrough pair').toBeNull();
    expect(host.querySelector('.qr__correct-answer-value')).withContext('options mode must not render the separate correct-answer card (options grid handles it)').toBeNull();
    expect(host.querySelector('.qr__correct-confirm')).withContext('options mode must not render correct-confirm row').toBeNull();

    const eloChip = host.querySelector('.qr__elo-chip--negative');
    expect(eloChip).withContext('options mode shows standalone ELO chip instead').toBeTruthy();
    expect(eloChip.textContent).toContain('-18');

    expect(host.querySelector('.qr__next-btn')).toBeTruthy();
  });
});
