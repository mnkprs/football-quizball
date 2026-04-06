# Pre-Launch UX Comprehensive Design Spec

**Date:** 2026-04-06
**Branch:** feat/pre-launch-ux
**Status:** Approved
**Goal:** Ship Stepover as a polished, retention-optimized, growth-ready native app

## Context

Stepover is a football trivia quiz app (Angular 20 + NestJS + Supabase) shipping on iOS and Android. Core gameplay is complete: Solo, Duel, Battle Royale, Logo Quiz, Mayhem, News, Today, Daily modes all functional. Achievements, streaks, ELO tiers, match history, and IAP (monthly $3.99 / lifetime $14.99) are live.

A comprehensive UX audit identified gaps across polish, retention, growth, and store readiness. This spec defines 4 phases of work, each independently shippable, building on the previous.

**Target user:** Casual football fans first (instant fun, low friction), with depth for hardcore fans (ELO, competitive modes, stats).

**Device:** Phone-primary (iOS + Android). No tablet optimization required.

**Timeline:** No hard deadline. Ship when quality meets the bar.

---

## Phase 1: Feel

Make the current app feel premium. All workstreams are independent and can ship in any order.

### 1.1 Haptic & Sound Feedback

**Problem:** Zero tactile or audio feedback. Quiz interactions feel flat on a phone.

**Solution:** Add Capacitor Haptics + a small audio sprite for key interaction points.

**Haptic triggers (~15 points):**
- Answer tap → light impact
- Correct answer → medium success haptic
- Wrong answer → error notification haptic
- Timer warning (last 3s) → soft warning haptic
- Timer expired → heavy error haptic
- Achievement unlock → heavy success haptic
- Streak milestone (7/30/100) → heavy success haptic
- Duel matched → medium impact
- Battle Royale elimination → medium error
- Battle Royale win → heavy success haptic
- ELO tier promotion → heavy success haptic
- Modal open → light impact
- Pull to refresh → light impact
- Share button tap → light impact
- Purchase success → heavy success haptic

**Sound effects (~8 distinct sounds):**
- Correct answer chime (bright, short)
- Wrong answer thud (soft, not punishing)
- Timer tick (last 5 seconds, subtle)
- Timer expired buzzer
- Achievement fanfare (celebratory, 1-2s)
- Streak milestone jingle
- Match found notification
- Victory fanfare (duel/BR win)

**Implementation:**
- Capacitor `@capacitor/haptics` plugin (already in project dependencies)
- Single audio sprite file (~50KB) loaded once at app init via Web Audio API
- New `FeedbackService` in `core/` — methods: `haptic(type)`, `playSound(name)`, `feedback(haptic, sound)` combo
- Settings: `sound_enabled` and `haptic_enabled` in localStorage (default: ON)
- Haptics follow system setting (`navigator.vibrate` availability check)

**Files to create:**
- `frontend/src/app/core/feedback.service.ts`
- `frontend/src/assets/audio/sfx-sprite.mp3` (or .webm)

**Files to modify:**
- Game question component (answer selection)
- Solo, Duel, Battle Royale, Logo Quiz, Mayhem result handlers
- Achievement unlock service
- Settings menu (add toggles)

### 1.2 Skeleton Loaders

**Problem:** All loading states use `mat-spinner` — a generic spinner that doesn't hint at incoming content. Users see a blank page with a dot.

**Solution:** Content-shaped skeleton placeholders with CSS shimmer animation.

**New shared component:** `SkeletonComponent`
- Variants: `line` (text), `circle` (avatar), `card` (mode card), `row` (leaderboard entry), `stat` (stat block)
- CSS-only shimmer animation (no JS, no external deps)
- Input: `variant`, `width`, `height`, `count` (repeat)

**Pages to update:**
| Page | Current | Skeleton |
|------|---------|----------|
| Profile | mat-spinner | Avatar circle + 4 stat lines + 3 card placeholders + history rows |
| Leaderboard | mat-spinner | 10 row skeletons with rank circle + name line + ELO line |
| Home | Cards load instantly (good) | No change needed |
| Duel Lobby | mat-spinner | 3 room card skeletons |
| Battle Royale Lobby | mat-spinner | 3 room card skeletons |
| Solo loading | Bouncing football | Keep — it's charming and intentional |
| Question loading | "Preparing questions..." | Keep — short duration, spinner is fine |
| Daily/News | mat-spinner | Hero skeleton + 3 card skeletons |

