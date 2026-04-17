# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-route marketing landing page at `/` that, when an env flag is flipped on launch day, replaces the dev web app and drives visitors to the iOS/Android stores.

**Architecture:** Standalone Angular 20 `LandingComponent` rendered at `/` when `environment.landingMode === true`. In landing mode, only `/`, `/terms`, `/privacy` resolve; all other routes redirect to `/`. Device detection is a pure utility function; store CTAs render per-platform. Smart-banner meta tags use native iOS/Android mechanisms (no JS SDK). No backend calls.

**Tech Stack:** Angular 20 standalone components, Karma + Jasmine for unit tests, TailwindCSS + component SCSS, `@angular/router` conditional routes.

**Reference spec:** `docs/superpowers/specs/2026-04-17-landing-page-design.md`

---

## File Structure

**New files:**
- `frontend/src/app/features/landing/landing.ts` — standalone component class
- `frontend/src/app/features/landing/landing.html` — template with 6 sections
- `frontend/src/app/features/landing/landing.scss` — component styles (budget: <25kB)
- `frontend/src/app/features/landing/landing.spec.ts` — unit tests
- `frontend/src/app/features/landing/platform-detector.ts` — `detectPlatform()` utility
- `frontend/src/app/features/landing/platform-detector.spec.ts` — utility tests
- `frontend/src/app/features/landing/content.ts` — static content (modes, steps, headlines) — keeps template lean

**Modified files:**
- `frontend/src/environments/environment.ts` — add `landingMode: false` + `stores` block
- `frontend/src/environments/environment.prod.ts` — add `landingMode: false` (flipped to `true` on launch) + real store URLs
- `frontend/src/environments/environment.example.ts` — mirror new fields
- `frontend/src/app/app.routes.ts` — conditional routes array on `environment.landingMode`
- `frontend/src/index.html` — add `apple-itunes-app` meta tag
- `frontend/public/manifest.webmanifest` — add `related_applications` + `prefer_related_applications: true`
- `VERSION` — bump to `0.8.3.0`
- `CHANGELOG.md` — add `[0.8.3.0]` section

**Playwright E2E:** Deferred. Repo has no Playwright setup. Per project CLAUDE.md, manual QA is done via the `/qa` skill. E2E is listed as follow-up work; unit tests + manual QA cover v1.

---

## Task 1: Add env flag + stores config

**Files:**
- Modify: `frontend/src/environments/environment.ts`
- Modify: `frontend/src/environments/environment.prod.ts`
- Modify: `frontend/src/environments/environment.example.ts`

- [ ] **Step 1: Add `landingMode` and `stores` to dev env**

Open `frontend/src/environments/environment.ts`. Add these fields inside the exported `environment` object (before the closing `};`):

```ts
  /** Landing-only mode — when true, root and all unknown routes render the marketing landing page. Flipped to true on native-app launch. */
  landingMode: false,
  /** App store links + smart-banner ID. Placeholders until launch. */
  stores: {
    appStoreUrl: 'https://apps.apple.com/app/idXXXXXXXX',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.stepover.app',
    appStoreId: 'XXXXXXXX',
  },
```

- [ ] **Step 2: Mirror in prod env**

Open `frontend/src/environments/environment.prod.ts`. Add the same block (placeholder URLs — real URLs filled in on launch day):

```ts
  landingMode: false,
  stores: {
    appStoreUrl: 'https://apps.apple.com/app/idXXXXXXXX',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.stepover.app',
    appStoreId: 'XXXXXXXX',
  },
```

- [ ] **Step 3: Mirror in example env**

Open `frontend/src/environments/environment.example.ts` and add the same block so new devs get the keys.

- [ ] **Step 4: Verify build still succeeds**

Run: `cd frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: build success with no new warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/environments/environment.ts frontend/src/environments/environment.prod.ts frontend/src/environments/environment.example.ts
git commit -m "feat(landing): add landingMode flag and stores config to environments"
```

---

## Task 2: Platform-detector utility (TDD)

**Files:**
- Create: `frontend/src/app/features/landing/platform-detector.ts`
- Create: `frontend/src/app/features/landing/platform-detector.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/features/landing/platform-detector.spec.ts`:

