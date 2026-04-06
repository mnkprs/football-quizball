# Subscription Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify from 3 subscription tiers (monthly/yearly/lifetime) to 2 (monthly $3.99 + lifetime $14.99), remove all yearly plan code, update paywall UI, and update fallback prices.

**Architecture:** Remove the yearly product constant, registration, purchase method, and UI card from both frontend and backend. Update lifetime fallback price from $19.99 to $14.99. The "BEST VALUE" badge moves from yearly to lifetime. Backend keeps yearly webhook handling temporarily (with a TODO comment) for existing subscribers.

**Tech Stack:** Angular 20 (standalone components, signals), NestJS, cordova-plugin-purchase (CdvPurchase)

**Spec:** `docs/superpowers/specs/2026-04-06-subscription-refinement-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `frontend/src/app/core/iap.service.ts` | Remove yearly product constant, registration, and purchase method |
| Modify | `frontend/src/app/shared/upgrade-modal/upgrade-modal.ts` | Remove yearly signal, plan option, getters; default selection to lifetime |
| Modify | `frontend/src/app/shared/upgrade-modal/upgrade-modal.html` | Remove yearly pricing card; move "BEST VALUE" to lifetime card |
| Modify | `frontend/src/app/shared/upgrade-modal/upgrade-modal.css` | Repurpose `--featured` styles from yearly to lifetime card; adjust 2-card layout |
| Modify | `backend/src/subscription/iap-validation.service.ts` | Remove yearly from subscription product arrays; add TODO for future cleanup |

---

### Task 1: Remove yearly product from IAP service

**Files:**
- Modify: `frontend/src/app/core/iap.service.ts`

- [ ] **Step 1: Remove yearly constant and product registration**

In `frontend/src/app/core/iap.service.ts`, remove the `PRODUCT_YEARLY` constant (line 29) and its store registration block (lines 78-81):

```typescript
// BEFORE (lines 28-30):
const PRODUCT_MONTHLY = 'stepovr_pro_monthly';
const PRODUCT_YEARLY = 'stepovr_pro_yearly';
const PRODUCT_LIFETIME = 'stepovr_pro_lifetime';

// AFTER:
const PRODUCT_MONTHLY = 'stepovr_pro_monthly';
const PRODUCT_LIFETIME = 'stepovr_pro_lifetime';
```

In the `register()` call (lines 72-88), remove the yearly registration object:

```typescript
// BEFORE:
store.register([
  {
    id: PRODUCT_MONTHLY,
    type: CdvPurchase.ProductType.PAID_SUBSCRIPTION,
    platform,
  },
  {
    id: PRODUCT_YEARLY,
    type: CdvPurchase.ProductType.PAID_SUBSCRIPTION,
    platform,
  },
  {
    id: PRODUCT_LIFETIME,
    type: CdvPurchase.ProductType.NON_CONSUMABLE,
    platform,
  },
]);

// AFTER:
store.register([
  {
    id: PRODUCT_MONTHLY,
    type: CdvPurchase.ProductType.PAID_SUBSCRIPTION,
    platform,
  },
  {
    id: PRODUCT_LIFETIME,
    type: CdvPurchase.ProductType.NON_CONSUMABLE,
    platform,
  },
]);
```

- [ ] **Step 2: Remove purchaseYearly method**

Remove the `purchaseYearly()` method (lines 115-117):

```typescript
// DELETE these lines:
/** Trigger native yearly subscription purchase. */
async purchaseYearly(): Promise<void> {
  await this.purchase(PRODUCT_YEARLY);
}
```

- [ ] **Step 3: Remove yearly from refreshProducts and update lifetime fallback price**

In `refreshProducts()`, remove the entire yearly block (lines 218-230) and update the lifetime fallback price from `$19.99` to `$14.99` and priceMicros from `19990000` to `14990000`:

```typescript
// DELETE the yearly block (lines 218-230):
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

