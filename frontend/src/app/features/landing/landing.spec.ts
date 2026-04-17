import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LandingComponent } from './landing';

describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(LandingComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('renders the hero section with headline', () => {
    expect(el.querySelector('[data-test="hero"]')).toBeTruthy();
    expect(el.textContent).toContain('Football trivia, head-to-head.');
  });

  it('renders the feature grid with 6 mode cards', () => {
    const cards = el.querySelectorAll('[data-test="feature-card"]');
    expect(cards.length).toBe(6);
  });

  it('renders the screenshots strip', () => {
    expect(el.querySelector('[data-test="screenshots"]')).toBeTruthy();
  });

  it('renders the how-it-works section with 3 steps', () => {
    const steps = el.querySelectorAll('[data-test="how-step"]');
    expect(steps.length).toBe(3);
  });

  it('renders the final CTA band', () => {
    expect(el.querySelector('[data-test="final-cta"]')).toBeTruthy();
  });

  it('renders the footer with terms and privacy links', () => {
    const footer = el.querySelector('[data-test="footer"]');
    expect(footer).toBeTruthy();
    expect(footer!.querySelector('a[href="/terms"]')).toBeTruthy();
    expect(footer!.querySelector('a[href="/privacy"]')).toBeTruthy();
  });

  it('uses the App Store URL from environment.stores', () => {
    const iosBadge = el.querySelector('[data-test="badge-ios"]') as HTMLAnchorElement;
    expect(iosBadge).toBeTruthy();
    expect(iosBadge.href).toContain('apps.apple.com');
  });

  it('uses the Play Store URL from environment.stores', () => {
    const androidBadge = el.querySelector('[data-test="badge-android"]') as HTMLAnchorElement;
    expect(androidBadge).toBeTruthy();
    expect(androidBadge.href).toContain('play.google.com');
  });
});