### 1.3 Empty States

**Problem:** Most screens conditionally hide sections when data is empty. Users see a mysteriously truncated page.

**Solution:** Shared `EmptyStateComponent` with icon, title, subtitle, optional CTA.

**Component API:**
```
<app-empty-state
  icon="emoji_events"
  title="No achievements yet"
  subtitle="Play some games to start earning badges"
  [ctaLabel]="'Play Solo'"
  [ctaRoute]="'/solo'"
/>
```

**Integration points (~10):**
| Location | Icon | Title | CTA |
|----------|------|-------|-----|
| Achievements (profile) | emoji_events | "No achievements yet" | "Play Solo" → /solo |
| Match history (profile) | history | "No matches played" | "Start a Duel" → /duel |
| Duel lobby (no rooms) | swords | "No active duels" | "Create a Duel" (action) |
| Battle Royale lobby | stadium | "No active rooms" | "Start a Room" (action) |
| Leaderboard (empty mode) | leaderboard | "No players yet" | "Be the first" → mode route |
| Profile mode stats (unplayed) | sports_esports | "Not played yet" | "Try it" → mode route |
| Friend list (Phase 3) | group | "No friends yet" | "Invite a friend" (share) |
| Weekly challenges (Phase 2) | flag | "Challenges reset Monday" | — |
| Search results (future) | search | "No results found" | — |
| Notification list (future) | notifications | "All caught up" | — |

### 1.4 Error Recovery

**Problem:** Error states show generic messages with no recovery action. Users must manually re-navigate.

**Solution:** Shared `ErrorStateComponent` + retry logic on critical API calls.

**Component API:**
```
<app-error-state
  [message]="'Could not load leaderboard'"
  [retryFn]="loadLeaderboard"
/>
```

Renders: error icon + message + "Try Again" button.

**Retry logic:**
- Wrap critical API calls (profile, leaderboard, lobby, question fetch) with retry utility
- Max 3 attempts, exponential backoff (1s, 2s, 4s)
- After 3 failures → show ErrorStateComponent with manual retry button
- Transient errors (network blip) → toast notification only
- Game-critical errors (question fetch mid-game, answer submission) → inline retry prompt, do not navigate away

**Network loss during game:**
- Detect via `navigator.onLine` + failed request combination
- Show overlay: "Connection lost. Reconnecting..." with spinner
- Auto-retry when connection restored
- If game session expires during disconnect → "Session expired" with "Return Home" button

**Files to modify:**
- `error.interceptor.ts` — add retry header support, improve error classification
- Individual components — replace `@if (error)` blocks with `<app-error-state>`

### 1.5 Settings Cleanup

**Problem:** Settings menu is missing several expected controls. Theme service exists but has no UI toggle.

**New settings items:**
| Setting | Type | Implementation |
|---------|------|----------------|
| Theme (Dark/Light) | Toggle | Wire existing `ThemeService` to a toggle in settings-menu |
| Sound Effects | Toggle | Read/write `sound_enabled` in localStorage via FeedbackService |
| Haptic Feedback | Toggle | Read/write `haptic_enabled` in localStorage via FeedbackService |
| Change Password | Action | Trigger Supabase `resetPasswordForEmail()` → sends magic link email |
| Notification Preferences | Action → sub-page | Placeholder in Phase 1 ("Coming soon"), functional in Phase 2 |

**Keep unchanged:** Delete account, export data, manage subscription, sign out.

### 1.6 Hide Deferred Modes

**Problem:** Blitz shows "Coming Soon" on home page. App Store reviewers flag non-functional features.

**Solution:** Remove Blitz card from home page. Keep route and component in codebase for future. Use a feature flag (`environment.features.blitz = false`) to control visibility.

---

## Phase 2: Retain

Hooks that bring users back daily and weekly. Builds on Phase 1's polished base.

### 2.1 Push Notifications

**Problem:** Zero push notification capability. Streaks can break silently. Daily rounds go unnoticed. Duel challenges have no alert.

**Solution:** Firebase Cloud Messaging via `@capacitor/push-notifications`.

**Notification types:**

