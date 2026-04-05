# Monetization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate AdMob interstitial ads, update IAP pricing to 3-tier (monthly/yearly/lifetime), redesign paywall UI with yearly as recommended, add first-session ad suppression, and serve ad config from backend.

**Architecture:** AdMob via `@capacitor-community/admob` Capacitor plugin. A new `AdService` handles native interstitials (replacing the web-only `AdDisplayComponent`). Ad frequency is driven by a backend config endpoint (`GET /api/config/ads`) reading from the existing `app_settings` table. IAP adds a yearly subscription product alongside existing monthly/lifetime. The upgrade modal gets a 3-card layout with yearly pre-selected.

**Tech Stack:** Angular 20, NestJS, Supabase, Capacitor 7, `@capacitor-community/admob`, `cordova-plugin-purchase`

**Spec:** `docs/superpowers/specs/2026-04-05-monetization-marketing-design.md`

---

### Task 1: Install AdMob Capacitor Plugin

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/capacitor.config.ts` (if AdMob app ID needed)

- [ ] **Step 1: Install the AdMob plugin**

```bash
cd frontend && npm install @capacitor-community/admob
```

- [ ] **Step 2: Add AdMob App ID to capacitor config**

In `frontend/capacitor.config.ts`, add the AdMob plugin config. You need to create AdMob app IDs in the Google AdMob console first — use test IDs for development:

```typescript
plugins: {
  AdMob: {
    // Replace with real App IDs before release
    androidAppId: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY',
    iosAppId: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY',
  },
}
```

- [ ] **Step 3: Sync Capacitor**

```bash
npx cap sync
```

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/capacitor.config.ts
git commit -m "chore: install @capacitor-community/admob plugin"
```

---

### Task 2: Create AdService for Native Interstitials

**Files:**
- Create: `frontend/src/app/core/ad.service.ts`

This service wraps `@capacitor-community/admob` and manages interstitial lifecycle — loading, showing, frequency gating, first-session suppression, and Pro exemption.

- [ ] **Step 1: Create the AdService**

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AdMob, AdMobInterstitialOptions, AdLoadInfo } from '@capacitor-community/admob';
import { ProService } from './pro.service';
import { environment } from '../../environments/environment';

export interface AdConfig {
  answerReveal: { everyNthQuestion: number };
  endGame: { enabled: boolean };
  rewardedVideo: { enabled: boolean };
  firstSessionAdsDisabled: boolean;
}

const DEFAULT_AD_CONFIG: AdConfig = {
  answerReveal: { everyNthQuestion: 3 },
  endGame: { enabled: true },
  rewardedVideo: { enabled: false },
  firstSessionAdsDisabled: true,
};

// Google-provided test ad unit IDs — replace with real ones before release
const TEST_INTERSTITIAL_ANDROID = 'ca-app-pub-3940256099942544/1033173712';
const TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910';

const FIRST_SESSION_KEY = 'stepovr_first_session_done';

@Injectable({ providedIn: 'root' })
export class AdService {
  private pro = inject(ProService);
  private config = signal<AdConfig>(DEFAULT_AD_CONFIG);
  private questionsSinceLastAd = 0;
  private lastAdShownAt = 0;
  private initialized = false;
  private adLoaded = false;

  /** Whether this is the user's very first session (no games completed yet). */
  private get isFirstSession(): boolean {
    return !localStorage.getItem(FIRST_SESSION_KEY);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!Capacitor.isNativePlatform()) return; // AdMob is native-only

