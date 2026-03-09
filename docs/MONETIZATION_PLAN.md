# Monetization Plan: Ads + Ad-Free Subscription

This plan covers adding Google AdSense (web) and a €1/month Stripe subscription for ad-free access.

---

## Overview

| Feature | Placement | Notes |
|---------|-----------|-------|
| **Interstitial ad** | After 2-player game ends (before results) | 1 per game |
| **Interstitial ad** | Blitz mode: every 3 runs | First ad after run 3 |
| **Banner ad** (optional) | Bottom of home/setup screen | Non-intrusive |
| **€1/month subscription** | User pays to remove all ads | Stripe Checkout |

---

## Part 1: Google AdSense (Ads)

### 1.1 Apply for AdSense

1. Go to [google.com/adsense](https://www.google.com/adsense)
2. Sign up with your site URL
3. Add your site to AdSense
4. Wait for approval (can take 1–2 weeks; need some content and traffic)

### 1.2 Add AdSense to the app

1. **Get your AdSense script** from the AdSense dashboard after approval.

2. **Add script to** `frontend/src/index.html` (in `<head>`):
   ```html
   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX" crossorigin="anonymous"></script>
   ```

3. **Create an ad component** `frontend/src/app/shared/ad/`:
   - `ad.component.ts` – Angular component that renders an `<ins class="adsbygoogle">` block
   - Use `@Input` for ad slot ID, format (banner/interstitial), etc.
   - Call `(adsbygoogle = window.adsbygoogle || []).push({})` after view init

4. **Place ads in the app**:
   - **Results screen** (`frontend/src/app/features/results/results.ts`): Add interstitial before showing results (or after game ends, before "Play again")
   - **Blitz component** (`frontend/src/app/features/blitz/blitz.ts`): When `phase() === 'finished'` and run count is a multiple of 3, show interstitial before returning to idle
   - **Home/setup** (optional): Add banner at bottom

### 1.3 Ad frequency logic

- **2-player game**: Show 1 interstitial when navigating to results (in `ResultsComponent` or in the route guard/navigation flow)
- **Blitz**: Track `runCount` in the Blitz component. When `runCount % 3 === 0` and `runCount > 0`, show interstitial after "finished" phase, then reset to idle

### 1.4 Skip ads for subscribers

- Before showing any ad, check `subscriptionStatus` (from subscription service)
- If user is subscribed: do not render ad component / do not trigger interstitial

---

## Part 2: Stripe Subscription (€1/month)

### 2.1 Stripe setup

1. Create account at [stripe.com](https://stripe.com)
2. Create a Product: "Ad-Free" (or similar)
3. Create a Price: €1/month, recurring
4. Create a Customer Portal (optional) for managing/cancelling subscription
5. Get API keys: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### 2.2 Database

1. **Migration** `supabase/migrations/YYYYMMDD_add_subscriptions.sql`:
   ```sql
   alter table profiles add column if not exists stripe_customer_id text;
   alter table profiles add column if not exists subscription_status text default 'active' check (subscription_status in ('active', 'canceled', 'past_due', 'trialing', 'none'));
   alter table profiles add column if not exists subscription_ends_at timestamptz;
   ```
   Or use a separate `subscriptions` table if you prefer.

2. Run `supabase db push` (or `supabase migration up`)

### 2.3 Backend (NestJS)

1. **Install Stripe**:
   ```bash
   cd backend && npm install stripe
   ```

2. **Environment** – add to `.env`:
   ```
   STRIPE_SECRET_KEY=sk_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_ID=price_...  # Your €1/month price ID
   ```

3. **Create subscription module**:
   - `backend/src/subscription/subscription.module.ts`
   - `backend/src/subscription/subscription.controller.ts`
   - `backend/src/subscription/subscription.service.ts`

4. **Endpoints**:
   - `POST /api/subscription/create-checkout-session` – requires auth token. Creates Stripe Checkout session, returns `url` to redirect user. Pass `userId` from token as `client_reference_id` or metadata.
   - `POST /api/subscription/webhook` – Stripe webhook. Verify signature, handle `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Update `profiles` (or `subscriptions`) with `stripe_customer_id`, `subscription_status`, `subscription_ends_at`.

5. **Get subscription status**:
   - Option A: Add `GET /api/subscription/status` – returns `{ subscribed: boolean, endsAt?: string }` for the current user
   - Option B: Add `subscription_status` to an existing profile endpoint (e.g. leaderboard or profile API)

6. **Webhook** – Stripe webhook must be a raw body (not JSON-parsed). In NestJS, use `rawBody` for webhook route.

### 2.4 Frontend

1. **Subscription service** `frontend/src/app/core/subscription.service.ts`:
   - `createCheckoutSession()` – POST to backend, get URL, redirect with `window.location.href`
   - `getStatus()` – GET from backend, returns `{ subscribed: boolean }`
   - Cache status or use a signal

2. **"Go ad-free" UI**:
   - Add button/link in profile, settings, or header
   - On click: call `createCheckoutSession()`, redirect to Stripe
   - After Stripe: redirect to success URL (e.g. `/profile?success=subscribed`)

3. **Success/cancel URLs**:
   - Success: `https://yoursite.com/profile?success=subscribed`
   - Cancel: `https://yoursite.com/profile?canceled=1`
   - Configure these in Stripe Checkout session

4. **Ad gating**:
   - Create `AdGuardService` or extend subscription service: `shouldShowAds(): boolean`
   - Use in ad component and in Blitz/results: only show ad if `!subscribed`

### 2.5 Webhook local testing

- Use Stripe CLI: `stripe listen --forward-to localhost:3001/api/subscription/webhook`
- Use the printed webhook secret in `.env` for local dev

---

## Part 3: Integration checklist

- [ ] AdSense approved
- [ ] AdSense script in index.html
- [ ] Ad component created
- [ ] Interstitial in results (2-player game)
- [ ] Interstitial in Blitz (every 3 runs)
- [ ] Optional: banner on home/setup
- [ ] Stripe product and price created
- [ ] DB migration for subscription fields
- [ ] Backend: create-checkout-session endpoint
- [ ] Backend: webhook endpoint
- [ ] Backend: subscription status endpoint
- [ ] Frontend: subscription service
- [ ] Frontend: "Go ad-free" button
- [ ] Frontend: skip ads when subscribed
- [ ] Test full flow: sign up → pay → verify no ads

---

## File structure (reference)

```
frontend/
  src/
    app/
      shared/ad/
        ad.component.ts
      core/
        subscription.service.ts
      features/
        results/results.ts      # add interstitial
        blitz/blitz.ts          # add interstitial every 3 runs
        profile/profile.ts     # add "Go ad-free" button

backend/
  src/
    subscription/
      subscription.module.ts
      subscription.controller.ts
      subscription.service.ts

supabase/
  migrations/
    YYYYMMDD_add_subscriptions.sql
```

---

## Environment variables

**Backend**
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
```

**Frontend** – no new vars needed (subscription uses backend API)
