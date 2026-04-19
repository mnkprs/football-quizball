import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ScreenComponent } from './screen';

/*
 * Regression guard for v0.8.6.0: `<app-screen>` previously had two default
 * <ng-content> slots (padded + bleed branches). Angular's content projection
 * resolves at compile time per selector, so duplicate defaults collapsed to
 * a single live slot — body content for /solo and /blitz vanished entirely.
 *
 * The fix introduced a named slot `[screen-body]` for padded mode. These
 * tests lock in the contract so any future refactor that regresses it
 * (e.g., renaming the selector, adding a second default slot, removing the
 * ngProjectAs wrapper requirement) breaks a test instead of silently
 * emptying the game screens.
 */

@Component({
  standalone: true,
  imports: [ScreenComponent],
  template: `
    <app-screen mode="padded">
      <ng-container ngProjectAs="[screen-body]">
        <p class="projected">wrapped-padded-body</p>
      </ng-container>
    </app-screen>
  `,
})
class PaddedHost {}

@Component({
  standalone: true,
  imports: [ScreenComponent],
  template: `
    <app-screen mode="bleed">
      <p class="projected">bleed-body</p>
    </app-screen>
  `,
})
class BleedHost {}

@Component({
  standalone: true,
  imports: [ScreenComponent],
  template: `
    <app-screen mode="padded">
      <p class="projected">unwrapped</p>
    </app-screen>
  `,
})
class UnwrappedPaddedHost {}

describe('ScreenComponent content projection', () => {
  it('projects body content into .screen__body in padded mode when wrapped in ngProjectAs="[screen-body]"', () => {
    const fixture = TestBed.createComponent(PaddedHost);
    fixture.detectChanges();
    const body = fixture.nativeElement.querySelector('.screen__body');
    expect(body).withContext('.screen__body must render in padded mode').toBeTruthy();
    expect(body.textContent).toContain('wrapped-padded-body');
  });

  it('projects default-slot content into .screen__bleed in bleed mode', () => {
    const fixture = TestBed.createComponent(BleedHost);
    fixture.detectChanges();
    const bleed = fixture.nativeElement.querySelector('.screen__bleed');
    expect(bleed).withContext('.screen__bleed must render in bleed mode').toBeTruthy();
    expect(bleed.textContent).toContain('bleed-body');
  });

  it('documents the contract: unwrapped padded-mode content is silently dropped (use ngProjectAs="[screen-body]")', () => {
    // This test codifies the intentional trade-off of the named-slot pattern:
    // consumers who forget the ngProjectAs wrapper get an empty body with no
    // compile error. The ScreenComponent.ngAfterViewInit() dev-mode warning
    // is the runtime safety net. If Angular ever starts auto-matching
    // unwrapped children to named slots, this test will fail and the
    // assertion in ngAfterViewInit can be relaxed.
    const fixture = TestBed.createComponent(UnwrappedPaddedHost);
    fixture.detectChanges();
    const body = fixture.nativeElement.querySelector('.screen__body');
    expect(body).toBeTruthy();
    expect(body.textContent).not.toContain('unwrapped');
  });
});