    await AdMob.initialize({ initializeForTesting: !environment.production });
    this.initialized = true;
    await this.preloadInterstitial();
  }

  /** Update ad config from backend response. */
  setConfig(config: AdConfig): void {
    this.config.set(config);
  }

  /** Call after each answer submission. Returns true if an ad was shown. */
  async onAnswerSubmitted(): Promise<boolean> {
    this.questionsSinceLastAd++;
    const frequency = this.config().answerReveal.everyNthQuestion;
    if (this.questionsSinceLastAd >= frequency) {
      return this.tryShowInterstitial();
    }
    return false;
  }

  /** Call when a game ends (results screen). Returns true if an ad was shown. */
  async onGameEnd(): Promise<boolean> {
    if (!this.config().endGame.enabled) return false;
    return this.tryShowInterstitial();
  }

  /** Mark first session as complete — future sessions will show ads. */
  markFirstSessionComplete(): void {
    localStorage.setItem(FIRST_SESSION_KEY, '1');
  }

  /** Reset question counter (call at start of each new game). */
  resetQuestionCounter(): void {
    this.questionsSinceLastAd = 0;
  }

  private async tryShowInterstitial(): Promise<boolean> {
    // Pro users never see ads
    if (this.pro.isPro()) return false;
    // First session suppression
    if (this.config().firstSessionAdsDisabled && this.isFirstSession) return false;
    // Native platform only
    if (!this.initialized) return false;
    // Minimum 30s between interstitials
    if (Date.now() - this.lastAdShownAt < 30_000) return false;

    try {
      if (!this.adLoaded) {
        await this.preloadInterstitial();
      }
      await AdMob.showInterstitial();
      this.lastAdShownAt = Date.now();
      this.questionsSinceLastAd = 0;
      this.adLoaded = false;
      // Pre-load next one
      this.preloadInterstitial();
      return true;
    } catch {
      // Ad not ready or failed — don't block gameplay
      return false;
    }
  }

  private async preloadInterstitial(): Promise<void> {
    if (!this.initialized) return;
    try {
      const adId = Capacitor.getPlatform() === 'ios'
        ? (environment.production ? environment.admobInterstitialIos : TEST_INTERSTITIAL_IOS)
        : (environment.production ? environment.admobInterstitialAndroid : TEST_INTERSTITIAL_ANDROID);

      const options: AdMobInterstitialOptions = { adId };
      await AdMob.prepareInterstitial(options);
      this.adLoaded = true;
    } catch {
      this.adLoaded = false;
    }
  }
}
```

- [ ] **Step 2: Add AdMob ad unit IDs to environment files**

In `frontend/src/environments/environment.ts` (development):
```typescript
admobInterstitialIos: '',
admobInterstitialAndroid: '',
```

In `frontend/src/environments/environment.prod.ts` (production):
```typescript
admobInterstitialIos: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',     // Replace with real ID
admobInterstitialAndroid: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY', // Replace with real ID
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/ad.service.ts frontend/src/environments/environment.ts frontend/src/environments/environment.prod.ts
git commit -m "feat: add AdService for native AdMob interstitials"
```

---

### Task 3: Backend Ad Config Endpoint

**Files:**
- Create: `backend/src/config/config.controller.ts`
- Create: `backend/src/config/config.module.ts`
- Modify: `backend/src/app.module.ts` (import ConfigModule)

The backend serves ad configuration from the `app_settings` table so ad frequency can be changed without an app update.

- [ ] **Step 1: Create the config controller**

```typescript
// backend/src/config/config.controller.ts
import { Controller, Get } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

interface AdConfig {
  answerReveal: { everyNthQuestion: number };
  endGame: { enabled: boolean };
  rewardedVideo: { enabled: boolean };
  firstSessionAdsDisabled: boolean;
}

const DEFAULT_AD_CONFIG: AdConfig = {
  answerReveal: { everyNthQuestion: 3 },
  endGame: { enabled: true },
  rewardedVideo: { enabled: false },
  firstSessionAdsDisabled: true,
};

@Controller('api/config')
export class ConfigController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get('ads')
  async getAdConfig(): Promise<AdConfig> {
    const raw = await this.supabase.getSetting('ad_config');
    if (!raw) return DEFAULT_AD_CONFIG;
    try {
      return { ...DEFAULT_AD_CONFIG, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_AD_CONFIG;
    }
  }
}
```

- [ ] **Step 2: Create the config module**

```typescript
// backend/src/config/config.module.ts
import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [ConfigController],
})
export class AppConfigModule {}
```

- [ ] **Step 3: Register AppConfigModule in AppModule**

In `backend/src/app.module.ts`, add to the imports array:

```typescript
import { AppConfigModule } from './config/config.module';

// In @Module({ imports: [...] })
AppConfigModule,
```

- [ ] **Step 4: Seed default ad config in app_settings**

Run in Supabase SQL editor or create a migration:

```sql
INSERT INTO app_settings (key, value)
VALUES ('ad_config', '{"answerReveal":{"everyNthQuestion":3},"endGame":{"enabled":true},"rewardedVideo":{"enabled":false},"firstSessionAdsDisabled":true}')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/config.controller.ts backend/src/config/config.module.ts backend/src/app.module.ts
git commit -m "feat: add GET /api/config/ads endpoint for server-driven ad config"
```

---

### Task 4: Frontend Fetches Ad Config on App Init

**Files:**
- Create: `frontend/src/app/core/config-api.service.ts`
- Modify: `frontend/src/app/app.component.ts` (or wherever app init happens)

- [ ] **Step 1: Create ConfigApiService**

```typescript
// frontend/src/app/core/config-api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AdConfig, AdService } from './ad.service';

