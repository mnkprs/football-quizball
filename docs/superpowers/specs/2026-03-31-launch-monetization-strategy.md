# StepOvr Launch & Monetization Strategy

**Date:** 2026-03-31
**Author:** ManosKprs + Claude
**Status:** Draft
**Timeline:** 30 days to launch

---

## 1. Product Overview

StepOvr is a football trivia and logo quiz app targeting casual football fans and competitive quiz players. Built with Angular 20 + NestJS + Supabase, shipping as a native iOS/Android app via Capacitor.

**Core value proposition:** Guess football club logos, challenge friends to duels, climb the ELO rankings.

**Target audience:** Broad football fans, ages 16-35, who watch matches and follow football culture on social media. The app serves both casual players (logo quiz dopamine) and competitive players (ELO grind, duels).

---

## 2. Game Mode Ship Priority

Modes ship in this order based on their role in the user funnel:

| Priority | Mode | Role | Free Access |
|----------|------|------|-------------|
| 1 | Logo Quiz Solo | Hero/hook | 150 logos, then recycle. Pro unlocks 1000+ |
| 2 | Duel (standard) | Social retention | 3 free games/day |
| 3 | Logo Quiz Duel | Social retention | 1 free game/day |
| 4 | Daily Challenge | Daily return | Unlimited (free) |
| 5 | News Mode | Daily return | Unlimited (free) |
| 6 | Solo Ranked | Competitive depth | Unlimited (free) |
| 7 | Team Logo Quiz | Social/group | 1 free game/day |
| 8 | Battle Royale | Premium showcase | 1 free trial, then Pro only |
| **Post-launch** | Blitz | Content update (week 2-3) | TBD |
| **Post-launch** | Mayhem | Content update (week 2-3) | TBD |

**Rationale:** Logo Quiz Solo is the casual entry point — no login required, instant gameplay. Duels are the social hook that drives word-of-mouth. Daily Challenge and News Mode are free retention anchors. Battle Royale is the premium carrot.

Blitz and Mayhem stay locked at launch. Unlocking them 2-3 weeks post-launch gives a reason to push a second round of marketing ("New modes just dropped!").

---

## 3. Free vs Pro Tier

### 3.1 Free Tier

| Mode | Limit | Reset |
|------|-------|-------|
| Logo Quiz Solo | 150 unique logos, then recycle | Permanent pool |
| Duel (standard) | 3 games/day | Midnight UTC |
| Logo Quiz Duel | 1 game/day | Midnight UTC |
| Team Logo Quiz | 1 game/day | Midnight UTC |
| Battle Royale | 1 free trial total | One-time |
| Solo Ranked | Unlimited | - |
| Daily Challenge | Unlimited | - |
| News Mode | Unlimited | - |
| Ads | Light (home banner + interstitial every 3rd game) | - |

**Logo Quiz Solo mechanic:** Free users have access to a pool of 150 logos. Once they've seen all 150, logos start recycling (repeating). The upgrade prompt appears when recycling begins: "You've seen all free logos. Upgrade to Pro for 1000+ teams from leagues worldwide."

### 3.2 Pro Tier

**Pricing:**
- Monthly: $2.99/month (auto-renewing)
- Lifetime: $9.99 (one-time purchase)

**Pro includes:**
- Logo Quiz Solo: full 1000+ logo pool (no recycling)
- Unlimited Duels (standard + logo)
- Unlimited Team Logo Quiz
- Unlimited Battle Royale
- Ad-free experience
- Everything in Free tier

**Product IDs (already configured):**
- `stepovr_pro_monthly` (iOS + Android)
- `stepovr_pro_lifetime` (iOS + Android)

### 3.3 Upgrade Prompt Triggers

Show the upgrade screen at high-intent moments:

1. **Logo recycling starts** — "You've seen all 150 free logos. Unlock 1000+ with Pro."
2. **Daily limit reached** — "Out of duels for today. Go Pro for unlimited."
3. **After a win streak** — momentum is high, user feels good about the app.
4. **After Battle Royale trial** — "Want more? Battle Royale is unlimited with Pro."
5. **Never during gameplay** — don't interrupt a game in progress.
6. **Never after a loss** — feels punishing, kills conversion.

---

## 4. Ads Strategy

**Philosophy:** Light, non-intrusive. Ads are a gentle push toward Pro, not a primary revenue stream at this scale.

**Implementation:**
- Home screen: small banner ad (bottom, does not overlay content)
- Post-game interstitial: after every 3rd completed game (not after losses)
- No ads during gameplay, ever
- No rewarded ads (keeps the model simple)
- Pro removes all ads

**Expected revenue:** $5-15/month at launch scale. Grows with user base but subscriptions are the primary monetization.

---

## 5. Retention Mechanics

### 5.1 Already Built (use at launch)

