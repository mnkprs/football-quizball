# App Store Launch — Design Spec

> **Date:** 2026-04-05
> **Status:** Draft
> **Target:** Simultaneous iOS App Store + Google Play Store launch
> **Approach:** Sequential 4-phase rollout (Foundation → Store Infra → Features → Submission)
> **Timeline:** ~4-5 weeks, no rush, do it right

---

## Context

StepOvr is a football trivia quiz app (Angular 20 frontend + NestJS backend + Supabase) currently deployed as a web app on Vercel/Railway. The app has Capacitor v7.6.0 configured but native projects have not been generated yet. Social auth stubs (Google, Apple), IAP code (`cordova-plugin-purchase`), legal pages, and a comprehensive `pre-production.md` checklist already exist.

### What exists
- Capacitor config (`com.stepovr.app`, webDir matches Angular output)
- Google Sign-In + Apple Sign-In code (credentials empty, flows implemented)
- IAP service with `stepovr_pro_monthly` + `stepovr_pro_lifetime` products
- Backend receipt validation (Apple JWS + Google Play)
- Privacy policy + Terms of Service at `/privacy` and `/terms`
- PostHog analytics, Google AdSense (web-only)
- PWA manifest + service worker
- `pre-production.md` with detailed checklists

### What's missing
- Native iOS/Android projects (not yet generated)
- Firebase project (FCM, Crashlytics)
- OAuth credentials (Google Client IDs, Apple Sign-In keys)
- IAP products in store consoles
- App icons (1024×1024), splash screen, screenshots
- Deep linking (.well-known files, native config)
- Push notifications
- Crash reporting
- AdMob (native ad replacement for AdSense)
- Account deletion endpoint
- Offline handling
- Realtime optimization (Broadcast migration)

### Accounts
- Apple Developer account: active
- Google Play Developer account: active

### Decisions
- **Category:** Trivia (primary), Sports (secondary)
- **Age rating:** 4+ (iOS), Everyone (Android)
- **Push notifications:** Full suite (gameplay + engagement + marketing)
- **Crash reporting:** Firebase Crashlytics (frontend/native), Railway logs (backend)
- **IAP pricing:** TBD (to be set in store consoles when ready)
- **App name:** StepOvr (standardize everywhere)

---

## Phase 1: Foundation

Everything in later phases depends on this phase completing first.

### 1.1 Generate native projects

Run Capacitor commands to scaffold iOS and Android native projects:

```bash
cd frontend && npx cap add ios && npx cap add android && npx cap sync
```

This creates `ios/` and `android/` directories. Verify:
- iOS project opens in Xcode without errors
- Android project opens in Android Studio without errors
- Web assets are copied to native projects

### 1.2 Firebase project setup

Create a Firebase project named "StepOvr" in the Firebase Console.

**iOS app:**
- Bundle ID: `com.stepovr.app`
- Download `GoogleService-Info.plist` → place in `ios/App/App/`

**Android app:**
- Package name: `com.stepovr.app`
- Add SHA-1 fingerprint from the upload signing key
- Download `google-services.json` → place in `android/app/`

**Enable services:**
- Cloud Messaging (FCM)
- Crashlytics

### 1.3 Code signing

**iOS:**
- Create Distribution certificate in Apple Developer Portal
- Create App Store provisioning profile for `com.stepovr.app`
- Configure in Xcode → Signing & Capabilities

**Android:**
- Generate upload keystore locally: `keytool -genkey -v -keystore stepovr-upload.jks -keyalg RSA -keysize 2048 -validity 10000`
- Enroll in Play App Signing (Google manages the app signing key, you keep the upload key)
- Store keystore securely (NOT in git)

### 1.4 Deep linking

**iOS Universal Links:**
- Create `ios/App/App/App.entitlements` with Associated Domains: `applinks:football-quizball.vercel.app`
- Host `apple-app-site-association` at `https://football-quizball.vercel.app/.well-known/apple-app-site-association`
- Paths: `/join/*`, `/battle-royale/*`, `/duel/*`

