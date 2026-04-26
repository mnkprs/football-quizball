# Pre-Production Checklist — StepOver

> Last updated: 2026-04-20
> Target: 400 concurrent players

---

## Must Have (blocks launch)

### 1. Upgrade Supabase to Pro ($25/mo)
- **Why:** Free tier allows 200 concurrent realtime connections. At 400 players with 2 channels each, you need 800 channel subscriptions. Pro gives 500 — still short, but paired with the Broadcast optimization (see #5) it's enough.
- **How:** Supabase Dashboard → Billing → Upgrade to Pro
- **Also unlocks:** More DB connections (free: 60, Pro: ~100+), 8GB storage, daily backups

### 2. Set MAX_WORKERS=4 on Railway
- **Why:** Backend runs NestJS in cluster mode, defaulting to 2 workers. At 133 req/s peak, that's 66 req/s per worker. 4 workers gives comfortable headroom.
- **How:** Railway Dashboard → Backend service → Variables → Add `MAX_WORKERS=4`
- **Verify:** After deploy, check logs for "Primary starting 4 workers"

### 3. Upgrade Upstash Redis (pay-as-you-go)
- **Why:** Free tier is 10K commands/day. Cache reads + leaderboard lookups alone will exhaust this within an hour at 400 players. Pay-as-you-go charges ~$0.20 per 100K commands.
- **How:** Upstash Console → Database → Upgrade plan
- **Cost:** ~$1-5/mo depending on traffic

---

## Should Have (important for stability)

### 4. Add rate limiting to BR answer endpoint ✅ Done (v0.8.12.0)
- **Why:** No rate limit on `POST /api/battle-royale/:id/answer`. A misbehaving client could spam answers. The CAS guard prevents double-scoring but doesn't prevent the DB load from repeated attempts.
- **Shipped:** Global `UserThrottlerGuard` (keyed by authenticated user id, not IP) registered in `backend/src/app.module.ts`. BR answer endpoint now has `@Throttle({ answer: { limit: 60, ttl: 60_000 } })` (60/min per user). Same named throttler applied to solo + logo-quiz answer endpoints; `fetch` throttler (40/min) applied to question-fetch endpoints. See CHANGELOG v0.8.12.0.

### 5. Switch BR realtime from postgres_changes to Broadcast
- **Why:** `postgres_changes` creates a DB-level subscription per channel. At 50 concurrent games × 2 channels = 100 DB-level listeners triggering on every row change. Broadcast channels are lighter — the backend pushes data directly to the channel, no DB listener needed.
- **How:**
  1. After a player answers, backend publishes the updated leaderboard to a Supabase Broadcast channel (`br:${roomId}`)
  2. Frontend subscribes to 1 Broadcast channel instead of 2 postgres_changes channels
  3. Frontend receives the leaderboard payload directly — no refreshRoom() API call needed
- **Impact:** Cuts realtime connections from 800 to 400. Eliminates all refreshRoom() DB queries. Leaderboard updates become instant (no 500ms debounce needed).

### 6. Add connection pool monitoring
- **Why:** Supabase free tier has ~60 connections. The backend uses a single `createClient()` with service role — no explicit pool config. Under load, each concurrent request holds a connection.
- **How:** Add Supabase connection count to the `/api/health` endpoint. Set up a Railway alert if connections exceed 80% of limit.

---

## Nice to Have (for >500 players or better UX)

### 7. Add minimum player count for BR games
- **Why:** Currently a game can start with 1 player. Not a bug, but a bad experience for Quick Join if bots don't fill fast enough.
- **How:** Enforce minimum 2 players in `startRoom()`. Quick Join matchmaker should wait up to 15s for more players before auto-starting with bots.

### 8. CDN for question images
- **Why:** Logo quiz images and career path badges are served directly. At 400 players loading image-heavy questions simultaneously, origin bandwidth could spike.
- **How:** Serve images through Supabase Storage (already CDN-backed) or Cloudflare R2.

### 9. Pre-warm question pools before peak hours
- **Why:** If the blitz/question pool runs low during peak, the LLM seeding cron won't keep up. AI generation takes 2-5 seconds per question.
- **How:** Schedule `npm run blitz:seed -- 50` and `npm run pool:seed -- 50` to run 1 hour before expected peak traffic.

### 10. Error tracking (Sentry or similar)
- **Why:** At 400 concurrent players, silent errors become invisible. The stress test showed 0 errors, but production traffic has edge cases the test doesn't cover (network timeouts, stale tokens, race conditions).
- **How:** `npm install @sentry/nestjs` for backend. Add Sentry DSN to Railway env vars.

---

## Verified by stress testing (2026-03-25)

| Test | Result |
|------|--------|
| 10 games × 8 bots (80 concurrent players, 800 submissions) | **0 errors**, 108 req/s, p50=98ms, p99=219ms |
| 4 bots × 1 game with browser watching live leaderboard | Realtime updates delivered correctly, all scores reflected |
| Supabase REST latency under load | p50=98ms, p90=116ms (localhost → cloud) |
| refreshRoom debounce | Implemented — collapses multiple realtime events into 1 fetch per 500ms window |
| NG0956 DOM recreation fix | Implemented — `track $index` on all MC choice loops |
| Bot FK constraint fix | Fixed — auth.users + profiles created for all 30 dummy_users |

---

## Infrastructure summary

| Component | Current | Production recommendation |
|-----------|---------|--------------------------|
| Frontend | Vercel (free) | Vercel (free is fine — static CDN) |
| Backend | Railway (starter) | Railway ($5/mo) + MAX_WORKERS=4 |
| Database | Supabase (free) | **Supabase Pro ($25/mo)** |
| Cache | Upstash Redis (free) | **Upstash pay-as-you-go (~$1-5/mo)** |
| Realtime | Supabase postgres_changes | **Supabase Broadcast** (code change) |
| Monitoring | None | Sentry ($0 free tier) |

**Estimated monthly cost at 400 players: ~$35/mo**

---

## Mobile App Launch (App Store + Play Store)

### Apple (iOS)

#### Account & Setup
- [ ] **Apple Developer Account** — enroll at developer.apple.com ($99/year)
- [ ] **App Store Connect** — create the app record (bundle ID: `com.stepovr.app`)
- [ ] **Certificates & Provisioning** — create Distribution certificate + App Store provisioning profile
- [ ] **Apple Sign-In** — required by Apple if you offer any social login (Google, etc.). Already planned in Capacitor integration

#### Required Assets
- [ ] **App icon** — 1024×1024 PNG, no alpha/transparency, no rounded corners (Apple adds them)
- [ ] **Screenshots** — minimum 3 per device size:
  - 6.7" (iPhone 15 Pro Max) — 1290×2796
  - 6.1" (iPhone 15 Pro) — 1179×2556
  - iPad Pro 12.9" (if supporting iPad) — 2048×2732
- [ ] **App preview video** (optional but recommended) — 15-30 second gameplay

#### App Store Listing
- [ ] **App name:** StepOver
- [ ] **Subtitle:** Football Trivia & Quiz Game
- [ ] **Category:** Trivia (primary), Sports (secondary)
- [ ] **Description** — feature list, modes, what makes it unique
- [ ] **Keywords** — football, trivia, quiz, soccer, ELO, ranked, daily
- [ ] **Privacy policy URL** — must be publicly accessible (host on GitHub Pages or similar)
- [ ] **Support URL** — can be same page or a simple contact page
- [ ] **Age rating** — complete the questionnaire (likely 4+ or 9+ with no objectionable content)

#### App Review Compliance
- [ ] **Sign-In with Apple** — must be offered alongside Google Sign-In
- [ ] **In-App Purchases** — Pro subscription must use StoreKit/Apple IAP (not Stripe) for iOS. Apple takes 15-30% cut
- [ ] **No external payment links** — cannot link to web checkout from inside the iOS app
- [ ] **IDFA / ATT** — if using AdSense or any ad SDK, must show App Tracking Transparency prompt
- [ ] **Privacy Nutrition Labels** — declare what data you collect in App Store Connect

### Google (Android)

#### Account & Setup
- [ ] **Google Play Developer Account** — enroll at play.google.com/console ($25 one-time)
- [ ] **Create app** in Play Console (package: `com.stepovr.app`)
- [ ] **Signing key** — use Play App Signing (recommended) or upload your own keystore

#### Required Assets
- [ ] **App icon** — 512×512 PNG
- [ ] **Feature graphic** — 1024×500 PNG (shown at top of store listing)
- [ ] **Screenshots** — minimum 2, recommended 4-8 (phone + tablet if supporting)

#### Play Store Listing
- [ ] **App name:** StepOver
- [ ] **Short description** (80 chars max)
- [ ] **Full description** — same as iOS but can be longer
- [ ] **Category:** Trivia
- [ ] **Content rating** — complete IARC questionnaire
- [ ] **Privacy policy URL** — required
- [ ] **Data safety section** — declare data collection/sharing practices

#### Play Store Compliance
- [ ] **In-App Purchases** — Pro subscription must use Google Play Billing for Android (not Stripe). Google takes 15% (first $1M/year)
- [ ] **Target API level** — must target latest Android SDK (currently API 34+)
- [ ] **Ads declaration** — if showing ads, declare in Play Console

### Cross-Platform (both stores)

- [ ] **Capacitor build** — `npx cap sync` working for both iOS and Android
- [ ] **Deep links** — configure app-scheme URLs for duel/game invites
- [ ] **Push notifications** — Firebase Cloud Messaging for both platforms (optional for launch)
- [ ] **Offline handling** — graceful error when no network (currently shows nothing)
- [ ] **Splash screen** — configured via `@capacitor/splash-screen` with new StepOver logo
- [ ] **Status bar** — dark background to match app theme

### Payment Architecture — Native IAP Setup (blocks store submission)

> **Status:** Code implemented on `feat/native-iap` branch. Stripe stays for web, native IAP via `cordova-plugin-purchase` for iOS/Android. Backend validates receipts at `POST /api/subscription/verify-receipt`. All changes share `profiles.is_pro` as single source of truth.

#### Apple App Store IAP
- [ ] **Create subscription product in App Store Connect:**
  1. App Store Connect → Your App → Subscriptions → Create Subscription Group ("Pro")
  2. Add product with ID: `pro_monthly`, price: $1.99/month
  3. Add subscription description and review screenshot
- [ ] **Get shared secret:** App Store Connect → Your App → General → App-Specific Shared Secret → Generate
- [ ] **Set env var on Railway:** `APPLE_SHARED_SECRET=<shared secret from above>`

#### Google Play Store IAP
- [ ] **Create subscription product in Play Console:**
  1. Play Console → Your App → Monetize → Products → Subscriptions → Create
  2. Product ID: `pro_monthly`, price: $1.99/month, billing period: monthly
- [ ] **Create service account for receipt validation:**
  1. Google Cloud Console → IAM & Admin → Service Accounts → Create
  2. Grant role: "Android Publisher" (or link via Play Console → API access)
  3. Create JSON key and download
- [ ] **Set env vars on Railway:**
  - `GOOGLE_PLAY_PACKAGE_NAME=com.stepovr.app`
  - `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY=<paste full JSON key content>`

#### Database Migration
- [ ] **Run IAP migration:** `supabase/migrations/20260325000001_add_iap_fields.sql` adds `iap_platform` and `iap_original_transaction_id` to `profiles` table
  - Run via: Supabase Dashboard → SQL Editor, or `supabase db push`

#### Capacitor Native Platforms
- [ ] **Generate native projects** (after Capacitor deps are installed):
  ```bash
  cd frontend && npx cap add ios && npx cap add android && npx cap sync
  ```

---

## Authentication & OAuth (blocks social login)

### 11. Google Sign-In setup
- **Status:** `capacitor.config.ts` has `serverClientId: ''` (empty). `environment.prod.ts` has `googleWebClientId: ''` (empty).
- **What to do:**
  1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
  2. Create an **OAuth 2.0 Client ID** (Web application type) for Supabase redirect
     - Authorized redirect URI: `https://npwneqworgyclzaofuln.supabase.co/auth/v1/callback`
  3. Create a second **OAuth 2.0 Client ID** (iOS type) with bundle ID `com.stepovr.app`
  4. Create a third **OAuth 2.0 Client ID** (Android type) with package `com.stepovr.app` + SHA-1 fingerprint from your signing key
  5. Set the **Web Client ID** in:
     - `capacitor.config.ts` → `GoogleAuth.serverClientId`
     - `environment.prod.ts` → `googleWebClientId`
  6. Enable the Google provider in **Supabase Dashboard → Authentication → Providers → Google** and paste the Web Client ID + Client Secret
- **iOS extra:** Download `GoogleService-Info.plist` from Firebase Console and add to `ios/App/App/`
- **Android extra:** Download `google-services.json` and add to `android/app/`

### 12. Apple Sign-In setup
- **Status:** `appleClientId` is set to `com.stepovr.app` but no Apple Developer configuration exists.
- **What to do:**
  1. In [Apple Developer Portal](https://developer.apple.com/):
     - Register an **App ID** with "Sign In with Apple" capability
     - Register a **Services ID** (for web OAuth redirect)
     - Create a **Key** for Sign In with Apple
  2. In **Supabase Dashboard → Authentication → Providers → Apple:**
     - Add the Services ID, Team ID, and Key ID + private key
     - Set redirect URL: `https://npwneqworgyclzaofuln.supabase.co/auth/v1/callback`
  3. In Xcode: add "Sign In with Apple" capability to the app target
  4. Create `App.entitlements` file in `ios/App/App/` (currently missing)

### 13. Supabase Auth URL Configuration
- **Status:** Supabase needs to know your production redirect URLs.
- **What to do:**
  1. Supabase Dashboard → Authentication → URL Configuration
  2. Set **Site URL** to: `https://football-quizball.vercel.app` (or your custom domain)
  3. Add **Redirect URLs:**
     - `https://football-quizball.vercel.app/`
     - `com.stepovr.app://` (iOS/Android deep link scheme)
     - `http://localhost:4200/` (for development)

---

## Backend Production Config (blocks deploy)

### 14. Update FRONTEND_URL in Railway
- **Status:** `.env` has `FRONTEND_URL=http://localhost:4200` — must be production URL.
- **How:** Railway → Variables → Set `FRONTEND_URL=https://football-quizball.vercel.app`

### 15. Update CORS_ORIGIN for native apps
- **Status:** CORS only allows `localhost:4200` and `football-quizball.vercel.app`. Native Capacitor apps send requests from `capacitor://localhost` (iOS) and `http://localhost` (Android).
- **How:** Set `CORS_ORIGIN` env var on Railway to:
  ```
  https://football-quizball.vercel.app,capacitor://localhost,http://localhost
  ```
- **Also add** your custom domain if you set one up.

### 16. Secure admin API key
- **Status:** `ADMIN_API_KEY` exists in `.env`. Verify it's set to a strong random value on Railway (not the dev default).
- **How:** `openssl rand -hex 32` → paste into Railway env vars.

### 17. Set NODE_ENV=production on Railway
- **Status:** Enables cluster mode, removes dev-only logging, enables production optimizations.
- **How:** Railway → Variables → `NODE_ENV=production`
- **Verify:** Cluster mode activates (logs show "Primary starting N workers").

---

## Deep Linking & Universal Links (blocks invite sharing)

### 18. iOS Universal Links
- **Status:** No `App.entitlements` file. No Associated Domains configured. The `appUrlOpen` handler in `app.ts` only reads the pathname — won't work without universal link setup.
- **What to do:**
  1. Create `ios/App/App/App.entitlements` with Associated Domains:
     ```xml
     <key>com.apple.developer.associated-domains</key>
     <array>
       <string>applinks:football-quizball.vercel.app</string>
     </array>
     ```
  2. Host `apple-app-site-association` file at `https://football-quizball.vercel.app/.well-known/apple-app-site-association`:
     ```json
     {"applinks":{"apps":[],"details":[{"appID":"TEAMID.com.stepovr.app","paths":["/join/*","/battle-royale/*","/duel/*"]}]}}
     ```
  3. Replace `TEAMID` with your Apple Developer Team ID.

### 19. Android App Links
- **Status:** `AndroidManifest.xml` has no intent-filter for deep links. Only the launcher intent exists.
- **What to do:**
  1. Add intent-filter to `AndroidManifest.xml` inside the `<activity>`:
     ```xml
     <intent-filter android:autoVerify="true">
       <action android:name="android.intent.action.VIEW" />
       <category android:name="android.intent.category.DEFAULT" />
       <category android:name="android.intent.category.BROWSABLE" />
       <data android:scheme="https" android:host="football-quizball.vercel.app" android:pathPrefix="/join" />
       <data android:scheme="https" android:host="football-quizball.vercel.app" android:pathPrefix="/battle-royale" />
       <data android:scheme="https" android:host="football-quizball.vercel.app" android:pathPrefix="/duel" />
     </intent-filter>
     ```
  2. Host `assetlinks.json` at `https://football-quizball.vercel.app/.well-known/assetlinks.json`:
     ```json
     [{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"com.stepovr.app","sha256_cert_fingerprints":["YOUR_SHA256"]}}]
     ```

### 20. Custom URL scheme (fallback for OAuth redirects)
- **Status:** No custom URL scheme registered for native OAuth callback.
- **What to do:**
  1. Add to `ios/App/App/Info.plist`:
     ```xml
     <key>CFBundleURLTypes</key>
     <array><dict>
       <key>CFBundleURLSchemes</key>
       <array><string>com.stepovr.app</string></array>
     </dict></array>
     ```
  2. Add to `AndroidManifest.xml`:
     ```xml
     <intent-filter>
       <action android:name="android.intent.action.VIEW" />
       <category android:name="android.intent.category.DEFAULT" />
       <category android:name="android.intent.category.BROWSABLE" />
       <data android:scheme="com.stepovr.app" />
     </intent-filter>
     ```

---

## Native App Build & Versioning

### 21. Version sync
- **Status:** `environment.prod.ts` says `1.7.0`, iOS `CFBundleShortVersionString` is unset, Android `build.gradle` says `1.0`. These must match for each release.
- **How:** Before each release, update all three:
  - `frontend/src/environments/environment.prod.ts` → `appVersion`
  - `ios/App/App/Info.plist` → `CFBundleShortVersionString`
  - `android/app/build.gradle` → `versionName` + increment `versionCode`

### 22. Android target SDK
- **Status:** Google requires `targetSdkVersion 34` (API 34) minimum as of 2025. Check `build.gradle`.
- **How:** Verify `android/app/build.gradle` has `targetSdkVersion 34` or higher.

### 23. iOS minimum deployment target
- **Status:** Check `ios/App/Podfile` for the deployment target. Should be iOS 15+ minimum.
- **How:** Verify and update if needed in `Podfile` and Xcode project settings.

---

## Ads & Monetization (native)

### 24. Replace AdSense with AdMob for native
- **Status:** Using Google AdSense (`ca-pub-7781323448253047`) which only works on web. Native apps need **Google AdMob**.
- **What to do:**
  1. Create AdMob account at [admob.google.com](https://admob.google.com)
  2. Register iOS and Android apps
  3. Get ad unit IDs for banner/interstitial
  4. Install `@capacitor-community/admob` or `@capawesome/capacitor-admob`
  5. Replace `AdDisplayComponent` with AdMob calls on native, keep AdSense for web
  6. Handle ATT prompt on iOS before loading ads

---

## Security & Privacy

### 25. Privacy policy hosting
- **Status:** Privacy and terms pages exist (`features/legal/privacy.html`, `terms.html`) but need to be accessible via public URL for store listings.
- **How:** Host at `https://football-quizball.vercel.app/privacy` and `https://football-quizball.vercel.app/terms`. Verify routes exist in `app.routes.ts`.

### 26. Data deletion endpoint
- **Status:** Both Apple and Google require users to be able to delete their account and data.
- **What to do:** Add a "Delete my account" button in the profile/settings screen that:
  1. Calls backend to delete: profile, elo_history, match history, BR player entries
  2. Calls `supabase.auth.admin.deleteUser(userId)` to remove the auth user
  3. Signs the user out

### 27. Remove hardcoded secrets from source
- **Status:** `environment.ts` and `environment.prod.ts` contain Supabase anon key (this is fine — anon key is public by design). But verify no service role keys or secret keys are in frontend code.
- **Verified:** No service role keys in frontend. Backend `.env` is gitignored. OK.

---

## Domain & Branding

### 28. Custom domain (optional but recommended)
- **Status:** App is at `football-quizball.vercel.app`. For a production app, a custom domain (e.g., `stepovr.com`) looks more professional and is needed for universal links.
- **How:** Buy domain → Vercel → Settings → Domains → Add. Update all redirect URLs in Supabase, CORS, and universal link configs.

### 29. App name consistency
- **Status:** Multiple names in different places:
  - Capacitor: `StepOvr`
  - Environment: no app name field
  - Pre-production doc: `Stepover`
  - Repo name: `football-quizball`
- **How:** Decide on one name. Update `capacitor.config.ts`, `AndroidManifest.xml` (`app_name`), `Info.plist`, store listings.

---

## Native IAP Monetization (blocks paid features)

### 30. Apple App Store Connect Setup
- **Status:** Code implemented (branch `feat/iap-hybrid-monetization`), store products not yet created
- **How:**
  1. Create Apple Developer account ($99/year) if not already enrolled
  2. Create App ID with In-App Purchase capability in Certificates, Identifiers & Profiles
  3. In App Store Connect, create the app listing
  4. Create In-App Purchase products:
     - `stepovr_pro_monthly` (Auto-Renewable Subscription) — Subscription Group: "STEPOVR Pro", Price: $2.99/mo (Tier 4)
     - `stepovr_pro_lifetime` (Non-Consumable) — Price: $9.99 (Tier 13)
  5. Set per-territory pricing (UAE/Gulf: Tier 6/$3.99, SEA: Tier 2/$1.99, India: Tier 1/$0.99 for monthly; adjust lifetime accordingly)
  6. Add display names, descriptions, and review screenshots for each product
  7. Enable App Store Server Notifications v2:
     - App Store Connect → App → General → App Information → App Store Server Notifications
     - Production URL: `https://your-backend.railway.app/api/subscription/apple-notification`
     - Sandbox URL: same endpoint (service handles both environments)
  8. Generate App Store Connect API key (.p8 file):
     - Users and Access → Keys → In-App Purchase → Generate
     - Save Key ID, Issuer ID, and the .p8 file

### 31. Google Play Console Setup
- **Status:** Code implemented, Play Console products not yet created
- **How:**
  1. Create Google Play Developer account ($25 one-time) if not already enrolled
  2. Create app listing in Google Play Console
  3. Create In-App Products:
     - Subscription: `stepovr_pro_monthly` at $2.99/mo with per-country pricing
     - One-time product: `stepovr_pro_lifetime` at $9.99 with per-country pricing
  4. Activate both products
  5. Set up Real-Time Developer Notifications (RTDN):
     - Google Cloud Console → Pub/Sub → Create topic (e.g., `stepovr-iap-notifications`)
     - Create push subscription pointing to: `https://your-backend.railway.app/api/subscription/google-notification`
     - Play Console → Monetization setup → Real-time developer notifications → Link topic
  6. Create Google Cloud Service Account:
     - Grant `androidpublisher` role
     - Download JSON key file
     - Link service account in Play Console → API access

### 32. Backend Environment Variables
- **Status:** IAP validation service expects these env vars
- **How:** Add to Railway backend service variables:
  ```
  APPLE_IAP_KEY_ID=<from step 30.8>
  APPLE_IAP_ISSUER_ID=<from step 30.8>
  APPLE_IAP_PRIVATE_KEY=<contents of .p8 file>
  APPLE_BUNDLE_ID=com.stepovr.app
  GOOGLE_SERVICE_ACCOUNT_KEY=<contents of service account JSON>
  ```
- **Security:** Never commit these to git. Use Railway's secret variable feature.

### 33. Sandbox/Test Track Testing
- **Status:** Must verify full purchase flow before App Store submission
- **How:**
  1. **Apple Sandbox:**
     - Create sandbox tester accounts in App Store Connect → Users and Access → Sandbox
     - Build app with Xcode, run on physical device signed into sandbox account
     - Test: monthly subscription purchase, lifetime purchase, restore purchases
     - Sandbox subscriptions auto-renew every 5 minutes (accelerated)
  2. **Google Test Track:**
     - Add tester emails in Play Console → Testing → Internal testing
     - Upload signed AAB to internal test track
     - Test: both product purchases, restore, refund flow
  3. **Verify backend receipt validation works end-to-end:**
     - Purchase triggers → receipt sent to backend → `is_pro` set to `true`
     - Check Supabase profiles table for correct `purchase_type`, `pro_lifetime_owned` values

### 34. Run Supabase Migration
- **Status:** Migration file `20260415000000_iap_hybrid.sql` created but not yet applied
- **How:** `supabase db push` or apply via Supabase Dashboard → SQL Editor
- **Verify:** Check that `profiles` table has new columns: `purchase_type`, `pro_lifetime_owned`, `subscription_expires_at`, `iap_platform`, `iap_transaction_id`, `daily_duels_played`, `daily_duels_reset_at`

### 35. Remove Stripe Feature Flag (after App Store approval)
- **Status:** Stripe endpoints are commented out but code remains in the codebase
- **When:** Only after BOTH Apple App Store and Google Play approve the app with IAP
- **How:**
  1. Delete `backend/src/subscription/stripe.service.ts`
  2. Remove commented Stripe endpoints from `subscription.controller.ts`
  3. Remove `stripe` from `package.json` dependencies
  4. Create migration to drop `stripe_customer_id` and `stripe_subscription_id` columns
  5. Remove `STRIPE_*` environment variables from Railway

---

## Push Notifications (blocks queue widget UX in production)

### 36. Switch `aps-environment` entitlement to production
- **Why:** iOS uses different APNs servers for sandbox (debug builds, TestFlight) vs production (App Store). Current setting is `development` which routes to sandbox APNs. App Store **rejects** apps with the `development` value.
- **How:** Edit `frontend/ios/App/App/App.entitlements`:
  ```xml
  <key>aps-environment</key>
  <string>production</string>
  ```
- **Then:** `cd frontend && npm run cap:sync` to push the change to the iOS project.
- **Pre-requisite:** APNs Auth Key in Firebase Cloud Messaging (`gen-lang-client-0272230126` project) must be configured WITHOUT the Sandbox-only restriction. The original key (`8JG6L89P2Q`) is sandbox-only — if you're still using that, push will silently fail in production. Use a key created without the Sandbox checkbox in Apple Developer.
- **Verify after deploy:**
  1. TestFlight build → push works (TestFlight uses production APNs)
  2. Real device → trigger a duel match-found event → background the app → expect push within ~1s
  3. Check Railway logs for `[PushService] sendPush failed` — sender ID mismatch or invalid token errors mean the chain isn't fully wired

### 37. Verify FIREBASE_SERVICE_ACCOUNT_JSON env var matches the right project
- **Why:** Backend Firebase Admin SDK initializes from this env. If the JSON's `project_id` field doesn't match the project where iOS/Android apps are registered (`gen-lang-client-0272230126`), every push send returns `messaging/sender-id-mismatch` and zero pushes deliver.
- **How:** Railway Dashboard → Backend service → Variables → open `FIREBASE_SERVICE_ACCOUNT_JSON` → confirm `"project_id": "gen-lang-client-0272230126"` is in the JSON.
- **If wrong:** Firebase Console → switch to `gen-lang-client-0272230126` → ⚙️ Project Settings → Service accounts → Generate new private key → paste full JSON contents into Railway env var.

### 38. Confirm Firebase Cloud Messaging API (V1) is enabled
- **Why:** Some older Firebase projects have the legacy "Cloud Messaging API" instead of V1. Firebase Admin SDK in `firebase-admin` v13+ uses V1.
- **How:** Firebase Console → `gen-lang-client-0272230126` → ⚙️ Project Settings → **Cloud Messaging** tab → confirm "Firebase Cloud Messaging API (V1)" status is **Enabled**.
- **If disabled:** click the 3-dot menu → "Manage API in Google Cloud Console" → Enable.