- **Daily free trial resets** — "Your 3 duels are back" pulls users in each morning
- **Daily Challenge** — new challenge every day, free for all
- **ELO ranking system** — competitive players check rank daily
- **Leaderboards** — social proof, drives competition
- **Achievements** — milestone unlocks on profile
- **Match history** — track W/L record in duels

### 5.2 Must Build Before Launch

#### Push Notifications (Firebase Cloud Messaging)
- **Morning (8am local):** "Your daily duels have reset! Challenge someone."
- **Afternoon (2pm local):** "Today's Daily Challenge is live. Can you beat yesterday?"
- **Milestone:** "You just hit 50 correct logos! Keep going."
- No more than 2 notifications per day. Users should be able to disable.

#### Share Result Cards
After a duel win, logo quiz session, or Daily Challenge score, generate a shareable image:
- StepOvr branding + score + "Can you beat me?"
- Native share sheet (Instagram Stories, WhatsApp, iMessage)
- Deep link back to the app (or App Store if not installed)
- This is free organic marketing with every share.

#### Onboarding Funnel Optimization
Current: 5 practice questions then home screen.

New flow:
1. Quick intro (3 logo quiz rounds, no login) — immediate gameplay
2. "Nice! You got 2/3. Want to challenge a friend?" — prompt Duel
3. Show home screen with all modes
4. Prompt login only when user tries a feature that requires it (duel, ranked, leaderboard)

No login wall at the front door. Remove friction, let gameplay sell the app.

### 5.3 Build Post-Launch (Week 2-3)

- **Win streak tracker** — visual badge, "5 wins in a row!"
- **Weekly recap notification** — "You played 12 games this week, ranked up twice"
- **Unlock Blitz + Mayhem** — content update, reason to push marketing again

---

## 6. Launch Plan

### Week 1-2: Technical Prep

| Task | Priority | Effort |
|------|----------|--------|
| Implement 150-logo free cap + recycling mechanic | Critical | 1-2 days |
| Set daily limits: 3 duels, 1 logo duel, 1 team quiz | Critical | 1 day |
| Push notifications via FCM + Capacitor | Critical | 2-3 days |
| Share result cards (image generation + native share) | Critical | 2-3 days |
| Onboarding funnel rework | High | 1 day |
| Light ads integration (home banner, post-game interstitial) | High | 1 day |
| Configure Google OAuth client ID in Capacitor | Critical | 1 hour |
| Configure Apple Sign-In entitlements in Xcode | Critical | 1 hour |
| Test IAP purchase flow end-to-end (TestFlight + internal testing) | Critical | 1 day |
| App Store / Play Store developer account setup | Critical | 1 day |

### Week 2-3: Store Submission

| Task | Priority | Effort |
|------|----------|--------|
| App Store screenshots (6.7", 6.1", iPad) | Critical | 1 day |
| Play Store screenshots + feature graphic (1024x500) | Critical | 1 day |
| Write store description (SEO: "football quiz", "logo quiz", "football trivia") | Critical | 2 hours |
| Privacy policy + Terms of Service at public URL | Critical | 2 hours |
| Submit to App Store (review: 1-3 days) | Critical | - |
| Submit to Play Store (review: 1-2 days) | Critical | - |
| Beta test with 5-10 friends via TestFlight / internal track | High | ongoing |
| Upgrade Supabase to Pro ($25/mo) | Critical | 15 min |
| Upgrade Redis to pay-as-you-go | Critical | 15 min |

### Week 3-4: Pre-Launch Marketing

| Task | Priority | Effort |
|------|----------|--------|
| Record 3-5 teaser videos with Higgsfield | High | 1-2 days |
| Post teasers on own social accounts | High | ongoing |
| Coordinate launch date with sister | Critical | - |
| Prepare sister's story content (screen recording + swipe-up link) | Critical | 1 hour |
| Ensure app is live on both stores 2+ days before launch | Critical | - |

### Launch Day

- Sister posts Instagram Story (100k reach)
- Simultaneous posts on own accounts
- Monitor Railway/Supabase dashboards for load
- Be online to fix any bugs immediately
- Respond to early App Store reviews

### Week 1 Post-Launch

- Monitor PostHog analytics: where do users drop off?
- Track Pro conversion rate (target: 2-5% of active users)
- Respond to every App Store / Play Store review
- Fix critical bugs same-day
- Gather user feedback from reviews and messages

### Week 2-3 Post-Launch

- Unlock Blitz + Mayhem as "New Update" content drop
- Push second marketing round (own social, sister if willing)
- Start weekly content cycle: Daily Challenge highlights, leaderboard screenshots, user milestones

---

## 7. Revenue Projections

### Month 1 (Launch)

| Metric | Conservative | Optimistic |
|--------|-------------|------------|
| Story views | 100,000 | 100,000 |
| Link taps (5-8%) | 5,000 | 8,000 |
| Installs (30-40%) | 1,500 | 3,200 |
| Day 7 retention (15-20%) | 225 | 640 |
| Day 30 retention (5-8%) | 75 | 256 |
| Pro conversion (3%) | 5 | 20 |
| Sub revenue ($2.99/mo) | $15 | $60 |
| Lifetime revenue ($9.99) | $20 | $50 |
| Ad revenue | $5 | $15 |
| **Month 1 total** | **~$40** | **~$125** |