// UPDATE lifetime fallback (lines 232-244):
// Change '$19.99' → '$14.99' and 19990000 → 14990000
const lifetime = this.store.get(PRODUCT_LIFETIME);
if (lifetime) {
  const pricing = lifetime.pricing;
  mapped.push({
    id: PRODUCT_LIFETIME,
    title: lifetime.title || 'STEPOVR Pro Lifetime',
    description: lifetime.description || 'One-time purchase',
    price: pricing?.price || '$14.99',
    priceMicros: pricing?.priceMicros || 14990000,
    currency: pricing?.currency || 'USD',
    type: 'non-consumable',
  });
}
```

- [ ] **Step 4: Verify the build compiles**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds with no errors referencing `PRODUCT_YEARLY` or `purchaseYearly`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/iap.service.ts
git commit -m "refactor(iap): remove yearly product, update lifetime fallback to \$14.99"
```

---

### Task 2: Remove yearly from upgrade modal component

**Files:**
- Modify: `frontend/src/app/shared/upgrade-modal/upgrade-modal.ts`

- [ ] **Step 1: Remove yearly signal and update selectedPlan type/default**

In `upgrade-modal.ts`, change the `selectedPlan` signal type and default from `'yearly'` to `'lifetime'`. Remove the `yearlyProduct` signal:

```typescript
// BEFORE (line 20):
selectedPlan = signal<'monthly' | 'yearly' | 'lifetime'>('yearly');

// AFTER:
selectedPlan = signal<'monthly' | 'lifetime'>('lifetime');

// BEFORE (line 26):
yearlyProduct = signal<IAPProduct | null>(null);

// DELETE line 26 entirely
```

- [ ] **Step 2: Remove yearly from loadProducts**

In `loadProducts()`, remove the yearly product lookup (line 41):

```typescript
// DELETE this line:
this.yearlyProduct.set(products.find(p => p.id === 'stepovr_pro_yearly') ?? null);
```

- [ ] **Step 3: Remove yearly from selectPlan type**

Update the `selectPlan` method signature (line 51):

```typescript
// BEFORE:
selectPlan(plan: 'monthly' | 'yearly' | 'lifetime'): void {

// AFTER:
selectPlan(plan: 'monthly' | 'lifetime'): void {
```

- [ ] **Step 4: Remove yearly from selectedPrice getter**

Update `get selectedPrice` (lines 55-60) to remove the yearly case and update lifetime fallback:

```typescript
// BEFORE:
get selectedPrice(): string {
  switch (this.selectedPlan()) {
    case 'monthly': return this.monthlyProduct()?.price ?? '$3.99/mo';
    case 'yearly': return this.yearlyProduct()?.price ?? '$14.99/yr';
    case 'lifetime': return this.lifetimeProduct()?.price ?? '$19.99';
  }
}

// AFTER:
get selectedPrice(): string {
  switch (this.selectedPlan()) {
    case 'monthly': return this.monthlyProduct()?.price ?? '$3.99/mo';
    case 'lifetime': return this.lifetimeProduct()?.price ?? '$14.99';
  }
}
```

- [ ] **Step 5: Remove yearly from selectedCtaLabel getter**

Update `get selectedCtaLabel` (lines 63-78) to remove the yearly case and update lifetime fallback:

```typescript
// BEFORE:
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

// AFTER:
get selectedCtaLabel(): string {
  switch (this.selectedPlan()) {
    case 'monthly': {
      const price = this.monthlyProduct()?.price ?? '$3.99';
      return `Continue — ${price}/mo`;
    }
    case 'lifetime': {
      const price = this.lifetimeProduct()?.price ?? '$14.99';
      return `Continue — ${price}`;
    }
  }
}
```

- [ ] **Step 6: Remove yearlySavingsLabel and yearlyPerMonthLabel getters**

Delete the `yearlySavingsLabel` getter (lines 80-86) and `yearlyPerMonthLabel` getter (lines 89-98) entirely:

```typescript
// DELETE both getters:
get yearlySavingsLabel(): string {
  const monthlyPrice = this.monthlyProduct()?.priceMicros ?? 3990000;
  const yearlyPrice = this.yearlyProduct()?.priceMicros ?? 14990000;
  const monthlyEquiv = yearlyPrice / 12;
  const savings = Math.max(0, Math.round((1 - monthlyEquiv / monthlyPrice) * 100));
  return `Save ${savings}%`;
}

get yearlyPerMonthLabel(): string {
  const yearlyMicros = this.yearlyProduct()?.priceMicros ?? 14990000;
  const currency = this.yearlyProduct()?.currency ?? 'USD';
  const perMonth = yearlyMicros / 12 / 1000000;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(perMonth);
  } catch {
    return `$${perMonth.toFixed(2)}`;
  }
}
```

