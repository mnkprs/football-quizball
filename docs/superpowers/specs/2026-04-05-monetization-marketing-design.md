# Stepover — Monetization & Marketing Strategy

**Date:** 2026-04-05
**Status:** Approved
**Scope:** Pre-launch marketing, pricing, ad monetization, revenue projections, launch checklist

---

## Context

Stepover is a football trivia quiz app (Angular frontend + NestJS backend + Supabase) targeting European football fans. Launching on iOS and Android with a freemium model: free-to-play with optional Pro subscription and interstitial ads for free users.

### Current State

- **Game modes (free):** Solo, Blitz, Logo Quiz, Mayhem, News, Daily Challenge
- **Game modes (gated):** Duel (1 free/day), Battle Royale (1 trial then Pro)
- **Existing IAP:** Monthly ($2.99) + Lifetime ($9.99) — pricing to be updated
- **Existing ads:** AdSense (web only) — need AdMob for native
- **Achievements:** 40+ achievements, all free to earn
- **No marketing system or social pages exist yet**

### Launch Assets

- TikTok + Instagram pages (to be created 2 weeks before launch)
- Professional footballer friend: 900K+ Instagram followers, football audience
- Personal trainer friend: football-focused audience
- Both will post Instagram stories on launch day (one-time, unpaid)

### Target Market

Europe-wide — UK, Spain, Germany, Italy, France, Greece and surrounding markets.

---

## 1. Pre-Launch & Launch Marketing Plan

### Phase 1: Pre-Launch (2 Weeks Before Launch)

**Social Pages Setup (Week 1):**

- Create @stepover.app (or similar) on TikTok and Instagram
- Bio: "Football trivia for real fans. Launching [date]." + App Store/Play Store link (pre-order if available)
- Visual identity: use existing app branding, consistent across both platforms

**Content Calendar (Weeks 1-2, ~10 posts):**

| Day | Platform | Content |
|-----|----------|---------|
| D1 | Both | Teaser: blurred screenshot, "Something's coming for football fans" |
| D3 | TikTok | Short clip: hardest logo quiz question, "Can you guess this?" |
| D4 | Instagram | Carousel: 5 trivia questions, answers on last slide |
| D6 | TikTok | "POV: You think you know football" + gameplay clip |
| D8 | Both | Behind-the-scenes: "Building a football app" (authenticity) |
| D10 | TikTok | "Only 1% of football fans can score 10/10" challenge format |
| D12 | Instagram | Countdown: "3 days until launch" |
| D13 | Both | Feature reveal: Battle Royale mode |
| D14 | Both | "Tomorrow." — simple, clean launch eve post |

**Key principle:** Every TikTok should be a playable moment — show a question, let viewers try to answer before the reveal. This format performs well in trivia niches.

### Phase 2: Launch Day

- **Footballer friend (900K):** Posts Instagram story with link — ideally a story sequence (3-4 frames showing him playing the app + reaction), not just a static screenshot
- **PT friend:** Same day, Instagram story with link
- **Own pages:** "We're live" post on both platforms with App Store/Play Store links
- **App Store optimization:** Keywords — "football quiz", "football trivia", "logo quiz football", "soccer quiz" in title/subtitle/keywords

### Phase 3: Post-Launch (Weeks 1-4)

- Post TikToks 3-4x/week using the challenge format
- Share user-generated content (screenshots of scores, achievements)
- If any TikTok gets traction (>10K views), post a follow-up immediately
- Track which content type performs best and double down

### What's NOT in This Plan (and Why)

- **Paid ads:** Not worth it until retention is validated. If D7 retention > 10%, consider $5-10/day on Meta/TikTok to test
- **Press outreach:** Low ROI for indie quiz apps
- **Discord/community:** Premature at <5K MAU
- **Localization:** Add when analytics show demand from specific countries

---

## 2. Pricing & Monetization Design

### Pricing Tiers

| Tier | Price | What They Get |
|------|-------|---------------|
| **Free** | $0 | All game modes, 1 duel/day, 1 BR trial, ads at answer reveal + end game |
| **Pro Monthly** | $3.99/mo | Unlimited duels + BR, zero ads, auto-renewing |
| **Pro Yearly** | $14.99/yr | Same as monthly, ~69% savings displayed, recommended default |
| **Pro Lifetime** | $19.99 | Same as monthly, one-time, never expires |

**Pricing Rationale:**

- $3.99/month: sweet spot for casual gaming in Europe — low enough for impulse, high enough to matter
- $14.99/year ($1.25/month): makes monthly feel expensive by comparison (anchoring effect). Always display as the "recommended" option with a savings badge
- $19.99 lifetime: equals ~5 months of monthly — users feel they're getting a deal, but meaningful revenue is captured. Previous $9.99 was only 3.3 months' worth and cannibalized subscriptions

**Paywall UI:**

- Display yearly as the default/recommended option
- Show monthly price comparison to highlight yearly savings
- Lifetime shown as a third option, not prominently featured
- Trigger paywall when: user hits duel daily limit, tries to join second BR, or taps "Remove Ads"

### Ad Placement Strategy

**Launch Configuration (Conservative):**

| Trigger | Ad Type | Frequency |
|---------|---------|-----------|
| Answer submitted (suspense moment) | Interstitial | Every 3rd question |
| Game over / results screen | Interstitial | Every game |

**Dial-Up Configuration (After Retention Validation):**