### Month 3-6 (With consistent content + organic growth)

| Metric | Conservative | Optimistic |
|--------|-------------|------------|
| Monthly active users | 500 | 2,000 |
| Pro subscribers | 25 | 100 |
| Monthly recurring revenue | $75 | $300 |
| Ad revenue | $15 | $50 |
| **Monthly total** | **~$90** | **~$350** |

### Break-Even

Monthly infrastructure cost: ~$45-55/month.
Break-even at ~15-20 monthly subscribers.
Achievable within 2-3 months if retention holds.

### Growth Levers (Post Month 1)

The share result cards are the highest-leverage growth mechanic. Every duel creates a potential share moment. If 10% of winners share their result card and 5% of viewers install, that's compounding organic growth at zero cost.

Other free growth channels:
- Reddit: r/football, r/soccer, r/soccermemes — post screenshots, engage
- Twitter/X: football communities, quote-tweet big match moments with quiz tie-ins
- Football Discord servers
- Football YouTube comment sections (tastefully)

---

## 8. Infrastructure at Launch

| Service | Plan | Monthly Cost |
|---------|------|-------------|
| Supabase | Pro | $25 |
| Railway | Starter | $5-10 |
| Upstash Redis | Pay-as-you-go | $1-5 |
| Apple Developer | Annual | $8.25 (amortized) |
| Google Play | One-time $25 | $0 |
| **Total** | | **~$45-55** |

Already verified for 400 concurrent players (per pre-production.md). The Instagram spike should stay well within this capacity.

---

## 9. App Store Optimization (ASO)

### App Name
**StepOvr - Football Quiz & Trivia**

### Keywords (iOS)
`football quiz, logo quiz, football trivia, soccer quiz, football game, club logos, football challenge, sports quiz, duel, football ELO`

### Short Description (Play Store, 80 chars)
`Guess football logos, challenge friends, climb the ranks. How much do you know?`

### Screenshots Priority (first 3 matter most)
1. Logo Quiz gameplay — obscured logo being guessed (hero shot)
2. Duel result screen — "You won!" with score comparison
3. Leaderboard with ELO rank — shows progression
4. Daily Challenge card
5. Battle Royale team scores

### Category
- iOS: Games > Trivia
- Android: Games > Trivia

---

## 10. Technical Implementation Summary

### New Features Required

| Feature | Files Affected | Complexity |
|---------|---------------|------------|
| 150-logo free cap + recycling | `logo-quiz.service.ts`, `profiles` table (new column: `logos_seen`) | Medium |
| Daily limits (3 duel, 1 logo duel, 1 team) | `supabase.service.ts`, `pro.service.ts`, existing daily limit pattern | Low (pattern exists for duels) |
| Push notifications (FCM) | New Capacitor plugin, new notification service, backend triggers | Medium |
| Share result cards | New component, canvas/image generation, native share API | Medium |
| Onboarding funnel rework | `onboarding.ts`, `onboarding.html` | Low |
| Home banner ad placement | `home.html`, `home.css` | Low |
| Interstitial ad (every 3rd game) | Game completion handlers across modes | Low |

### Existing Infrastructure (No Changes Needed)

- IAP integration (cordova-plugin-purchase) — done
- Receipt validation (Apple + Google webhooks) — done
- Pro status tracking (profiles table) — done
- ELO system — done
- Leaderboards — done
- Achievements — done
- PostHog analytics — done
- Google Ads tracking — done

---

## 11. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| App Store rejection (IAP) | Blocks launch | Test IAP on TestFlight early, follow Apple guidelines exactly |
| Low retention after spike | No recurring revenue | Push notifications + daily limits create return loops |
| Sister's audience doesn't convert | Low install count | Prepare her content carefully: gameplay video > static promo |
| Backend can't handle spike | Users bounce on errors | Already tested for 400 concurrent, monitor Railway on launch day |
| Logo quiz feels repetitive at 150 | Free users churn before converting | Curate the best 150 logos (mix of easy/hard, famous/obscure) |
| Users find Pro too expensive | Low conversion | $2.99/mo is bottom of market. Monitor and adjust if needed |

---

## 12. Success Metrics

### Launch Week
- 1,000+ installs
- 30%+ Day 1 retention
- 0 critical crashes

### Month 1
- 15%+ Day 7 retention
- 5%+ Day 30 retention
- 2%+ Pro conversion rate
- Break-even on infrastructure costs

### Month 3
- 500+ monthly active users
- 25+ Pro subscribers
- Positive App Store rating (4.0+)
- Organic installs > 50% of total

---

*This spec covers the complete launch and monetization strategy for StepOvr. Implementation begins with the writing-plans skill to create a detailed technical plan.*