- [ ] **Step 7: Remove yearly from subscribe method**

In the `subscribe()` method (lines 100-126), remove the yearly case:

```typescript
// BEFORE (lines 107-110):
switch (this.selectedPlan()) {
  case 'monthly': await this.iap.purchaseMonthly(); break;
  case 'yearly': await this.iap.purchaseYearly(); break;
  case 'lifetime': await this.iap.purchaseLifetime(); break;
}

// AFTER:
switch (this.selectedPlan()) {
  case 'monthly': await this.iap.purchaseMonthly(); break;
  case 'lifetime': await this.iap.purchaseLifetime(); break;
}
```

- [ ] **Step 8: Verify the build compiles**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds with no errors referencing yearly signals or getters.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/shared/upgrade-modal/upgrade-modal.ts
git commit -m "refactor(paywall): remove yearly plan from upgrade modal component"
```

---

### Task 3: Update upgrade modal template (2-card layout + lifetime as featured)

**Files:**
- Modify: `frontend/src/app/shared/upgrade-modal/upgrade-modal.html`

- [ ] **Step 1: Replace 3-card pricing section with 2-card layout**

In `upgrade-modal.html`, replace the entire `pricing-cards` div (lines 38-88) with:

```html
<!-- Pricing cards -->
<div class="pricing-cards" role="radiogroup" aria-label="Choose a plan">
  <!-- Monthly -->
  <button class="pricing-card"
    role="radio"
    [attr.aria-checked]="selectedPlan() === 'monthly'"
    [class.pricing-card--selected]="selectedPlan() === 'monthly'"
    (click)="selectPlan('monthly')"
    aria-label="Monthly plan">
    @if (state() === 'loading') {
      <span class="price-skeleton"></span>
      <span class="label-skeleton"></span>
    } @else {
      <span class="pricing-card__price">{{ monthlyProduct()?.price ?? '$3.99' }}</span>
      <span class="pricing-card__label">/ month</span>
      <span class="pricing-card__trial">3-day free trial</span>
    }
  </button>

  <!-- Lifetime (featured) -->
  <button class="pricing-card pricing-card--featured"
    role="radio"
    [attr.aria-checked]="selectedPlan() === 'lifetime'"
    [class.pricing-card--selected]="selectedPlan() === 'lifetime'"
    (click)="selectPlan('lifetime')"
    aria-label="Lifetime plan, best value, one-time purchase">
    <span class="best-value-pill">BEST VALUE</span>
    @if (state() === 'loading') {
      <span class="price-skeleton"></span>
      <span class="label-skeleton"></span>
    } @else {
      <span class="pricing-card__price">{{ lifetimeProduct()?.price ?? '$14.99' }}</span>
      <span class="pricing-card__label">forever</span>
    }
  </button>
</div>
```

Key changes:
- Yearly card removed entirely
- Lifetime card gets `pricing-card--featured` class and `best-value-pill`
- Monthly card gets "3-day free trial" sub-label (new `pricing-card__trial` span)
- Lifetime fallback price updated from `$19.99` to `$14.99`

- [ ] **Step 2: Verify the build compiles**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds. No template errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/shared/upgrade-modal/upgrade-modal.html
git commit -m "refactor(paywall): 2-card layout with lifetime as featured"
```

---

### Task 4: Update upgrade modal CSS for 2-card layout

**Files:**
- Modify: `frontend/src/app/shared/upgrade-modal/upgrade-modal.css`

- [ ] **Step 1: Update stagger animation delays for 2 cards**

The current CSS has 3 stagger delays (lines 106-108). Update to 2:

```css
/* BEFORE: */
.pricing-card:nth-child(1) { animation-delay: 200ms; }
.pricing-card:nth-child(2) { animation-delay: 280ms; }
.pricing-card:nth-child(3) { animation-delay: 360ms; }

/* AFTER: */
.pricing-card:nth-child(1) { animation-delay: 200ms; }
.pricing-card:nth-child(2) { animation-delay: 300ms; }
```

- [ ] **Step 2: Add the trial label style**

Add a new style for the `pricing-card__trial` element after the `.pricing-card__label` rule (after line 142):

```css
.pricing-card__trial {
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 500;
  color: #60a5fa;
  margin-top: 0.125rem;
}
```