| Type | Trigger | Timing | Message Example |
|------|---------|--------|-----------------|
| Streak rescue | No game played today | 8pm local time | "Your 7-day streak expires tonight! Quick game?" |
| Daily round | New news round generated | At round reset time | "Today's news round is live. 10 fresh questions." |
| Duel challenge | Matched with real player | Immediate | "You've been challenged to a duel! Tap to play." |
| Achievement unlock | Achievement earned | Immediate | "Achievement unlocked: Quiz Master!" |
| Weekly digest | Cron job | Sunday 6pm local | "This week: +45 ELO, 3 duel wins. Keep climbing!" |
| BR invite | Friend starts a room (Phase 3) | Immediate | "Alex started a Battle Royale. Join now!" |

**Backend:**
- New `NotificationModule` in NestJS
- `user_devices` table: user_id, device_token, platform (ios/android), created_at, last_active
- FCM Admin SDK (`firebase-admin`) for sending
- Cron jobs: streak rescue check (7pm daily), weekly digest (Sunday 5pm)
- Notification sent log: `notifications_sent` table for deduplication and analytics

**Frontend:**
- Register for push on first app open (after onboarding)
- Permission prompt: show explanation screen before native prompt ("We'll remind you about streaks and challenges")
- Store device token via `POST /api/notifications/register`
- Handle notification tap → deep link to relevant screen

**Settings (Phase 1 placeholder becomes real):**
- Per-category toggles: Streaks, Daily Rounds, Duels, Achievements, Weekly Digest
- Master toggle: All notifications on/off
- Stored in `user_notification_preferences` table

### 2.2 Weekly Challenges

**Problem:** Beyond daily streaks and news rounds, there are no mid-term goals. Users who play daily have no variety in objectives.

**Solution:** 3 rotating challenges that reset every Monday 00:00 UTC.

**Challenge templates (~12, pick 3 per week):**

| Category | Challenge | Target |
|----------|-----------|--------|
| Competitive | Win X duels | 3-5 |
| Competitive | Finish top 3 in Battle Royale | 2 |
| Volume | Answer X questions correctly | 30-50 |
| Volume | Play X games in any mode | 5-10 |
| Exploration | Play 3 different modes | 3 modes |
| Exploration | Try Logo Quiz for the first time | 1 game |
| Skill | Get 80%+ accuracy in a Solo session | 1 session |
| Skill | Answer 5 questions in a row correctly | 1 streak |
| Streak | Maintain your daily streak all week | 7 days |
| Social | Share a game result (Phase 3 — added to rotation after friend system ships) | 1 |
| Logo | Identify X logos correctly | 15-20 |
| News | Complete X daily news rounds | 3-5 |

**Selection algorithm:** Pick 3 from different categories. Avoid challenges for modes the user hasn't discovered yet (check `user_mode_stats`). Scale targets by user activity level (new user: easier, veteran: harder).

**Database:**
- `weekly_challenge_templates` table: id, category, description_template, target_type, target_range_min, target_range_max
- `user_weekly_challenges` table: user_id, challenge_id, week_start, target, progress, completed_at
- Cron job: Monday 00:00 UTC generates 3 challenges per active user

**Frontend:**
- Challenge strip on home page (below top-nav, above mode cards)
- Collapsed: shows progress dots (0/3 complete) with flame icon
- Expanded (tap): 3 challenge cards with progress bars and descriptions
- Completion animation: check mark + haptic + sound (Phase 1 feedback)

**Reward:** No currency. Completion contributes to a new "Challenger" achievement series (complete 4/12/52 weeks of challenges). Weekly challenge completion count visible on profile.

### 2.3 Referral System

**Problem:** No organic growth mechanism. Users can share the app URL but there's no incentive or tracking.

**Solution:** Tracked referral program tied to Pro trial reward. Already spec'd in subscription-refinement design.

**Mechanic:**
- Each user gets a unique referral code (auto-generated on signup, stored in `profiles.referral_code`)
- Share link: `https://stepovr.app/r/{code}` → opens app or store
- Referee signs up + plays 1 game → referral "qualifies"
- 3 qualified referrals → referrer earns 7-day Pro trial
- Referee earns 3-day Pro trial on signup (immediate incentive to install)
- One-time reward per referrer (not stackable — prevents abuse)