**Android App Links:**
- Add intent-filter to `AndroidManifest.xml` with `android:autoVerify="true"` for the same paths
- Host `assetlinks.json` at `https://football-quizball.vercel.app/.well-known/assetlinks.json`

**Custom URL scheme (OAuth fallback):**
- iOS: Register `com.stepovr.app` scheme in `Info.plist` → `CFBundleURLTypes`
- Android: Add intent-filter for `com.stepovr.app` scheme in `AndroidManifest.xml`

### 1.5 Backend production config

Set these environment variables on Railway:

| Variable | Value |
|----------|-------|
| `FRONTEND_URL` | `https://football-quizball.vercel.app` |
| `CORS_ORIGIN` | `https://football-quizball.vercel.app,capacitor://localhost,http://localhost` |
| `NODE_ENV` | `production` |
| `MAX_WORKERS` | `4` |
| `ADMIN_API_KEY` | Generate with `openssl rand -hex 32` |

**Infrastructure upgrades:**
- Supabase: Upgrade to Pro ($25/mo)
- Upstash Redis: Upgrade to pay-as-you-go

---

## Phase 2: Store Infrastructure & Auth

### 2.1 Google OAuth credentials

Create 3 OAuth 2.0 Client IDs in Google Cloud Console → APIs & Services → Credentials:

1. **Web application** — Authorized redirect URI: `https://npwneqworgyclzaofuln.supabase.co/auth/v1/callback`
2. **iOS** — Bundle ID: `com.stepovr.app`
3. **Android** — Package: `com.stepovr.app` + SHA-1 fingerprint from upload key

Set the Web Client ID in:
- `frontend/capacitor.config.ts` → `GoogleAuth.serverClientId`
- `frontend/src/environments/environment.prod.ts` → `googleWebClientId`

Enable Google provider in Supabase Dashboard → Authentication → Providers → Google with Client ID + Client Secret.

### 2.2 Apple Sign-In credentials

In Apple Developer Portal:
1. Register App ID `com.stepovr.app` with "Sign In with Apple" capability
2. Register a Services ID for web OAuth redirect
3. Create a Key for Sign In with Apple

In Supabase Dashboard → Authentication → Providers → Apple:
- Add Services ID, Team ID, Key ID + private key
- Redirect URL: `https://npwneqworgyclzaofuln.supabase.co/auth/v1/callback`

In Xcode:
- Add "Sign In with Apple" capability to the app target
- Verify `App.entitlements` includes the capability

### 2.3 Supabase Auth URL configuration

Supabase Dashboard → Authentication → URL Configuration:
- **Site URL:** `https://football-quizball.vercel.app`
- **Redirect URLs:**
  - `https://football-quizball.vercel.app/`
  - `com.stepovr.app://`
  - `http://localhost:4200/`

### 2.4 IAP product creation

**Apple App Store Connect:**
1. Create app record with bundle ID `com.stepovr.app`
2. Create subscription group "STEPOVR Pro"
3. Add `stepovr_pro_monthly` (auto-renewable subscription) — pricing TBD
4. Add `stepovr_pro_lifetime` (non-consumable) — pricing TBD
5. Enable App Store Server Notifications v2:
   - Production URL: `https://football-quizball-production.up.railway.app/api/subscription/apple-notification`
   - Sandbox URL: same endpoint
6. Generate App Store Connect API key (.p8 file) for receipt validation

**Google Play Console:**
1. Create app listing with package `com.stepovr.app`
2. Create subscription: `stepovr_pro_monthly` — pricing TBD
3. Create one-time product: `stepovr_pro_lifetime` — pricing TBD
4. Set up RTDN via Google Cloud Pub/Sub:
   - Topic: `stepovr-iap-notifications`
   - Push subscription → `https://football-quizball-production.up.railway.app/api/subscription/google-notification`
5. Create Google Cloud Service Account with `androidpublisher` role, download JSON key