| Trigger | Ad Type | Frequency |
|---------|---------|-----------|
| Answer submitted | Interstitial | Every 2nd question |
| Game over | Interstitial | Every game |
| Extra free duel | Rewarded video | Optional — user chooses to watch |

**Ad Rules:**

- Never show two ads back-to-back
- Minimum 30 seconds between interstitials (AdMob policy)
- Pro users: zero ads, no exceptions
- First game session ever: no ads (let users get hooked first)

### Server-Side Ad Configuration

Ad frequency must be configurable from the backend (not hardcoded) to enable tuning without app updates:

```json
{
  "adFrequency": {
    "answerReveal": { "everyNthQuestion": 3 },
    "endGame": { "enabled": true },
    "rewardedVideo": { "enabled": false }
  },
  "firstSessionAdsDisabled": true
}
```

This enables:
- A/B testing frequencies without app updates
- Dialing up ads if retention holds
- Dialing down if D7 retention drops
- Emergency kill switch if something breaks

---

## 3. Revenue Projections

### MAU Projections

Based on launch assets (one-time influencer stories, organic social, ASO):

| | Month 1 (launch) | Month 3 | Month 6 | Month 12 |
|---|---|---|---|---|
| **Conservative** | 800 | 400 | 600 | 1,000 |
| **Moderate** | 2,500 | 1,500 | 2,500 | 4,000 |
| **Optimistic** | 5,000 | 3,500 | 5,000 | 8,000 |

**Influencer install estimate:** A single Instagram story from a 900K-follower account typically yields 100-800 installs (5-10% view rate, 1-3% link tap rate, 15% install rate from tap).

### Revenue Model Assumptions

- European interstitial eCPM: $6 average (blended UK/DE/FR/ES/IT/GR)
- Rewarded video eCPM: $12 (if added later)
- Pro conversion rate: 2% of MAU
- Conversion split: 50% yearly, 30% monthly, 20% lifetime
- Apple/Google store cut: 30% on subscriptions (year 1), 15% after
- Ad impressions per free MAU/month: ~35 (15 sessions x 2-3 ads)

### Year 1 Revenue Estimates

| Scenario | Avg MAU | Ad Revenue/yr | Sub Revenue/yr (after 30% cut) | Total Year 1 |
|---|---|---|---|---|
| **Conservative** | 700 | $1,760 | $840 | **~$2,600** |
| **Moderate** | 2,000 | $5,040 | $2,400 | **~$7,400** |
| **Optimistic** | 5,000 | $12,600 | $6,000 | **~$18,600** |

### Cost Structure

| Item | Annual Cost |
|------|------------|
| Apple Developer Account | $99 |
| Google Play (one-time) | $25 |
| Supabase + Railway hosting | $360-$600 |
| **Total annual costs** | **~$500-$700** |

### Breakeven Analysis

- Conservative scenario covers costs with ~$1,900 profit
- Moderate scenario: ~$6,500-$6,900 profit
- The jump from 2K to 10K MAU (via viral content or paid UA) would yield $35,000-$40,000/year

---

## 4. Implementation Priorities

### P0 — Must Have Before Launch

| Item | Description |
|------|-------------|
| AdMob integration | Interstitial ads at answer reveal + end game for all game modes |
| IAP pricing update | Change to $3.99/mo, $19.99/yr, $24.99 lifetime |
| Pro paywall UI | Yearly as default/recommended with savings badge |
| First-session ad suppression | No ads during user's very first game |
| Server-side ad config | Ad frequency configurable from backend |

### P1 — First 2 Weeks After Launch

| Item | Description |
|------|-------------|
| Analytics events | Track: app open, first game, game complete, paywall seen, purchase |
| ASO optimization | Screenshots, keywords, description for app stores |

### P2 — Month 2+ (Based on Data)

| Item | Description |
|------|-------------|
| Rewarded video ads | Optional "watch ad for extra duel" if retention holds |
| Push notifications | Daily challenge reminders, streak alerts |
| Paid UA testing | $5-10/day on Meta/TikTok if D7 retention > 10% |

### What NOT to Build

- Referral system (premature at <5K MAU)
- Localization (add when analytics show demand)
- Discord/community server (premature)
- Email marketing (no email collection needed yet)

---

## 5. Key Metrics & Decision Points

### Metrics to Track from Day 1

| Metric | Target | Action if Below |
|--------|--------|-----------------|
| D1 retention | >30% | Fix onboarding |
| D7 retention | >10% | Fix engagement loop / reduce ads |
| D30 retention | >5% | Content/achievement problem |
| Ad eCPM | >$5 | Check ad network config / placement |
| Paywall view to purchase | >3% | Revisit pricing or value prop |
| Games per session | >2.5 | Sessions too short — improve stickiness |

### Post-Launch Decision Points

| When | Signal | Action |
|------|--------|--------|
| Week 2 | D7 retention > 10% | Increase ad frequency to every 2nd question |
| Week 2 | D7 retention < 8% | Reduce ads, improve onboarding |
| Month 1 | >80% paid users pick lifetime | Consider removing lifetime option |
| Month 1 | eCPM < $3 | Add rewarded video as supplementary format |
| Month 2 | MAU stable at 1K+ | Add push notifications for daily challenge |
| Month 3 | MAU > 3K | Test paid UA ($5-10/day on Meta/TikTok) |
| Month 6 | MAU > 5K | Invest in localization (top 3 countries by usage) |