```ts
import { detectPlatform } from './platform-detector';

describe('detectPlatform', () => {
  it('returns "ios" for iPhone user agent', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(detectPlatform(ua)).toBe('ios');
  });

  it('returns "ios" for iPad user agent', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(detectPlatform(ua)).toBe('ios');
  });

  it('returns "ios" for iPod touch user agent', () => {
    const ua = 'Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X)';
    expect(detectPlatform(ua)).toBe('ios');
  });

  it('returns "android" for Android Chrome user agent', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0';
    expect(detectPlatform(ua)).toBe('android');
  });

  it('returns "other" for macOS Safari user agent', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1';
    expect(detectPlatform(ua)).toBe('other');
  });

  it('returns "other" for Windows Chrome user agent', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0';
    expect(detectPlatform(ua)).toBe('other');
  });

  it('returns "other" for empty string', () => {
    expect(detectPlatform('')).toBe('other');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --include='**/platform-detector.spec.ts' --watch=false --browsers=ChromeHeadless 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './platform-detector'`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/app/features/landing/platform-detector.ts`:

```ts
export type Platform = 'ios' | 'android' | 'other';

/**
 * Pure user-agent parser. Returns the broad platform family for CTA routing.
 * Takes the UA string as input so it's easy to unit test and reuse server-side.
 */