**Backend env vars (Railway):**

| Variable | Source |
|----------|--------|
| `APPLE_IAP_KEY_ID` | App Store Connect API key |
| `APPLE_IAP_ISSUER_ID` | App Store Connect API key |
| `APPLE_IAP_PRIVATE_KEY` | Contents of .p8 file |
| `APPLE_BUNDLE_ID` | `com.stepovr.app` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Contents of service account JSON |

**Database:** Run pending migration `supabase/migrations/20260415000000_iap_hybrid.sql` via `supabase db push` or SQL Editor.

### 2.5 App name standardization

Standardize on **StepOvr** in all locations:
- `frontend/capacitor.config.ts` → `appName`
- `frontend/public/manifest.webmanifest` → `name` and `short_name`
- `android/app/src/main/res/values/strings.xml` → `app_name`
- iOS `Info.plist` → `CFBundleDisplayName`
- Legal pages (privacy, terms) — update any references to "Stepover"
- Store listings

### 2.6 App icons & splash screen

**App icon:**
- Generate 1024×1024 PNG (no transparency, no rounded corners) from existing `stepovr-logo.png`
- Use a tool like `cordova-res` or manual export to generate all platform-specific sizes
- iOS: supply 1024×1024, Xcode generates the rest via asset catalog
- Android: supply 512×512 (Play Store) + adaptive icon (foreground + background layers)