@Injectable({ providedIn: 'root' })
export class ConfigApiService {
  private http = inject(HttpClient);
  private adService = inject(AdService);
  private base = `${environment.apiUrl}/api/config`;

  async loadAdConfig(): Promise<void> {
    try {
      const config = await firstValueFrom(
        this.http.get<AdConfig>(`${this.base}/ads`),
      );
      this.adService.setConfig(config);
    } catch {
      // Use defaults — non-fatal
    }
  }
}
```

- [ ] **Step 2: Call loadAdConfig + initialize AdMob on app startup**

Find the app initialization point (likely `app.component.ts` or shell component `ngOnInit`) and add:

```typescript
private configApi = inject(ConfigApiService);
private adService = inject(AdService);

// In ngOnInit or constructor effect:
this.configApi.loadAdConfig();
this.adService.initialize();
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/config-api.service.ts frontend/src/app/app.component.ts
git commit -m "feat: fetch ad config from backend on app init"
```

---

### Task 5: Integrate Ads into Game Modes

**Files:**
- Modify: `frontend/src/app/features/solo/solo.ts`
- Modify: `frontend/src/app/features/blitz/blitz.ts`
- Modify: `frontend/src/app/features/logo-quiz/logo-quiz.ts`
- Modify: `frontend/src/app/features/duel/duel-play.ts`

For each game mode, inject `AdService` and call `onAnswerSubmitted()` after answer reveal and `onGameEnd()` when the game finishes. The AdService handles all gating logic (Pro check, first-session, frequency, 30s cooldown).

- [ ] **Step 1: Solo mode — inject AdService and add ad triggers**

In `frontend/src/app/features/solo/solo.ts`:

```typescript
// Add import
import { AdService } from '../../core/ad.service';

// Add injection
private adService = inject(AdService);
```

In the `startSession()` method (or wherever a new game begins), add:
```typescript
this.adService.resetQuestionCounter();
```

In the `doSubmit()` method, after `this.revealing.set(true)` (line ~249), add:
```typescript
// Show interstitial during answer reveal suspense
await this.adService.onAnswerSubmitted();
```

In the `endSession()` method, after `this.phase.set('finished')` (line ~279), add:
```typescript
this.adService.markFirstSessionComplete();
await this.adService.onGameEnd();
```

- [ ] **Step 2: Blitz mode — inject AdService and add ad triggers**

In `frontend/src/app/features/blitz/blitz.ts`:

```typescript
import { AdService } from '../../core/ad.service';

private adService = inject(AdService);
```

At game start (session creation):
```typescript
this.adService.resetQuestionCounter();
```

In `selectChoice()` after answer result is received:
```typescript
await this.adService.onAnswerSubmitted();
```

In `finishSession()` after `this.phase.set('finished')`:
```typescript
this.adService.markFirstSessionComplete();
await this.adService.onGameEnd();
```

- [ ] **Step 3: Logo Quiz mode — inject AdService and add ad triggers**

In `frontend/src/app/features/logo-quiz/logo-quiz.ts`:

```typescript
import { AdService } from '../../core/ad.service';

private adService = inject(AdService);
```

At session start:
```typescript
this.adService.resetQuestionCounter();
```

After answer submission result:
```typescript
await this.adService.onAnswerSubmitted();
```

At session end:
```typescript
this.adService.markFirstSessionComplete();
await this.adService.onGameEnd();
```

- [ ] **Step 4: Duel mode — inject AdService and add end-game ad**

In `frontend/src/app/features/duel/duel-play.ts`:

```typescript
import { AdService } from '../../core/ad.service';

private adService = inject(AdService);
```

Duels are real-time multiplayer so only show ads at game end, not during questions (would desync players). When `store.phase()` transitions to `'finished'`:

```typescript
this.adService.markFirstSessionComplete();
await this.adService.onGameEnd();
```

**Do NOT add `onAnswerSubmitted()` to duels** — the opponent would keep playing while you watch an ad.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/solo/solo.ts frontend/src/app/features/blitz/blitz.ts frontend/src/app/features/logo-quiz/logo-quiz.ts frontend/src/app/features/duel/duel-play.ts
git commit -m "feat: integrate AdMob interstitials into Solo, Blitz, Logo Quiz, and Duel modes"
```