export function detectPlatform(userAgent: string): Platform {
  if (!userAgent) return 'other';
  if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --include='**/platform-detector.spec.ts' --watch=false --browsers=ChromeHeadless 2>&1 | tail -20`
Expected: 7 specs pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/landing/platform-detector.ts frontend/src/app/features/landing/platform-detector.spec.ts
git commit -m "feat(landing): add detectPlatform utility with UA-matrix tests"
```

---

## Task 3: Static content module

**Files:**
- Create: `frontend/src/app/features/landing/content.ts`

- [ ] **Step 1: Create content constants**

Create `frontend/src/app/features/landing/content.ts`:

```ts
export interface FeatureCard {
  name: string;
  description: string;
  iconPath: string;
}

export interface HowItWorksStep {
  n: number;
  title: string;
  description: string;
}

export const HERO_HEADLINE = 'Football trivia, head-to-head.';
export const HERO_SUBHEAD = 'Duel friends, climb ELO, master the badges.';
export const FINAL_CTA_HEADLINE = 'Ready to play?';
export const FOOTER_TAGLINE = 'Football trivia, head-to-head.';
export const CONTACT_EMAIL = 'support@stepover.app';

export const FEATURE_CARDS: readonly FeatureCard[] = [
  { name: 'Logo Quiz',     description: 'Guess the club from the crest.',         iconPath: 'assets/landing/icon-logo-quiz.svg' },
  { name: 'Duel',          description: 'Head-to-head ELO trivia matches.',       iconPath: 'assets/landing/icon-duel.svg' },
  { name: 'Battle Royale', description: 'Last player standing wins.',             iconPath: 'assets/landing/icon-battle-royale.svg' },
  { name: 'Solo ELO',      description: 'Climb the ranked ladder alone.',         iconPath: 'assets/landing/icon-solo.svg' },
  { name: 'Mayhem',        description: 'Chaotic multi-topic sprints.',           iconPath: 'assets/landing/icon-mayhem.svg' },
  { name: 'Blitz',         description: '60-second rapid-fire rounds.',           iconPath: 'assets/landing/icon-blitz.svg' },
];

export const HOW_IT_WORKS: readonly HowItWorksStep[] = [
  { n: 1, title: 'Download', description: 'Tap the store badge for your device.' },
  { n: 2, title: 'Sign up',  description: 'Create a free StepOver profile in seconds.' },
  { n: 3, title: 'Play',     description: 'Pick a mode and start climbing.' },
];

export const SCREENSHOTS: readonly string[] = [
  'assets/landing/screenshot-1.png',
  'assets/landing/screenshot-2.png',
  'assets/landing/screenshot-3.png',
  'assets/landing/screenshot-4.png',
  'assets/landing/screenshot-5.png',
];
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/features/landing/content.ts
git commit -m "feat(landing): add static content constants (cards, steps, copy)"
```

---

## Task 4: LandingComponent scaffold + section-presence tests (TDD)

**Files:**
- Create: `frontend/src/app/features/landing/landing.ts`
- Create: `frontend/src/app/features/landing/landing.html`
- Create: `frontend/src/app/features/landing/landing.scss`
- Create: `frontend/src/app/features/landing/landing.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/features/landing/landing.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LandingComponent } from './landing';

describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LandingComponent] }).compileComponents();
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --include='**/landing.spec.ts' --watch=false --browsers=ChromeHeadless 2>&1 | tail -20`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component class**

Create `frontend/src/app/features/landing/landing.ts`:

```ts
import { Component, inject } from '@angular/core';
import { DOCUMENT, NgOptimizedImage } from '@angular/common';
import { environment } from '../../../environments/environment';
import { detectPlatform, Platform } from './platform-detector';
import {
  HERO_HEADLINE, HERO_SUBHEAD, FINAL_CTA_HEADLINE, FOOTER_TAGLINE, CONTACT_EMAIL,
  FEATURE_CARDS, HOW_IT_WORKS, SCREENSHOTS,
} from './content';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [NgOptimizedImage],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class LandingComponent {
  private doc = inject(DOCUMENT);

  readonly heroHeadline = HERO_HEADLINE;
  readonly heroSubhead = HERO_SUBHEAD;
  readonly finalCtaHeadline = FINAL_CTA_HEADLINE;
  readonly footerTagline = FOOTER_TAGLINE;
  readonly contactEmail = CONTACT_EMAIL;
  readonly features = FEATURE_CARDS;
  readonly steps = HOW_IT_WORKS;
  readonly screenshots = SCREENSHOTS;
  readonly stores = environment.stores;
  readonly year = new Date().getFullYear();

  readonly platform: Platform = detectPlatform(
    this.doc.defaultView?.navigator?.userAgent ?? ''
  );
}
```

- [ ] **Step 4: Create the template**

Create `frontend/src/app/features/landing/landing.html`:

```html
<main class="landing">
  <!-- HERO -->
  <section data-test="hero" class="hero">
    <div class="hero__copy">
      <img src="assets/landing/logomark.svg" alt="StepOver" class="hero__logo" />
      <h1 class="hero__headline">{{ heroHeadline }}</h1>
      <p class="hero__subhead">{{ heroSubhead }}</p>
      <div class="hero__cta" data-test="hero-cta">
        @if (platform === 'ios') {
          <a [href]="stores.appStoreUrl" class="badge badge--primary" data-test="badge-ios">
            <img src="assets/landing/badge-app-store.svg" alt="Download on the App Store" />
          </a>
          <a [href]="stores.playStoreUrl" class="badge badge--secondary" data-test="badge-android">
            <img src="assets/landing/badge-play-store.svg" alt="Get it on Google Play" />
          </a>
        } @else if (platform === 'android') {
          <a [href]="stores.playStoreUrl" class="badge badge--primary" data-test="badge-android">
            <img src="assets/landing/badge-play-store.svg" alt="Get it on Google Play" />
          </a>
          <a [href]="stores.appStoreUrl" class="badge badge--secondary" data-test="badge-ios">
            <img src="assets/landing/badge-app-store.svg" alt="Download on the App Store" />
          </a>
        } @else {
          <a [href]="stores.appStoreUrl" class="badge" data-test="badge-ios">
            <img src="assets/landing/badge-app-store.svg" alt="Download on the App Store" />
          </a>
          <a [href]="stores.playStoreUrl" class="badge" data-test="badge-android">
            <img src="assets/landing/badge-play-store.svg" alt="Get it on Google Play" />
          </a>
        }
      </div>
    </div>
    <div class="hero__visual">
      <img src="assets/landing/hero-phone.png" alt="StepOver app on phone" class="hero__phone" />
    </div>
  </section>

  <!-- FEATURE GRID -->
  <section class="features">
    <h2 class="section__heading">Six ways to play.</h2>
    <ul class="features__grid">
      @for (f of features; track f.name) {
        <li class="feature-card" data-test="feature-card">
          <img [src]="f.iconPath" [alt]="f.name" class="feature-card__icon" />
          <h3 class="feature-card__name">{{ f.name }}</h3>
          <p class="feature-card__desc">{{ f.description }}</p>
        </li>
      }
    </ul>
  </section>

  <!-- SCREENSHOTS -->
  <section data-test="screenshots" class="screenshots">
    <h2 class="section__heading">Built for your thumb.</h2>
    <div class="screenshots__strip">
      @for (src of screenshots; track src) {
        <img [src]="src" alt="App screenshot" class="screenshots__shot" />
      }
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section class="how">
    <h2 class="section__heading">How it works.</h2>
    <ol class="how__steps">
      @for (s of steps; track s.n) {
        <li class="how-step" data-test="how-step">
          <span class="how-step__num">{{ s.n }}</span>
          <h3 class="how-step__title">{{ s.title }}</h3>
          <p class="how-step__desc">{{ s.description }}</p>
        </li>
      }
    </ol>
  </section>

  <!-- FINAL CTA -->
  <section data-test="final-cta" class="final-cta">
    <h2 class="final-cta__headline">{{ finalCtaHeadline }}</h2>
    <div class="final-cta__badges">
      <a [href]="stores.appStoreUrl" class="badge">
        <img src="assets/landing/badge-app-store.svg" alt="Download on the App Store" />
      </a>
      <a [href]="stores.playStoreUrl" class="badge">
        <img src="assets/landing/badge-play-store.svg" alt="Get it on Google Play" />
      </a>
    </div>
  </section>

  <!-- FOOTER -->
  <footer data-test="footer" class="footer">
    <img src="assets/landing/logomark.svg" alt="StepOver" class="footer__logo" />
    <p class="footer__tagline">{{ footerTagline }}</p>
    <nav class="footer__links">
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
      <a [href]="'mailto:' + contactEmail">Contact</a>
    </nav>
    <p class="footer__copy">&copy; {{ year }} StepOver</p>
  </footer>
</main>
```

- [ ] **Step 5: Create minimal stylesheet**

Create `frontend/src/app/features/landing/landing.scss`:

```scss
:host { display: block; background: #0a0a0a; color: #fff; }
.landing { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

/* Typographic scale — hybrid: marketing-large on desktop, comfortable on mobile */
.hero__headline { font-size: 44px; line-height: 1.05; font-weight: 800; margin: 16px 0 12px; }
.hero__subhead  { font-size: 16px; line-height: 1.5; color: rgba(255,255,255,0.78); margin-bottom: 24px; }
.section__heading { font-size: 28px; line-height: 1.15; font-weight: 800; margin: 0 0 32px; }

/* Layout */
.hero { display: grid; grid-template-columns: 1fr; gap: 32px; padding: 48px 0; }
.hero__logo { width: 64px; height: 64px; }
.hero__cta { display: flex; gap: 12px; flex-wrap: wrap; }
.hero__phone { width: 100%; max-width: 320px; display: block; margin: 0 auto; }

.features { padding: 48px 0; }
.features__grid { display: grid; grid-template-columns: 1fr; gap: 16px; list-style: none; padding: 0; margin: 0; }
.feature-card {
  background: linear-gradient(180deg, rgba(212,175,55,0.12), rgba(212,175,55,0.04));
  border: 1px solid rgba(212,175,55,0.24);
  border-radius: 16px; padding: 20px;
}
.feature-card__icon { width: 40px; height: 40px; }
.feature-card__name { font-size: 18px; font-weight: 700; margin: 12px 0 4px; }
.feature-card__desc { font-size: 14px; color: rgba(255,255,255,0.72); margin: 0; }

.screenshots { padding: 48px 0; }
.screenshots__strip { display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 12px; }
.screenshots__shot { width: 240px; flex: 0 0 auto; scroll-snap-align: start; border-radius: 24px; }

.how { padding: 48px 0; }
.how__steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 24px; }
.how-step__num { display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: rgba(212,175,55,0.2); font-weight: 800; }
.how-step__title { font-size: 18px; font-weight: 700; margin: 12px 0 4px; }
.how-step__desc { font-size: 14px; color: rgba(255,255,255,0.72); margin: 0; }

.final-cta { padding: 64px 0; text-align: center; }
.final-cta__headline { font-size: 36px; font-weight: 800; margin: 0 0 24px; }
.final-cta__badges { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

.badge { display: inline-block; line-height: 0; }
.badge img { height: 56px; width: auto; }
.badge--secondary img { opacity: 0.65; height: 44px; }

.footer { padding: 48px 0 32px; text-align: center; color: rgba(255,255,255,0.6); font-size: 13px; }
.footer__logo { width: 32px; height: 32px; }
.footer__tagline { margin: 8px 0 16px; }
.footer__links { display: flex; gap: 20px; justify-content: center; margin-bottom: 16px; }
.footer__links a { color: rgba(255,255,255,0.72); text-decoration: none; }

/* Desktop breakpoint — hybrid marketing-scale */
@media (min-width: 768px) {
  .landing { padding: 0 32px; }
  .hero { grid-template-columns: 1.1fr 1fr; gap: 48px; padding: 96px 0; align-items: center; }
  .hero__headline { font-size: 72px; }
  .hero__subhead { font-size: 20px; }
  .section__heading { font-size: 44px; }
  .features, .screenshots, .how { padding: 96px 0; }
  .features__grid { grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .how__steps { grid-template-columns: repeat(3, 1fr); gap: 32px; }
  .final-cta__headline { font-size: 56px; }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx ng test --include='**/landing.spec.ts' --watch=false --browsers=ChromeHeadless 2>&1 | tail -20`
Expected: 6 specs pass.

- [ ] **Step 7: Verify CSS budget**

Run: `cd frontend && npx ng build --configuration development 2>&1 | tail -15`
Expected: build succeeds with no "exceeds budget" warning for `landing.scss`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/features/landing/
git commit -m "feat(landing): scaffold LandingComponent with 6 sections and hybrid visual system"
```

---

## Task 5: Platform-aware CTA test + integration with env stores

**Files:**
- Modify: `frontend/src/app/features/landing/landing.spec.ts`

- [ ] **Step 1: Add device-aware CTA tests**

Append to `frontend/src/app/features/landing/landing.spec.ts` (inside the `describe('LandingComponent', ...)` block):

```ts
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd frontend && npx ng test --include='**/landing.spec.ts' --watch=false --browsers=ChromeHeadless 2>&1 | tail -15`
Expected: 8 specs pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/landing/landing.spec.ts
git commit -m "test(landing): assert CTAs resolve to environment store URLs"
```

---

## Task 6: Conditional route wiring

**Files:**
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Read current routes**

Read `frontend/src/app/app.routes.ts` fully to confirm the current exported `routes` array.

- [ ] **Step 2: Replace with conditional routes**

Rewrite `frontend/src/app/app.routes.ts`:

```ts
import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { environment } from '../environments/environment';

const fullRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then(m => m.ShellComponent),
    children: [
      { path: '', loadComponent: () => import('./features/home/home').then(m => m.HomeComponent) },
      { path: 'today', loadComponent: () => import('./features/today/today').then(m => m.TodayComponent) },
      { path: 'invite', loadComponent: () => import('./features/invite/invite').then(m => m.InviteComponent) },
      { path: 'news', loadComponent: () => import('./features/news-mode/news-mode').then(m => m.NewsModeComponent) },
      { path: 'mayhem', loadComponent: () => import('./features/mayhem-mode/mayhem-mode').then(m => m.MayhemModeComponent) },
      { path: 'solo', loadComponent: () => import('./features/solo/solo').then(m => m.SoloComponent) },
      { path: 'blitz', loadComponent: () => import('./features/blitz/blitz').then(m => m.BlitzComponent) },
      { path: 'logo-quiz', loadComponent: () => import('./features/logo-quiz/logo-quiz').then(m => m.LogoQuizComponent), canActivate: [authGuard] },
      { path: 'daily', loadComponent: () => import('./features/daily/daily').then(m => m.DailyComponent) },
      { path: 'leaderboard', loadComponent: () => import('./features/leaderboard/leaderboard').then(m => m.LeaderboardComponent) },
      { path: 'notifications', loadComponent: () => import('./features/notifications/notifications').then(m => m.NotificationsComponent), canActivate: [authGuard] },
      { path: 'profile', loadComponent: () => import('./features/profile/profile').then(m => m.ProfileComponent) },
      { path: 'profile/:userId', loadComponent: () => import('./features/profile/profile').then(m => m.ProfileComponent), canActivate: [authGuard] },
      { path: 'duel', loadComponent: () => import('./features/duel/duel-lobby').then(m => m.DuelLobbyComponent), canActivate: [authGuard] },
      { path: 'battle-royale', canActivate: [authGuard], loadComponent: () => import('./features/battle-royale/battle-royale-lobby').then(m => m.BattleRoyaleLobbyComponent) },
      { path: 'analytics', canActivate: [authGuard], loadComponent: () => import('./features/analytics/analytics').then(m => m.AnalyticsComponent) },
    ],
  },
  { path: 'game', loadComponent: () => import('./features/game/game').then(m => m.GameComponent) },
  { path: 'online-game', canActivate: [authGuard], loadComponent: () => import('./features/online-game/online-lobby').then(m => m.OnlineLobbyComponent) },
  { path: 'online-game/:id', canActivate: [authGuard], loadComponent: () => import('./features/online-game/online-play').then(m => m.OnlinePlayComponent) },
  { path: 'join/:code', loadComponent: () => import('./features/online-game/join-invite').then(m => m.JoinInviteComponent) },
  { path: 'duel/:id', canActivate: [authGuard], loadComponent: () => import('./features/duel/duel-play').then(m => m.DuelPlayComponent) },
  { path: 'battle-royale/:id', canActivate: [authGuard], loadComponent: () => import('./features/battle-royale/battle-royale-play').then(m => m.BattleRoyalePlayComponent) },
  { path: 'match/:id', canActivate: [authGuard], loadComponent: () => import('./features/match-detail/match-detail').then(m => m.MatchDetailComponent) },
  { path: 'login', loadComponent: () => import('./features/login/login').then(m => m.LoginComponent) },
  { path: 'admin', loadComponent: () => import('./features/admin/admin-dashboard').then(m => m.AdminDashboardComponent) },
  { path: 'admin-legacy', loadComponent: () => import('./features/admin/admin-legacy').then(m => m.AdminLegacyComponent) },
  { path: 'onboarding', loadComponent: () => import('./features/onboarding/onboarding').then(m => m.OnboardingComponent) },
  { path: 'terms', loadComponent: () => import('./features/legal/terms').then(m => m.TermsComponent) },
  { path: 'privacy', loadComponent: () => import('./features/legal/privacy').then(m => m.PrivacyComponent) },
  { path: '**', loadComponent: () => import('./features/not-found/not-found').then(m => m.NotFoundComponent) },
];

const landingRoutes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing').then(m => m.LandingComponent) },
  { path: 'terms', loadComponent: () => import('./features/legal/terms').then(m => m.TermsComponent) },
  { path: 'privacy', loadComponent: () => import('./features/legal/privacy').then(m => m.PrivacyComponent) },
  { path: '**', redirectTo: '' },
];

export const routes: Routes = environment.landingMode ? landingRoutes : fullRoutes;
```

- [ ] **Step 3: Verify dev build still renders shell at `/`**

Run: `cd frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: build succeeds. `landingMode` is `false` in dev, so the app behaves exactly as before.

- [ ] **Step 4: Sanity-check landing mode by temporarily flipping the flag**

Temporarily edit `frontend/src/environments/environment.ts` and set `landingMode: true`. Run `cd frontend && npx ng build --configuration development 2>&1 | tail -5`. Expected: build succeeds. **Revert the flag back to `false`** before committing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app.routes.ts
git commit -m "feat(landing): conditionally swap to landing-only routes when landingMode is true"
```

---

## Task 7: Smart-banner meta tag in index.html

**Files:**
- Modify: `frontend/src/index.html`

- [ ] **Step 1: Read current index.html head**

Read the first 40 lines of `frontend/src/index.html` to find the `<head>` insertion point.

- [ ] **Step 2: Add the smart-banner meta tag**

Insert before the closing `</head>` tag:

```html
    <!-- iOS Safari smart-banner — resolves via environment.stores.appStoreId at launch. Placeholder ID is rendered as "XXXXXXXX" pre-launch, which iOS ignores safely. -->
    <meta name="apple-itunes-app" content="app-id=XXXXXXXX">
```

(The literal placeholder ID mirrors the env `stores.appStoreId`. On launch day both this and `environment.prod.ts` are updated to the real ID.)

- [ ] **Step 3: Verify index.html still parses**

Run: `cd frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.html
git commit -m "feat(landing): add apple-itunes-app smart-banner meta tag"
```

---

## Task 8: Related applications in manifest

**Files:**
- Modify: `frontend/public/manifest.webmanifest`

- [ ] **Step 1: Read current manifest**

Read `frontend/public/manifest.webmanifest` to see its current JSON shape.

- [ ] **Step 2: Add related_applications + prefer_related_applications**

Add these two top-level keys to the manifest JSON (preserving all existing keys):

```json
  "related_applications": [
    { "platform": "play", "id": "com.stepover.app" },
    { "platform": "itunes", "url": "https://apps.apple.com/app/idXXXXXXXX" }
  ],
  "prefer_related_applications": true
```

- [ ] **Step 3: Validate JSON**

Run: `python3 -c "import json; json.load(open('frontend/public/manifest.webmanifest'))" && echo OK`
Expected: `OK`.

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/manifest.webmanifest
git commit -m "feat(landing): add related_applications to webmanifest for Android install banner"
```

---

## Task 9: Placeholder assets

**Files:**
- Create: `frontend/src/assets/landing/logomark.svg` (reuse existing brand logo — copy from `frontend/src/assets/` if present, else 1×1 placeholder SVG)
- Create: `frontend/src/assets/landing/icon-{logo-quiz,duel,battle-royale,solo,mayhem,blitz}.svg`
- Create: `frontend/src/assets/landing/badge-{app-store,play-store}.svg`
- Create: `frontend/src/assets/landing/hero-phone.png`
- Create: `frontend/src/assets/landing/screenshot-{1..5}.png`

- [ ] **Step 1: Check for existing brand assets to reuse**

Run: `ls frontend/src/assets/ 2>/dev/null; find frontend/src/assets -maxdepth 2 -iname '*logo*' -o -iname 'app-store*' -o -iname 'play-store*' 2>/dev/null`
Expected: list of any already-committed brand assets.

- [ ] **Step 2: Create the landing assets directory and minimal placeholders**

For every asset not already in the repo, create a minimal SVG placeholder so the template renders without broken images. Example for icons:

```bash
mkdir -p frontend/src/assets/landing
for f in logomark icon-logo-quiz icon-duel icon-battle-royale icon-solo icon-mayhem icon-blitz badge-app-store badge-play-store; do
  cat > "frontend/src/assets/landing/$f.svg" <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="placeholder">
  <rect width="64" height="64" rx="12" fill="#d4af37" opacity="0.2"/>
  <text x="32" y="38" text-anchor="middle" font-family="system-ui" font-size="10" fill="#d4af37">TODO</text>
</svg>
EOF
done
```

For PNGs (hero phone + 5 screenshots), create empty placeholder files with a `TODO` marker file:

```bash
for f in hero-phone screenshot-1 screenshot-2 screenshot-3 screenshot-4 screenshot-5; do
  : > "frontend/src/assets/landing/$f.png.TODO"
done
```

(Keep `.TODO` sentinel files so the launch checklist can grep for them. The template's `<img>` tags will 404 until real PNGs replace them — this is intentional for dev, forcing the launch checklist to resolve them.)

- [ ] **Step 3: Add a README noting the asset contract**

Create `frontend/src/assets/landing/README.md`:

```markdown
# Landing page assets

Placeholder SVGs and `.TODO` sentinels live here until launch.

Before flipping `environment.prod.ts` `landingMode` to `true`:
- Replace every `.svg` with the real branded asset (logomark, 6 mode icons, 2 store badges).
- Add real PNGs for `hero-phone.png` and `screenshot-{1..5}.png` at 1080×2400 (approx).
- Remove all `.TODO` sentinel files.

Run `ls frontend/src/assets/landing/*.TODO` — if that command finds anything, the landing page is not ready for launch.
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/assets/landing/
git commit -m "chore(landing): add placeholder landing assets + launch-readiness README"
```

---

## Task 10: Version + changelog

**Files:**
- Modify: `VERSION`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump VERSION**

Overwrite `VERSION` with:

```
0.8.3.0
```

- [ ] **Step 2: Prepend new CHANGELOG entry**

Insert this block immediately after the `# Changelog` intro line and before the existing `## [0.8.2.2]` section:

```markdown
## [0.8.3.0] - 2026-04-17

### Added
- **Marketing landing page at `/` behind `environment.landingMode` flag.** New `LandingComponent` (`frontend/src/app/features/landing/`) renders a 6-section marketing page (hero, feature grid, screenshots, how-it-works, final CTA, footer) with device-aware App Store / Play Store CTAs via a pure `detectPlatform()` UA utility. When `landingMode` is `true` in `environment.prod.ts`, the app swaps from the full routes array to a landing-only routes array — `/`, `/terms`, `/privacy` resolve; every other path redirects to `/`. When `landingMode` is `false` (dev default), everything behaves as before. Launch-day cutover is a single boolean flip plus replacement of placeholder store URLs and assets. iOS smart-banner meta tag (`apple-itunes-app`) added to `index.html`; Android `related_applications` + `prefer_related_applications: true` added to `manifest.webmanifest` so the platforms surface native install prompts without a JS SDK. Visual direction is "Hybrid" — dark background, gold-glass accent panels matching the in-app Pro Arena vocabulary, but marketing-scale typography (hero H1 72px desktop / 44px mobile) and 96px section padding on desktop. All static copy lives in `content.ts` to keep the template lean. Unit tests assert all 6 sections render, feature grid has exactly 6 cards, how-it-works has exactly 3 steps, footer links resolve to `/terms` and `/privacy`, and both store URLs come from `environment.stores`. Placeholder assets and store URLs are marked with `TODO` and `.TODO` sentinel files so the launch checklist can grep-verify readiness.
```

- [ ] **Step 3: Commit**

```bash
git add VERSION CHANGELOG.md
git commit -m "chore(release): v0.8.3.0 — landing page feature"
```

---

## Task 11: Full test + build verification

- [ ] **Step 1: Run all landing unit tests**

Run: `cd frontend && npx ng test --include='**/landing/**/*.spec.ts' --watch=false --browsers=ChromeHeadless 2>&1 | tail -20`
Expected: all specs pass (7 detector + 8 component).

- [ ] **Step 2: Run full frontend build**

Run: `cd frontend && npx ng build --configuration production 2>&1 | tail -20`
Expected: build succeeds with no CSS-budget warning for the landing component.

- [ ] **Step 3: Manual smoke test — dev mode unchanged**

Run: `cd frontend && npx ng serve 2>&1` (background, stop after smoke test).
Open `http://localhost:4200/` — expected: current home page (shell with tabs) renders as before. Confirm a protected route like `/solo` still works.

- [ ] **Step 4: Manual smoke test — landing mode**

Temporarily flip `frontend/src/environments/environment.ts` `landingMode` to `true`, restart `ng serve`, open `http://localhost:4200/` — expected: landing page with all 6 sections, `/terms` and `/privacy` still work, any other path (e.g. `/solo`) redirects to `/`. **Revert the flag back to `false`** and stash any residual edits.

- [ ] **Step 5: Confirm no residual edits**

Run: `git status`
Expected: working tree clean.

---

## Self-Review Checklist (already run by plan author)

- Every spec section maps to at least one task: env flag (T1), platform detector (T2), content (T3), component + sections (T4), CTA wiring (T5), routes (T6), smart banners (T7, T8), assets (T9), version/changelog (T10), verification (T11). ✅
- No "TBD" / "implement later" — all code blocks are complete. ✅
- Every referenced property (`environment.stores`, `detectPlatform`, `LandingComponent`, `data-test="feature-card"`) is defined in the task that introduces it before being used in a later task. ✅
- Playwright is intentionally deferred (no setup in repo) — noted in the plan header. ✅
- Scope check: single feature, single plan. ✅