**Splash screen:**
- Install `@capacitor/splash-screen`
- Configure branded splash: dark background (#000000) with StepOvr logo centered
- Set `launchShowDuration: 2000`, `launchAutoHide: true`
- Replace the manual splash fade in `app.ts` with Capacitor splash screen plugin

**Status bar:**
- Install `@capacitor/status-bar`
- Configure dark background to match app theme
- Set `style: Style.Dark` on app initialization

---

## Phase 3: Features & Polish

### 3.1 Push notifications (FCM)

**Install:** `@capacitor/push-notifications`

**Backend — NotificationModule (NestJS):**
- `NotificationService`: wraps Firebase Admin SDK (`firebase-admin` package)
- `NotificationController`: admin endpoints for broadcast pushes
- Initialize Firebase Admin with service account credentials from env var

**Database — `device_tokens` table:**

```sql
CREATE TABLE device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, token)
);
```

**Frontend — token registration:**
- On app launch (native only): request push permission, get FCM token
- On login: POST token to `/api/notifications/register`
- On logout: DELETE token via `/api/notifications/unregister`
- Listen for `pushNotificationReceived` and `pushNotificationActionPerformed` events
- Route to appropriate screen based on notification payload (duel, battle royale, etc.)

**Notification triggers:**

| Category | Trigger | Message example |
|----------|---------|-----------------|
| Gameplay | Opponent answered in duel | "Your opponent just answered! Your turn." |
| Gameplay | Battle Royale starting | "Battle Royale starts in 60 seconds — join now!" |
| Gameplay | Duel invite received | "{username} challenged you to a duel!" |
| Engagement | Daily challenge available | "Today's daily challenge is live. Can you beat your streak?" |
| Engagement | Streak at risk | "Your 7-day streak ends today — play now to keep it!" |
| Engagement | Friend joined | "{username} just joined StepOvr!" |
| Marketing | New feature | "Logo Quiz mode is here! Test your badge knowledge." |
| Marketing | Leaderboard milestone | "You're now in the top 100! Keep climbing." |
| Marketing | Promotional | "Pro is 50% off this weekend — unlock all modes." |

**iOS specifics:**
- Request notification permission after first completed game (not on launch — better conversion)
- APNs certificate or key must be uploaded to Firebase Console

### 3.2 Firebase Crashlytics

**Install:** `@capacitor-community/firebase-crashlytics` (or `@capawesome/capacitor-firebase-crashlytics`)

**Frontend integration:**
- Initialize Crashlytics in `app.component.ts` on native platform only (`Capacitor.isNativePlatform()`)
- Log non-fatal errors from existing Angular `ErrorHandler`
- Set user ID on login for crash attribution: `FirebaseCrashlytics.setUserId({ userId })`
- Log custom keys for debugging: current game mode, ELO, etc.

**Backend:** No Crashlytics — Railway logs + existing Pino logging are sufficient for server-side errors.

### 3.3 AdMob for native

**Install:** `@capacitor-community/admob`

**Setup:**
- Create AdMob account at admob.google.com
- Register iOS app + Android app
- Create ad unit IDs (banner and/or interstitial)

**Platform-conditional loading:**
- Native (`Capacitor.isNativePlatform()`): use AdMob plugin
- Web: keep existing AdSense via `google-ads.service.ts`
- Create an `AdService` abstraction that delegates to the correct provider

**iOS ATT (App Tracking Transparency):**
- Must show ATT prompt before loading any ads
- Timing: show after first game completion (same timing as push notification prompt)
- If user declines tracking: still show ads but non-personalized
- Add `NSUserTrackingUsageDescription` to `Info.plist`

### 3.4 Offline handling

**Install:** `@capacitor/network`

**OfflineService:**
- Listen for `Network.addListener('networkStatusChange', ...)` on native
- Expose `isOnline` signal for reactive UI binding
- On connectivity loss: show non-dismissible banner at top of screen ("No internet connection")
- On connectivity restored: dismiss banner, no auto-retry of failed requests

**Behavior when offline:**
- Block gameplay actions (answer submission, queue joining) with clear message
- Allow browsing static screens (profile, leaderboard from cache, settings)
- Queue analytics events (PostHog) for later submission

### 3.5 Account deletion

Required by both Apple (App Store Review Guideline 5.1.1) and Google (User Data policy).

**Frontend:**
- Add "Delete Account" button in profile/settings screen
- Two-step confirmation dialog: "This will permanently delete your account and all data. Type DELETE to confirm."

**Backend — `DELETE /api/auth/delete-account`:**
1. Authenticate via JWT (existing AuthGuard)
2. Delete from tables: `elo_history`, `device_tokens`, battle royale entries, duel games (as participant)
3. Delete `profiles` row
4. Call `supabase.auth.admin.deleteUser(userId)`
5. Return success

**Frontend post-deletion:**
- Clear local storage, session, tokens
- Navigate to home/login screen

### 3.6 App versioning

**Initial release version:** `1.0.0` (stores expect first submission to start fresh)

**Sync points for each release:**
- `frontend/src/environments/environment.prod.ts` → `appVersion: '1.0.0'`
- `ios/App/App/Info.plist` → `CFBundleShortVersionString: '1.0.0'`, `CFBundleVersion: '1'`
- `android/app/build.gradle` → `versionName: '1.0.0'`, `versionCode: 1`

**Version bump checklist** (document in repo for future releases):
1. Increment version in all 3 locations
2. Android: always increment `versionCode` (integer, must increase every upload)
3. iOS: increment `CFBundleVersion` (build number, must increase per upload)
4. Tag git commit: `git tag v1.0.0`

### 3.7 Realtime optimization — Broadcast migration

Per `pre-production.md` item #5: switch Battle Royale from `postgres_changes` to Supabase Broadcast.

**Backend changes:**
- After a player answers, publish updated leaderboard to Broadcast channel `br:${roomId}`
- Use Supabase JS client `channel.send()` instead of relying on DB triggers

**Frontend changes:**
- Subscribe to 1 Broadcast channel instead of 2 `postgres_changes` channels
- Receive leaderboard payload directly — remove `refreshRoom()` API call
- Remove 500ms debounce (no longer needed)

**Impact:** Cuts realtime connections from 800→400 at target 400 players. Eliminates redundant DB queries on each answer.

---

## Phase 4: Submission & Launch

### 4.1 App Store listing content

**Both platforms:**
- **App name:** StepOvr
- **Subtitle/short description:** Football Trivia & Quiz Game
- **Keywords:** football, trivia, quiz, soccer, ELO, ranked, duel, logo, battle royale

**Full description (adapt per platform):**

> Test your football knowledge in StepOvr — the ultimate football trivia app.
>
> **Game Modes:**
> - **Solo** — Climb the ELO ranks with AI-generated questions matched to your skill level
> - **Duel** — Challenge players to head-to-head trivia battles
> - **Battle Royale** — Compete against up to 50 players in elimination rounds
> - **Logo Quiz** — Identify football club badges from partial reveals
> - **Blitz** — Speed round: answer as many as you can before time runs out
> - **Mayhem** — Free-for-all chaos mode
>
> **Features:**
> - ELO ranking system that adapts to your skill
> - Real-time multiplayer with instant matchmaking
> - Thousands of questions across transfers, history, tactics, and more
> - Daily challenges and streak tracking
> - Global leaderboard
>
> **StepOvr Pro** unlocks unlimited duels, ad-free experience, and exclusive modes.

### 4.2 Screenshots & marketing assets

**iOS screenshots (minimum 3 per size):**
- 6.7" (iPhone 15 Pro Max): 1290×2796
- 6.1" (iPhone 15 Pro): 1179×2556

**Android screenshots (minimum 4):**
- Phone: 1080×1920 minimum

**Recommended screenshots (5-6 per platform):**
1. Home screen showing all game modes
2. Duel gameplay (question + answer choices + timer)
3. Logo Quiz (partially revealed badge)
4. Battle Royale live leaderboard
5. ELO profile / stats screen
6. Pro upgrade modal showing benefits

**Play Store feature graphic:** 1024×500 PNG — hero image with StepOvr logo + gameplay montage

**Optional:** 15-30s app preview video showing a duel round + battle royale.

### 4.3 Privacy & compliance

**Verify public accessibility:**
- `https://football-quizball.vercel.app/privacy` must load
- `https://football-quizball.vercel.app/terms` must load
- Both URLs go into store listings as Privacy Policy URL and Support URL

**Apple Privacy Nutrition Labels (App Store Connect):**

| Data type | Collected | Linked to identity | Used for tracking |
|-----------|-----------|-------------------|-------------------|
| Email address | Yes | Yes | No |
| User ID | Yes | Yes | No |
| Gameplay data | Yes | Yes | No |
| Analytics (PostHog) | Yes | No | No |
| Advertising (AdMob) | Yes | No | Yes (with ATT consent) |
| Purchase history | Yes | Yes | No |

**Google Data Safety section (Play Console):**
- Declare same data collection categories
- State data is encrypted in transit (HTTPS)
- State users can request deletion (account deletion feature)

**iOS ATT prompt:**
- `NSUserTrackingUsageDescription`: "StepOvr uses this to show you relevant ads and improve your experience."
- Show after first game, not on launch

**Play Console ads declaration:**
- Declare app contains ads
- AdMob app ID in `AndroidManifest.xml`

### 4.4 Beta testing

**iOS TestFlight:**
- Upload build via Xcode → App Store Connect
- Add 5-10 internal testers
- Run for minimum 1 week
- Test: signup (email + Google + Apple), solo, duel, battle royale, logo quiz, IAP purchase + restore, push notifications, deep links, offline banner

**Google Internal Testing:**
- Upload signed AAB to internal test track
- Add same tester group via email
- Test same flows as iOS

**IAP sandbox testing:**
- Apple: Create sandbox tester accounts, test on physical device. Sandbox subscriptions auto-renew every 5 minutes.
- Google: Add tester emails to license testing. Test purchase + restore + cancel flows.
- Verify end-to-end: purchase → receipt to backend → `is_pro` flag set in Supabase

**Prepare demo account for reviewers:**
- Create a test account with email/password (Apple reviewers often need login credentials)
- Pre-populate with some game history so the app doesn't look empty

### 4.5 Store submission

**iOS:**
- Submit through App Store Connect
- Expected review time: 1-3 days
- Preempt common rejection reasons:
  - Sign In with Apple is present (required when offering Google Sign-In) ✓
  - No external payment links in native app (Stripe references removed) ✓
  - Account deletion available ✓
  - Privacy nutrition labels completed ✓
  - ATT prompt before ad tracking ✓
- Provide demo account credentials in review notes

**Android:**
- Submit through Play Console
- Expected review time: 1-7 days (longer for first submission)
- Complete content rating questionnaire (IARC)
- Complete data safety section
- Target API level 34+

### 4.6 Post-submission monitoring

- Monitor review status daily in both consoles
- Prepare a quick-fix branch for any rejection feedback
- After Apple approval: release immediately
- After Google approval: staged rollout (10% → 50% → 100% over 3 days)
- Monitor Crashlytics for any new crash patterns from store users
- Monitor PostHog for user flow issues

---

## Technical changes summary

### New packages to install (frontend)

| Package | Purpose |
|---------|---------|
| `@capacitor/push-notifications` | FCM push notifications |
| `@capacitor/splash-screen` | Native splash screen |
| `@capacitor/status-bar` | Status bar styling |
| `@capacitor/network` | Offline detection |
| `@capacitor-community/admob` | Native ads (replaces AdSense) |
| `@capacitor-community/firebase-crashlytics` | Crash reporting |

### New packages to install (backend)

| Package | Purpose |
|---------|---------|
| `firebase-admin` | FCM push notification sending |

### New backend modules

| Module | Purpose |
|--------|---------|
| `NotificationModule` | FCM push notification sending via firebase-admin |
| Account deletion endpoint | `DELETE /api/auth/delete-account` |

### New database tables/changes

| Table/Change | Purpose |
|-------------|---------|
| `device_tokens` | FCM token storage |
| Run `20260415000000_iap_hybrid.sql` | IAP fields on profiles |

### New files to host (Vercel)

| File | Purpose |
|------|---------|
| `public/.well-known/apple-app-site-association` | iOS universal links |
| `public/.well-known/assetlinks.json` | Android app links |

### Config changes

| Location | Change |
|----------|--------|
| Railway env vars | 8+ new variables (see Phases 1-2) |
| Supabase Auth | Site URL + redirect URLs |
| Supabase plan | Free → Pro |
| Upstash plan | Free → pay-as-you-go |
| `capacitor.config.ts` | Google Auth serverClientId |
| `environment.prod.ts` | googleWebClientId, appVersion → 1.0.0 |

---

## Non-technical tasks

| Task | Owner | Phase |
|------|-------|-------|
| Apple Developer Portal: certs, provisioning, App ID | You | 1 |
| Android signing key generation | You | 1 |
| Firebase Console: project creation, FCM/Crashlytics enable | You | 1 |
| Google Cloud Console: 3 OAuth Client IDs | You | 2 |
| Apple Developer Portal: Sign In with Apple key | You | 2 |
| App Store Connect: app record, IAP products | You | 2 |
| Play Console: app record, IAP products | You | 2 |
| AdMob account: register apps, create ad units | You | 3 |
| Design 1024×1024 app icon | You | 2 |
| Capture/create store screenshots (5-6 per platform) | You | 4 |
| Play Store feature graphic (1024×500) | You | 4 |
| Set IAP pricing in both stores | You | 2 |
| Beta tester recruitment (5-10 people) | You | 4 |
| Review and submit to both stores | You | 4 |

---

## Estimated monthly cost at launch

| Component | Cost |
|-----------|------|
| Railway (backend, 4 workers) | $5/mo |
| Supabase Pro | $25/mo |
| Upstash Redis (pay-as-you-go) | ~$1-5/mo |
| Firebase (FCM + Crashlytics) | Free |
| Vercel (frontend) | Free |
| Apple Developer account | $99/year |
| Google Play Developer account | $25 one-time |
| **Total** | **~$35-40/mo** |