---

### Task 6: Add Yearly IAP Product

**Files:**
- Modify: `frontend/src/app/core/iap.service.ts`
- Modify: `backend/src/subscription/subscription.controller.ts` (if yearly needs distinct validation)

The yearly product must be created in App Store Connect and Google Play Console separately. In code, we register it alongside monthly and lifetime.

- [ ] **Step 1: Add yearly product constant and registration**

In `frontend/src/app/core/iap.service.ts`:

Add the new constant (line ~29):
```typescript
const PRODUCT_YEARLY = 'stepovr_pro_yearly';
```

In the `initialize()` method, add to the `store.register` array (line ~71):
```typescript
{
  id: PRODUCT_YEARLY,
  type: CdvPurchase.ProductType.PAID_SUBSCRIPTION,
  platform,
},
```

- [ ] **Step 2: Add purchaseYearly method**

After `purchaseLifetime()` (line ~111):
```typescript
/** Trigger native yearly subscription purchase. */
async purchaseYearly(): Promise<void> {
  await this.purchase(PRODUCT_YEARLY);
}
```

- [ ] **Step 3: Update refreshProducts to include yearly**

In `refreshProducts()`, after the monthly block (line ~205), add:

```typescript
const yearly = this.store.get(PRODUCT_YEARLY);
if (yearly) {
  const pricing = yearly.pricing;
  mapped.push({
    id: PRODUCT_YEARLY,
    title: yearly.title || 'STEPOVR Pro Yearly',
    description: yearly.description || 'Annual subscription',
    price: pricing?.price || '$14.99',
    priceMicros: pricing?.priceMicros || 14990000,
    currency: pricing?.currency || 'USD',
    type: 'subscription',
  });
}
```

- [ ] **Step 4: Update fallback prices**

Update the monthly fallback price from `$2.99` to `$3.99` (line ~200):
```typescript
price: pricing?.price || '$3.99',
priceMicros: pricing?.priceMicros || 3990000,
```

Update the lifetime fallback price from `$9.99` to `$19.99` (line ~213):
```typescript
price: pricing?.price || '$19.99',
priceMicros: pricing?.priceMicros || 19990000,
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/iap.service.ts
git commit -m "feat: add yearly IAP product and update fallback pricing"
```

---

### Task 7: Redesign Paywall UI with 3-Tier Pricing

**Files:**
- Modify: `frontend/src/app/shared/upgrade-modal/upgrade-modal.ts`
- Modify: `frontend/src/app/shared/upgrade-modal/upgrade-modal.html`
- Modify: `frontend/src/app/shared/upgrade-modal/upgrade-modal.css`

The upgrade modal currently has 2 pricing cards (monthly + lifetime). Redesign to 3 cards with yearly pre-selected and marked as "BEST VALUE", savings percentage shown.

- [ ] **Step 1: Update component to support 3 plans**

In `frontend/src/app/shared/upgrade-modal/upgrade-modal.ts`:

Update the selectedPlan type and default (line 18):
```typescript
selectedPlan = signal<'monthly' | 'yearly' | 'lifetime'>('yearly');
```

Add yearly product signal (after line 24):
```typescript
yearlyProduct = signal<IAPProduct | null>(null);
```

Update `loadProducts()` to find yearly (line 36-38):
```typescript
const products = this.iap.getProducts();
this.monthlyProduct.set(products.find(p => p.id === 'stepovr_pro_monthly') ?? null);
this.yearlyProduct.set(products.find(p => p.id === 'stepovr_pro_yearly') ?? null);
this.lifetimeProduct.set(products.find(p => p.id === 'stepovr_pro_lifetime') ?? null);
```

Update `selectPlan` signature (line 46):
```typescript
selectPlan(plan: 'monthly' | 'yearly' | 'lifetime'): void {
  this.selectedPlan.set(plan);
}
```

Update `selectedPrice` getter:
```typescript
get selectedPrice(): string {
  switch (this.selectedPlan()) {
    case 'monthly': return this.monthlyProduct()?.price ?? '$3.99/mo';
    case 'yearly': return this.yearlyProduct()?.price ?? '$14.99/yr';
    case 'lifetime': return this.lifetimeProduct()?.price ?? '$19.99';
  }
}
```

