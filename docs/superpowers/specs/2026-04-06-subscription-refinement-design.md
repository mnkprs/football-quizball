# Subscription Model Refinement — Design Spec

**Date:** 2026-04-06
**Status:** Approved
**Summary:** Simplify from 3 tiers (monthly/yearly/lifetime) to 2 tiers (monthly/lifetime), adjust pricing, add 3-day free trial, and introduce referral-based 7-day trial reward.

---

## Context & Motivation

- Logo Quiz is the hero feature; the app's lifecycle per engaged user is a few months, not years.
- Yearly subscription ($14.99/yr) serves no purpose when users don't play actively beyond ~5 months.
- Lifetime at $19.99 was already the best revenue capture per user, but at $14.99 it becomes an easier impulse buy.
- Content-based tiers (pay for X logos) were explored and rejected due to ELO fairness issues — different pool sizes create pay-to-win leaderboard dynamics.
- The existing subscription infrastructure (Apple IAP + Google Play Billing, webhook handlers, receipt validation) stays intact. This is a refinement, not a rebuild.

## Decision Log

| Question | Decision | Rationale |
|---|---|---|
| Time-based vs content-based | Time-based (subscriptions) | Content tiers create ELO fairness issues; everyone should play from the same logo pool |
| Number of tiers | 2 (monthly + lifetime) | Yearly is redundant given user lifecycle < 5 months |
| Pricing | $3.99/mo + $14.99 lifetime | Monthly = low-commitment trial; lifetime < 4 months of monthly = easy conversion |
| Mode gating | Keep current system | Free: 3 duels/day, 1 BR trial, 2 concurrent online games. Pro: unlimited everything |
| Ad removal | Any paid tier removes ads | Same as current |
| Logo pool | Same for all users | Fair leaderboard, no pay-to-win |
| Free trial | 3-day on monthly | Apple/Google native support, lowers conversion barrier |
| Referral reward | Invite X friends → 7-day Pro trial | Growth mechanic; details (X value, stacking) TBD during planning |

---

## Pricing Structure

### Monthly Subscription — $3.99/mo

- Product ID: `stepovr_pro_monthly` (existing, no change)
- 3-day free trial (configured in App Store Connect + Google Play Console)
- Auto-renewable
- Cancellation: user retains Pro until end of billing period

### Lifetime — $14.99

- Product ID: `stepovr_pro_lifetime` (existing, price change from $19.99)
- Non-consumable purchase
- Never expires
- Revoked only on refund

### Removed: Yearly — ~~$14.99/yr~~

- Product ID: `stepovr_pro_yearly` — retire from both stores
- Existing yearly subscribers: honor until expiration, do not auto-renew into a new yearly term
- Backend webhook handlers: keep yearly expiration/renewal handling until all existing yearly subs have lapsed, then remove

---

## Feature Gating (Unchanged)

| Feature | Free | Pro |
|---|---|---|
| Logo Quiz | Unlimited | Unlimited |
| Solo | Unlimited | Unlimited |
| 2-Player Local | Unlimited | Unlimited |
| Blitz | Unlimited | Unlimited |
| Mayhem | Unlimited | Unlimited |
| Duel | 3/day (resets midnight UTC) | Unlimited |
| Battle Royale | 1 trial game | Unlimited |
| Online 2-Player | 2 concurrent games | Unlimited |
| Ads | Interstitials every 3rd Q + end-game | Removed |
| Logo Pool | Full pool (~1,600+) | Full pool (~1,600+) |

**Important:** All users draw from the same logo pool. There is no content gating by tier. Leaderboard is fair regardless of payment status.

---

## Referral Program (New Feature)

### Concept
- User invites friends via a shareable referral link/code
- When X friends sign up (create an account), the referrer earns a 7-day Pro trial
- This is a free Pro trial — not a discount, not a subscription

### Open Questions (Resolve During Planning)
- **X value:** How many friends needed to trigger the reward? (Suggested: 3)
- **Stacking:** Can users earn multiple 7-day trials by inviting more batches? Or one-time only?
- **Referee reward:** Does the invited friend also get something? (e.g., 3-day Pro trial)
- **Deep link vs code:** Implementation approach for tracking referrals
- **Fraud prevention:** How to prevent fake account creation for referral farming
- **Backend tracking:** New table or columns needed for referral state

### Scope Note
The referral system is a separate feature that can be built after the pricing changes ship. It should not block the core subscription refinement.

---

## Changes Required

### App Store Connect / Google Play Console
1. Remove yearly product (`stepovr_pro_yearly`) from active offerings
2. Update lifetime price from $19.99 → $14.99
3. Configure 3-day free trial on monthly subscription

### Frontend
1. **Paywall UI (`upgrade-modal`):** Show 2 options instead of 3. Highlight lifetime as "Best Value."
2. **IAP Service:** Remove yearly product registration and purchase flow
3. **Pro Service:** No changes needed — `is_pro` logic stays the same
4. **Home page:** Remove any yearly-specific copy or badges

### Backend
1. **Subscription Service:** Remove yearly plan handling from validation logic
2. **Webhook Handlers:** Keep yearly renewal/expiration handling temporarily for existing subscribers. Add a TODO to remove once all yearly subs have lapsed.
3. **No database migration needed** — `purchase_type` already supports 'subscription' and 'lifetime'; yearly was just a subscription variant

### Database
- No schema changes for the core pricing update
- Referral program will need new tables (deferred to its own spec)

---

## What Does NOT Change

- `is_pro` boolean logic — still the single source of truth for Pro status
- Trial system (3 duels/day, 1 BR trial, 2 concurrent online) — unchanged
- Ad service logic — still checks `isPro()`, no changes
- Apple/Google webhook endpoints — same endpoints, just stop processing yearly renewals eventually
- Receipt validation flow — unchanged
- ELO system — unchanged, everyone plays from the same pool
- All game modes — no mode changes

---

## Success Metrics

- **Conversion rate:** % of free users who purchase any tier (target: improve over current)
- **Revenue per user:** Should increase due to lifetime at $14.99 capturing users who previously stayed free
- **Lifetime vs monthly split:** Expect 70-80% lifetime purchases (this is fine — it's the intended anchor)
- **Free trial conversion:** % of 3-day trial users who convert to paid monthly
- **Referral rate:** Tracked separately once referral program ships