- [ ] **Step 3: Remove yearly-specific CSS that is no longer needed**

Delete the `pricing-card__per-month` styles (lines 207-219), the `pricing-card__billed` style (lines 222-228), and the `pricing-card__savings` style (lines 231-242) — these were only used by the yearly card:

```css
/* DELETE all of these: */

.pricing-card__per-month { ... }
.pricing-card__per-month-unit { ... }
.pricing-card__billed { ... }
.pricing-card__savings { ... }
```

- [ ] **Step 4: Update the featured card comment**

Change the CSS comment on line 184 from `/* ── Featured card (yearly) ── */` to `/* ── Featured card (lifetime) ── */`.

- [ ] **Step 5: Verify the build compiles and visually inspect**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds with no CSS warnings.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/shared/upgrade-modal/upgrade-modal.css
git commit -m "refactor(paywall): update CSS for 2-card layout, add trial label"
```

---

### Task 5: Remove yearly from backend IAP validation

**Files:**
- Modify: `backend/src/subscription/iap-validation.service.ts`

- [ ] **Step 1: Add TODO comments to yearly product arrays (keep for existing subscribers)**

In `iap-validation.service.ts`, the `getApplePurchaseType` and `getGooglePurchaseType` methods use these arrays to classify product IDs. Existing yearly subscribers may still trigger receipt re-validation, so we keep `stepovr_pro_yearly` in the arrays but add TODO comments for future cleanup:

```typescript
// BEFORE (line 16):
const APPLE_SUBSCRIPTION_PRODUCTS = ['stepovr_pro_monthly', 'stepovr_pro_yearly'];

// AFTER:
// TODO(subscription-refinement): Remove 'stepovr_pro_yearly' once all existing yearly subscriptions have fully lapsed.
const APPLE_SUBSCRIPTION_PRODUCTS = ['stepovr_pro_monthly', 'stepovr_pro_yearly'];
```

```typescript
// BEFORE (line 20):
const GOOGLE_SUBSCRIPTION_PRODUCTS = ['stepovr_pro_monthly', 'stepovr_pro_yearly'];

// AFTER:
// TODO(subscription-refinement): Remove 'stepovr_pro_yearly' once all existing yearly subscriptions have fully lapsed.
const GOOGLE_SUBSCRIPTION_PRODUCTS = ['stepovr_pro_monthly', 'stepovr_pro_yearly'];
```

No other backend changes needed — webhook handlers process notifications by user/transaction ID, not product ID, so they handle yearly renewals/expirations without any code changes.

- [ ] **Step 2: Verify the backend compiles**

Run: `cd backend && npx nest build 2>&1 | head -20`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add backend/src/subscription/iap-validation.service.ts
git commit -m "chore(iap): add TODO to remove yearly product once all subs lapse"
```

---

### Task 6: Final verification and cleanup

- [ ] **Step 1: Grep for any remaining yearly references in code (not docs)**

Run: `grep -rn "yearly\|YEARLY\|stepovr_pro_yearly" frontend/src/ backend/src/ --include="*.ts" --include="*.html" --include="*.css"`

Expected: Only the TODO comments in `iap-validation.service.ts` should remain. If other references exist, remove them.

- [ ] **Step 2: Full frontend build**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Full backend build**

Run: `cd backend && npx nest build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit any remaining cleanup**

Only if Step 1 found additional references to clean up:

```bash
git add -A
git commit -m "chore: remove remaining yearly plan references"
```

---

## Manual Steps (Not Automatable)

These require App Store Connect and Google Play Console access:

1. **App Store Connect:** Remove `stepovr_pro_yearly` from active subscriptions (or set to "removed from sale")
2. **App Store Connect:** Update `stepovr_pro_lifetime` price from $19.99 to $14.99
3. **App Store Connect:** Add 3-day free trial to `stepovr_pro_monthly` subscription
4. **Google Play Console:** Remove `stepovr_pro_yearly` from active subscriptions
5. **Google Play Console:** Update `stepovr_pro_lifetime` price from $19.99 to $14.99
6. **Google Play Console:** Add 3-day free trial to `stepovr_pro_monthly` subscription

---

## Out of Scope (Deferred)

- Referral program (invite X friends → 7-day trial) — separate spec/plan
- PostHog analytics for new pricing — existing events already track plan selection