Update `selectedCtaLabel` getter:
```typescript
get selectedCtaLabel(): string {
  switch (this.selectedPlan()) {
    case 'monthly': {
      const price = this.monthlyProduct()?.price ?? '$3.99';
      return `Continue — ${price}/mo`;
    }
    case 'yearly': {
      const price = this.yearlyProduct()?.price ?? '$14.99';
      return `Continue — ${price}/yr`;
    }
    case 'lifetime': {
      const price = this.lifetimeProduct()?.price ?? '$19.99';
      return `Continue — ${price}`;
    }
  }
}
```

Update `subscribe()` to handle yearly (line 72-76):
```typescript
switch (this.selectedPlan()) {
  case 'monthly': await this.iap.purchaseMonthly(); break;
  case 'yearly': await this.iap.purchaseYearly(); break;
  case 'lifetime': await this.iap.purchaseLifetime(); break;
}
```

Add a computed for monthly-equivalent price display:
```typescript
get yearlySavingsLabel(): string {
  const monthlyPrice = this.monthlyProduct()?.priceMicros ?? 3990000;
  const yearlyPrice = this.yearlyProduct()?.priceMicros ?? 14990000;
  const monthlyEquiv = yearlyPrice / 12;
  const savings = Math.round((1 - monthlyEquiv / monthlyPrice) * 100);
  return `Save ${savings}%`;
}
```

- [ ] **Step 2: Update the template for 3 pricing cards**

Replace the `pricing-cards` section in `frontend/src/app/shared/upgrade-modal/upgrade-modal.html`:

```html
<!-- Pricing cards -->
<div class="pricing-cards">
  <!-- Monthly -->
  <button
    class="pricing-card"
    [class.pricing-card--selected]="selectedPlan() === 'monthly'"
    (click)="selectPlan('monthly')"
  >
    @if (state() === 'loading') {
      <span class="price-skeleton"></span>
      <span class="label-skeleton"></span>
    } @else {
      <span class="pricing-card__price">{{ monthlyProduct()?.price ?? '$3.99' }}</span>
      <span class="pricing-card__label">/ month</span>
    }
  </button>

  <!-- Yearly (recommended) -->
  <button
    class="pricing-card pricing-card--featured"
    [class.pricing-card--selected]="selectedPlan() === 'yearly'"
    (click)="selectPlan('yearly')"
  >
    <span class="best-value-pill">BEST VALUE</span>
    @if (state() === 'loading') {
      <span class="price-skeleton"></span>
      <span class="label-skeleton"></span>
    } @else {
      <span class="pricing-card__price">{{ yearlyProduct()?.price ?? '$14.99' }}</span>
      <span class="pricing-card__label">/ year</span>
      <span class="pricing-card__savings">{{ yearlySavingsLabel }}</span>
    }
  </button>

  <!-- Lifetime -->
  <button
    class="pricing-card"
    [class.pricing-card--selected]="selectedPlan() === 'lifetime'"
    (click)="selectPlan('lifetime')"
  >
    @if (state() === 'loading') {
      <span class="price-skeleton"></span>
      <span class="label-skeleton"></span>
    } @else {
      <span class="pricing-card__price">{{ lifetimeProduct()?.price ?? '$19.99' }}</span>
      <span class="pricing-card__label">one time</span>
    }
  </button>
</div>
```

- [ ] **Step 3: Add CSS for 3-card layout and savings badge**

In `frontend/src/app/shared/upgrade-modal/upgrade-modal.css`, add:

```css
/* Featured card (yearly) — slightly larger */
.pricing-card--featured {
  transform: scale(1.05);
  border-color: var(--color-accent);
  background: rgba(0, 122, 255, 0.06);
}

/* Savings badge inside yearly card */
.pricing-card__savings {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-accent);
  margin-top: 0.125rem;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/shared/upgrade-modal/upgrade-modal.ts frontend/src/app/shared/upgrade-modal/upgrade-modal.html frontend/src/app/shared/upgrade-modal/upgrade-modal.css
git commit -m "feat: redesign paywall with 3-tier pricing, yearly as recommended"
```

---

### Task 8: Update App Store / Play Store Product Configuration

This is a manual task — no code changes, but critical for IAP to work.

- [ ] **Step 1: Apple App Store Connect**

1. Go to App Store Connect → Your App → Subscriptions
2. Create subscription group "STEPOVR Pro" if not exists
3. Add product `stepovr_pro_yearly` as auto-renewable subscription at $14.99/year
4. Update `stepovr_pro_monthly` price to $3.99/month
5. Update `stepovr_pro_lifetime` (non-consumable) price to $19.99
6. Submit for review if pricing changes require it