**Database:**
- Add `referral_code` column to `profiles`
- New `referrals` table: id, referrer_id, referee_id, status (invited/signed_up/qualified), created_at, qualified_at

**Backend:**
- `ReferralModule`: generate codes, track signups, qualify on first game, grant trials
- Fraud guards: same device check, minimum game time to qualify, rate limit (max 10 invites/day)

**Frontend:**
- Referral card in profile: "Invite friends, earn Pro" with progress (2/3 friends)
- Share button → native share sheet with personalized message + link
- Referee onboarding: "Invited by @username" banner + 3-day trial badge

### 2.4 Streak Enhancements

**Problem:** Streaks exist but are buried in the profile page. No home page visibility, no milestone celebrations, no recovery mechanism.

**Enhancements:**

**Streak flame on home page:**
- Small flame icon + day count in the top-nav area (next to settings)
- Tapping opens a streak detail sheet: current streak, best streak, "play to extend" CTA
- Flame color scales: 1-6 days (orange), 7-29 (blue), 30-99 (purple), 100+ (gold)

**Streak milestones:**
- Special celebration screen at 7, 30, 100, 365 days
- Full-screen overlay with large flame + day count + haptic + sound
- Creates a milestone achievement (ties into achievements system)

**Streak freeze (Pro only):**
- 1 free freeze per week for Pro subscribers
- If the user misses a day and has a freeze available → auto-applied, streak preserved
- Visual indicator: snowflake icon on the frozen day in streak detail
- Backend: `streak_freezes` table (user_id, week_start, used_at). Check on streak evaluation.
- Strong Pro conversion hook — casual users who build a streak don't want to lose it

---

## Phase 3: Grow

Viral loops and social features that drive organic acquisition.

### 3.1 Share Results

**Problem:** Users can share game invites but cannot share their scores, results, or achievements. No viral loop after a satisfying game.

**Solution:** Branded shareable result cards generated client-side.