- [ ] **Step 2: Google Play Console**

1. Go to Google Play Console → Your App → Monetize → Products
2. Add subscription `stepovr_pro_yearly` at $14.99/year with base plan
3. Update `stepovr_pro_monthly` base plan to $3.99/month
4. Update `stepovr_pro_lifetime` (one-time product) to $19.99

- [ ] **Step 3: Update environment files with real AdMob IDs**

After creating ad units in the AdMob console:

In `frontend/src/environments/environment.prod.ts`:
```typescript
admobInterstitialIos: 'ca-app-pub-REAL/REAL',
admobInterstitialAndroid: 'ca-app-pub-REAL/REAL',
```

In `frontend/capacitor.config.ts`:
```typescript
AdMob: {
  androidAppId: 'ca-app-pub-REAL~REAL',
  iosAppId: 'ca-app-pub-REAL~REAL',
},
```

---

### Task 9: Analytics Events for Monetization Funnel

**Files:**
- Modify: `frontend/src/app/core/ad.service.ts`
- Modify: `frontend/src/app/shared/upgrade-modal/upgrade-modal.ts`

Track key funnel events via the existing PosthogService.

- [ ] **Step 1: Track ad impressions in AdService**

In `frontend/src/app/core/ad.service.ts`, inject PosthogService and track in `tryShowInterstitial()` after a successful show:

```typescript
import { PosthogService } from './posthog.service';

private posthog = inject(PosthogService);

// After `await AdMob.showInterstitial()` succeeds:
this.posthog.track('ad_interstitial_shown', {
  trigger: 'answer_reveal', // or 'game_end' — pass as parameter
});
```

Update `onAnswerSubmitted` and `onGameEnd` to pass a trigger context to `tryShowInterstitial`.

- [ ] **Step 2: Track paywall events in UpgradeModalComponent**

In `frontend/src/app/shared/upgrade-modal/upgrade-modal.ts`, inject PosthogService:

```typescript
private posthog = inject(PosthogService);
```

Track these events:
- In `ngOnInit`: `this.posthog.track('paywall_viewed', { context: this.pro.triggerContext() });`
- In `subscribe()` before purchase: `this.posthog.track('paywall_purchase_started', { plan: this.selectedPlan() });`
- After successful purchase: `this.posthog.track('paywall_purchase_completed', { plan: this.selectedPlan() });`
- In `close()`: `this.posthog.track('paywall_dismissed', { context: this.pro.triggerContext() });`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/ad.service.ts frontend/src/app/shared/upgrade-modal/upgrade-modal.ts
git commit -m "feat: add analytics events for ad impressions and paywall funnel"
```

---

### Task 10: Verification & Testing

- [ ] **Step 1: Verify backend ad config endpoint**

```bash
cd backend && npm run build
```

Start the backend and test:
```bash
curl http://localhost:3000/api/config/ads
```

Expected response:
```json
{"answerReveal":{"everyNthQuestion":3},"endGame":{"enabled":true},"rewardedVideo":{"enabled":false},"firstSessionAdsDisabled":true}
```

- [ ] **Step 2: Verify frontend builds**

```bash
cd frontend && ng build
```

Expected: build succeeds with no type errors.

- [ ] **Step 3: Test ad flow on device**

1. Run on iOS simulator or Android emulator via Capacitor
2. Play a Solo game as a non-Pro user
3. Verify: no ads during first game session
4. Complete the game (marks first session done)
5. Start a second game
6. Answer 3 questions — interstitial should appear after the 3rd
7. End the game — interstitial should appear on results
8. Toggle Pro status on — verify zero ads appear

- [ ] **Step 4: Test paywall UI**

1. Trigger upgrade modal (hit duel daily limit or tap upgrade)
2. Verify: 3 pricing cards displayed (monthly, yearly, lifetime)
3. Verify: yearly is pre-selected and shows "BEST VALUE" pill + savings %
4. Verify: selecting each card updates the CTA button text
5. Test purchase flow with sandbox accounts (Apple/Google)

- [ ] **Step 5: Test config override**

Update `app_settings` in Supabase:
```sql
UPDATE app_settings
SET value = '{"answerReveal":{"everyNthQuestion":2},"endGame":{"enabled":true},"rewardedVideo":{"enabled":false},"firstSessionAdsDisabled":true}'
WHERE key = 'ad_config';
```

Restart the app — ads should now appear every 2nd question instead of every 3rd.

- [ ] **Step 6: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix: address issues found during monetization testing"
```