**Shareable moments:**
| Moment | Card Content |
|--------|-------------|
| Solo finish | Score (8/10), ELO change (+12), tier badge, accuracy |
| Duel win | "Beat @opponent 7-4", winner's tier |
| Duel loss | "Lost to @opponent 4-7 — rematch?" (loss sharing is optional) |
| Battle Royale | Placement (#1 of 8), questions answered |
| Logo Quiz | Streak count, logos identified |
| Achievement unlock | Achievement name + icon + description |
| Streak milestone | Day count + flame |
| Weekly challenge complete | "Completed all 3 weekly challenges" |

**Implementation:**
- `ResultCardService` — generates a canvas image (branded Stepover card, 1080x1920 or 1080x1080)
- Card layout: Stepover logo top, result content center, "Play at stepovr.app" bottom
- Share via Capacitor Share plugin (`@capacitor/share`) → native share sheet
- Text fallback for platforms that don't support image sharing
- "Share" button added to all result screens

**OG Preview endpoint:**
- `GET /api/og/result/:resultId` → server-rendered HTML with OG meta tags + dynamic image
- Image generated via Sharp or canvas on backend (cached)
- Allows rich previews when links shared on social/messaging

### 3.2 Friend System

**Problem:** No social graph. Players are isolated. Leaderboard is global-only. Can't challenge specific people without sharing a code.

**Solution:** Lightweight friend system focused on competition, not social feed.

**Features:**
- **Add friend:** Search by username or share a friend code (6-char alphanumeric)
- **Friend requests:** Must be accepted (no auto-follow). Notification on request received.
- **Friend leaderboard:** New tab on leaderboard page (Global | Friends toggle). Shows ELO ranking among friends only.
- **Challenge friend:** Tap friend → "Challenge to Duel" → creates a private duel room, sends push notification
- **Activity snippets:** Minimal feed on friends tab — "Alex reached Diamond", "Sam is on a 14-day streak". Not a social feed — just milestone events.
- **Block:** Block a user → removes friendship, prevents future requests

**Database:**
- `friendships` table: id, requester_id, addressee_id, status (pending/accepted/blocked), created_at, updated_at
- Symmetric queries: friend list = WHERE (requester_id = me OR addressee_id = me) AND status = accepted
- Index on both user ID columns

**Backend:**
- `FriendModule`: CRUD operations, friend search, activity feed query
- Rate limit: max 20 friend requests per day

**Frontend:**
- Friends tab accessible from leaderboard or profile
- Friend list component with search, pending requests section
- Challenge button per friend row

### 3.3 Deep Link Previews

**Problem:** Shared links show as plain URLs in messaging apps. No rich preview, no branded card, no context about what the link opens.

**Solution:** Server-rendered OG meta tags + iOS Universal Links + Android App Links.

**Links that need OG previews:**
| Link Pattern | OG Title | OG Image |
|-------------|----------|----------|
| `/r/{code}` (referral) | "Join Stepover — Football Quiz" | Branded app card |
| `/join/{code}` (game invite) | "Join @player's game on Stepover" | Mode-specific card |
| `/duel/{id}` (duel challenge) | "Duel challenge from @player" | Duel matchup card |
| `/profile/{userId}` | "@player — Gold Tier, 1450 ELO" | Profile card with tier |
| `/og/result/{id}` (shared result) | "I scored 8/10 on Stepover" | Result card image |

**App Links setup:**
- iOS: `apple-app-site-association` file at `stepovr.app/.well-known/`
- Android: `assetlinks.json` at `stepovr.app/.well-known/`
- Redirect logic: If app installed → open app to correct screen. If not → redirect to App Store / Play Store.

**Backend:**
- Middleware or route handler that serves OG HTML for crawler user agents (Facebook, Twitter, WhatsApp, iMessage)
- Regular users get redirected to app or store

### 3.4 Profile Enhancements

**Problem:** Profile stats are comprehensive for Solo/Mayhem/Blitz but missing for Duel, Logo Quiz, News, and Battle Royale.

**New per-mode stat cards:**
| Mode | Stats to Add |
|------|-------------|
| Duel | Wins, losses, draws, win rate %, current duel ELO |
| Logo Quiz | Total logos identified, best streak, accuracy %, Logo Quiz ELO |
| News | Rounds played, average score, current news streak |
| Battle Royale | Games played, wins, avg placement, win rate % |

**Additional profile features:**
- **Share profile button** — share link with OG preview (from 3.3)
- **Weekly challenge badges** — completed weeks counter, displayed near achievements
- **Favorite mode badge** — auto-calculated from most-played mode, shown on profile hero
- **Total time played** — aggregate from all modes (tracked via game session duration)

**Backend:**
- New aggregation queries in SupabaseService for missing mode stats
- May require denormalized counters in `profiles` table or computed from existing game tables

---

## Phase 4: Launch

App Store presence and final pre-submission checks.

### 4.1 App Store Screenshots & Metadata

**Screenshots (6 per platform, priority order):**
1. Home page — mode selection hub ("Every football question. One app.")
2. Solo question — ELO tier badge visible ("Climb the ranks")
3. Duel matchup — 1v1 in action ("Challenge anyone, anytime")
4. Logo Quiz — logo identification ("How well do you know the crests?")
5. Battle Royale — 8-player lobby ("Last fan standing")
6. Profile — stats, achievements, streak flame ("Track your journey")

**Device frames:** iPhone 15 Pro Max (6.7"), iPhone 14 Plus (6.5"). Android: Pixel 8 equivalent.

**Metadata:**
- **Title (30 chars):** "Stepover — Football Quiz"
- **Subtitle (30 chars):** "Trivia, Duels & Logo Quiz"
- **Keywords (100 chars):** football,quiz,trivia,soccer,duel,logo,premier league,champions league,elo,ranked
- **Category:** Games > Trivia
- **Age rating:** 4+ (no objectionable content, no user-generated content visible to others beyond usernames)

### 4.2 App Preview Video

**Duration:** 15-30 seconds

**Storyboard:**
1. App opens → home page with mode cards (2s)
2. Tap Solo → question appears, user selects correct answer, green flash + haptic indicator (4s)
3. ELO goes up with tier badge animation (2s)
4. Swipe to Duel → matchmaking animation → "Opponent found!" (3s)
5. Quick duel gameplay — answer + score update (3s)
6. Cut to Battle Royale lobby filling up (2s)
7. Logo Quiz — identify a crest, streak counter going up (3s)
8. End on profile: achievements, streak flame, tier badge (3s)
9. Stepover logo + "Download now" (2s)

**Specs:** 1080x1920 portrait, H.264, 30fps. Background music: upbeat royalty-free track. UI sounds from Phase 1.

### 4.3 ASO — App Store Optimization

**Keyword strategy:**
- Primary: football quiz, soccer trivia, football trivia
- Secondary: logo quiz, football duel, sports quiz
- Long-tail: premier league quiz, champions league trivia, football elo ranking
- Competitor adjacency: quiz clash, trivia crack, football quiz game

**Description structure:**
1. Hook line (value prop)
2. Mode bullets (Solo, Duel, BR, Logo Quiz)
3. Feature highlights (ELO ranking, achievements, streaks)
4. Social proof placeholder (update post-launch with review quotes)
5. Pro benefits summary

**Localization priority:** English (primary), Spanish, Portuguese, German, French — the top 5 football markets by app store downloads.

### 4.4 Pre-Launch Checklist

**Code TODOs to resolve:**
- [ ] `frontend/capacitor.config.ts:16` — Add Google Cloud Console Web Client ID for GoogleAuth
- [ ] `frontend/capacitor.config.ts:20` — Replace test AdMob App IDs with production IDs
- [ ] `backend/src/subscription/iap-validation.service.ts:15,20` — Remove yearly product handling once safe

**Infrastructure:**
- [ ] Upgrade Supabase to Pro plan (realtime capacity for multiplayer)
- [ ] Verify rate limiting on all public API endpoints
- [ ] Load test multiplayer endpoints (Duel queue, BR lobby)
- [ ] Verify Redis is provisioned for production throttling

**Store compliance:**
- [ ] Privacy Policy URL live and linked in app + store listing
- [ ] Terms of Service URL live and linked
- [ ] iOS: IDFA usage declaration (PostHog analytics)
- [ ] iOS: App Privacy nutrition labels filled
- [ ] Android: Data safety section filled
- [ ] Content rating questionnaire submitted
- [ ] IAP products configured in App Store Connect + Google Play Console
- [ ] Review guidelines self-check (no broken features, no placeholder content)

**Final QA:**
- [ ] Full QA pass on iOS device
- [ ] Full QA pass on Android device
- [ ] Test IAP purchase flow (sandbox)
- [ ] Test push notification delivery (both platforms)
- [ ] Test deep links (app installed + not installed)
- [ ] Test offline → online transition in each game mode

---

## Dependency Graph

```
Phase 1 (Feel) — no dependencies, all items independent
  ├── 1.1 Haptic & Sound ← needed by Phase 2 (streak milestones, challenge completion)
  ├── 1.2 Skeleton Loaders
  ├── 1.3 Empty States ← used by Phase 2 (weekly challenges empty), Phase 3 (friends empty)
  ├── 1.4 Error Recovery
  ├── 1.5 Settings Cleanup ← Phase 2 push notification prefs plug into this
  └── 1.6 Hide Blitz

Phase 2 (Retain) — depends on Phase 1 for polish
  ├── 2.1 Push Notifications ← needed by Phase 3 (friend requests, BR invites)
  ├── 2.2 Weekly Challenges
  ├── 2.3 Referral System ← needs deep links from Phase 3 for full experience
  └── 2.4 Streak Enhancements

Phase 3 (Grow) — depends on Phase 2 for push notifications
  ├── 3.1 Share Results ← needs OG endpoint from 3.3
  ├── 3.2 Friend System ← needs push from 2.1
  ├── 3.3 Deep Link Previews ← used by 3.1, 3.2, 2.3
  └── 3.4 Profile Enhancements

Phase 4 (Launch) — depends on all phases being complete
  ├── 4.1 Screenshots (need final UI from Phases 1-3)
  ├── 4.2 Preview Video (need final UI + sounds from Phase 1)
  ├── 4.3 ASO (can start early, finalize after features settle)
  └── 4.4 Pre-Launch Checklist (final gate)
```

## Out of Scope

- Offline-first gameplay (service workers, cached games) — complexity vs. value doesn't justify for v1
- Full social feed — Stepover is a game, not a social network
- In-app currency/gems — ELO and achievements are the progression system
- Seasonal events/battle pass — post-launch based on user engagement data
- Tablet optimization — phone-primary for v1
- Web app — native iOS/Android only
- XP/Level system — ELO tiers serve this purpose
- Language switching UI — English only for v1, localization is store metadata only
