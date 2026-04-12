# App Store Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship StepOvr to iOS App Store and Google Play Store simultaneously with push notifications, crash reporting, offline handling, and full compliance.

**Architecture:** Capacitor 7 wraps the Angular 20 frontend into native iOS/Android apps. Firebase provides FCM (push) and Crashlytics. AdMob replaces AdSense on native. Backend gains a NotificationModule and account deletion endpoint. Deep linking via Universal Links (iOS) and App Links (Android).

**Tech Stack:** Angular 20, Capacitor 7, NestJS, Supabase, Firebase (FCM + Crashlytics), AdMob, cordova-plugin-purchase

**Spec:** `docs/superpowers/specs/2026-04-05-app-store-launch-design.md`

---

## File Structure

### New files (frontend)

| File | Responsibility |
|------|---------------|
| `frontend/src/app/core/push-notification.service.ts` | FCM token registration, permission request, notification routing |
| `frontend/src/app/core/crashlytics.service.ts` | Firebase Crashlytics init, error logging, user attribution |
| `frontend/src/app/core/admob.service.ts` | AdMob banner/interstitial on native, delegates to AdSense on web |
| `frontend/src/app/core/network.service.ts` | Offline detection via @capacitor/network, exposes `isOnline` signal |
| `frontend/src/app/shared/offline-banner/offline-banner.ts` | Non-dismissible "No internet" banner component |
| `frontend/public/.well-known/apple-app-site-association` | iOS Universal Links config |
| `frontend/public/.well-known/assetlinks.json` | Android App Links config |

### New files (backend)

| File | Responsibility |
|------|---------------|
| `backend/src/notification/notification.module.ts` | NestJS module for push notifications |
| `backend/src/notification/notification.service.ts` | Firebase Admin SDK wrapper, send push to device/topic |
| `backend/src/notification/notification.controller.ts` | Register/unregister tokens, admin broadcast endpoint |
| `backend/src/notification/dto/register-token.dto.ts` | Validation DTO for token registration |
| `supabase/migrations/YYYYMMDD_device_tokens.sql` | device_tokens table |

### Modified files (frontend)

| File | Change |
|------|--------|
| `frontend/capacitor.config.ts` | Add splash screen, status bar, push notification plugin config |
| `frontend/src/environments/environment.prod.ts` | Set appVersion to 1.0.0, add admobAppId fields |
| `frontend/src/environments/environment.ts` | Add admobAppId fields (empty for dev) |
| `frontend/src/app/app.ts` | Init Crashlytics, push notifications, network service; replace manual splash |
| `frontend/src/app/app.config.ts` | Register new services in providers |
| `frontend/src/app/app.html` | Add offline-banner component |
| `frontend/src/app/core/auth.service.ts` | Add deleteAccount method, register/unregister push token on login/logout |
| `frontend/src/app/core/google-ads.service.ts` | Add platform check — skip on native (AdMob handles it) |
| `frontend/public/manifest.webmanifest` | Update name to "StepOvr", update icon references |
| `frontend/src/app/features/profile/profile.ts` | Add "Delete Account" button |

### Modified files (backend)

| File | Change |
|------|--------|
| `backend/src/app.module.ts` | Import NotificationModule |
| `backend/src/auth/auth.controller.ts` | Add DELETE /api/auth/delete-account endpoint |
| `backend/src/auth/auth.service.ts` | Add deleteAccount method |
| `backend/package.json` | Add firebase-admin dependency |

---

## Phase 1: Foundation

### Task 1: Generate Capacitor Native Projects

> **MANUAL TASK — requires Xcode + Android Studio installed**

**Files:**
- Modify: `frontend/` (generates `ios/` and `android/` directories)

- [ ] **Step 1: Build the Angular frontend for production**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build
```

Expected: Build completes, output in `dist/football-quizball-frontend/browser/`

- [ ] **Step 2: Add iOS platform**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx cap add ios
```

Expected: `ios/` directory created with Xcode project

- [ ] **Step 3: Add Android platform**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx cap add android
```

Expected: `android/` directory created with Android Studio project

- [ ] **Step 4: Sync web assets to native projects**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx cap sync
```

Expected: Web assets copied, native dependencies installed (CocoaPods for iOS, Gradle for Android)

- [ ] **Step 5: Verify iOS project opens**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx cap open ios
```

Expected: Xcode opens without errors. Build target shows `App`.

- [ ] **Step 6: Verify Android project opens**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx cap open android
```

Expected: Android Studio opens, Gradle sync completes without errors.

- [ ] **Step 7: Add ios/ and android/ to .gitignore**

Add to `frontend/.gitignore`:

```
ios/
android/
```

Native projects should not be committed — they're generated artifacts. Capacitor config and web code are the source of truth.

- [ ] **Step 8: Commit**

```bash
git add frontend/.gitignore
git commit -m "chore: add ios/ and android/ to gitignore after cap init"
```

---

### Task 2: Deep Linking — .well-known Files

**Files:**
- Create: `frontend/public/.well-known/apple-app-site-association`
- Create: `frontend/public/.well-known/assetlinks.json`

- [ ] **Step 1: Create Apple App Site Association file**

Create `frontend/public/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.stepovr.app",
        "paths": ["/join/*", "/battle-royale/*", "/duel/*", "/profile/*"]
      }
    ]
  }
}
```

> **MANUAL:** Replace `TEAMID` with your Apple Developer Team ID (found in Apple Developer Portal → Membership).

- [ ] **Step 2: Create Android Asset Links file**

Create `frontend/public/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.stepovr.app",
      "sha256_cert_fingerprints": ["SHA256_FINGERPRINT"]
    }
  }
]
```

> **MANUAL:** Replace `SHA256_FINGERPRINT` with the SHA-256 from your Play App Signing key (Play Console → Release → Setup → App signing).

- [ ] **Step 3: Verify Vercel serves .well-known files**

Vercel serves files from `public/` at the root. After deploy, verify:
- `https://football-quizball.vercel.app/.well-known/apple-app-site-association` returns JSON
- `https://football-quizball.vercel.app/.well-known/assetlinks.json` returns JSON

Note: `apple-app-site-association` must be served with `Content-Type: application/json`. Vercel does this automatically for files without extensions if a `vercel.json` header rule is added.

- [ ] **Step 4: Add Vercel header rule for apple-app-site-association**

Create or update `frontend/vercel.json`:

```json
{
  "headers": [
    {
      "source": "/.well-known/apple-app-site-association",
      "headers": [
        { "key": "Content-Type", "value": "application/json" }
      ]
    }
  ]
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/public/.well-known/ frontend/vercel.json
git commit -m "feat: add deep linking config for iOS Universal Links and Android App Links"
```

---

### Task 3: Deep Linking — Capacitor Config for URL Scheme

**Files:**
- Modify: `frontend/capacitor.config.ts`

- [ ] **Step 1: Update capacitor.config.ts with deep link and plugin config**

Replace the full contents of `frontend/capacitor.config.ts`:

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stepovr.app',
  appName: 'StepOvr',
  webDir: 'dist/football-quizball-frontend/browser',
  server: {
    allowNavigation: [
      'npwneqworgyclzaofuln.supabase.co',
      'football-quizball-production.up.railway.app',
    ],
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '', // Set after Google Cloud Console setup
      forceCodeForRefreshToken: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#000000',
      showSpinner: false,
      launchFadeOutDuration: 600,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/capacitor.config.ts
git commit -m "feat: add splash screen and push notification config to capacitor"
```

---

### Task 4: Update App Name and Version for Store Launch

**Files:**
- Modify: `frontend/public/manifest.webmanifest`
- Modify: `frontend/src/environments/environment.prod.ts`
- Modify: `frontend/src/environments/environment.ts`

- [ ] **Step 1: Update manifest.webmanifest**

Replace the full contents of `frontend/public/manifest.webmanifest`:

```json
{
  "name": "StepOvr",
  "short_name": "StepOvr",
  "description": "Football trivia quiz — duels, battle royale, logo quiz, and ELO ranking!",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#000000",
  "theme_color": "#000000",
  "scope": "./",
  "start_url": "./",
  "categories": ["games", "sports", "entertainment"],
  "icons": [
    {
      "src": "icons/stepovr-logo.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "icons/stepovr-logo.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "icons/stepovr-logo.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Step 2: Update environment.prod.ts — version and AdMob fields**

In `frontend/src/environments/environment.prod.ts`, change:

```typescript
appVersion: '1.0.0',
```

And add after `adSenseSlotId`:

```typescript
admobAppIdIos: '',     // Set after AdMob setup
admobAppIdAndroid: '', // Set after AdMob setup
admobBannerIdIos: '',
admobBannerIdAndroid: '',
```

- [ ] **Step 3: Update environment.ts — add matching AdMob fields**

In `frontend/src/environments/environment.ts`, change:

```typescript
appVersion: '1.0.0-dev',
```

And add after `adSenseSlotId`:

```typescript
admobAppIdIos: '',
admobAppIdAndroid: '',
admobBannerIdIos: '',
admobBannerIdAndroid: '',
```

- [ ] **Step 4: Commit**

```bash
git add frontend/public/manifest.webmanifest frontend/src/environments/
git commit -m "feat: update app name to StepOvr, set version 1.0.0, add AdMob env fields"
```

---

### Task 5: Backend CORS — Add Capacitor Origins

> **MANUAL TASK — set environment variable on Railway**

The backend CORS config already reads from `CORS_ORIGIN` env var. No code change needed.

- [ ] **Step 1: Set CORS_ORIGIN on Railway**

Railway Dashboard → Backend service → Variables:

```
CORS_ORIGIN=https://football-quizball.vercel.app,capacitor://localhost,http://localhost
```

- [ ] **Step 2: Set remaining production env vars on Railway**

```
FRONTEND_URL=https://football-quizball.vercel.app
NODE_ENV=production
MAX_WORKERS=4
```

Verify `ADMIN_API_KEY` is set to a strong random value (not the dev default `Manos1995`).

- [ ] **Step 3: Verify after deploy**

```bash
curl -I https://football-quizball-production.up.railway.app/api/health
```

Expected: 200 OK, `Access-Control-Allow-Origin` includes the configured origins.

---

### Task 6: Infrastructure Upgrades

> **MANUAL TASK — dashboard actions only**

- [ ] **Step 1: Upgrade Supabase to Pro**

Supabase Dashboard → Project `npwneqworgyclzaofuln` → Settings → Billing → Upgrade to Pro ($25/mo)

- [ ] **Step 2: Upgrade Upstash Redis to pay-as-you-go**

Upstash Console → Database → Upgrade plan to pay-as-you-go (~$0.20 per 100K commands)

- [ ] **Step 3: Configure Supabase Auth URLs**

Supabase Dashboard → Authentication → URL Configuration:
- Site URL: `https://football-quizball.vercel.app`
- Add Redirect URLs:
  - `https://football-quizball.vercel.app/`
  - `com.stepovr.app://`
  - `http://localhost:4200/`

---

## Phase 2: Store Infrastructure & Auth

### Task 7: Firebase Project Setup

> **MANUAL TASK — Firebase Console**

- [ ] **Step 1: Create Firebase project**

Go to Firebase Console → Create project "StepOvr" → Disable Google Analytics (we use PostHog)

- [ ] **Step 2: Add iOS app**

Firebase Console → Project settings → Add app → iOS:
- Bundle ID: `com.stepovr.app`
- Download `GoogleService-Info.plist`
- Place in `frontend/ios/App/App/GoogleService-Info.plist`

- [ ] **Step 3: Add Android app**

Firebase Console → Add app → Android:
- Package name: `com.stepovr.app`
- Add SHA-1 fingerprint from your upload keystore:
  ```bash
  keytool -list -v -keystore stepovr-upload.jks -alias key0
  ```
- Download `google-services.json`
- Place in `frontend/android/app/google-services.json`

- [ ] **Step 4: Enable Cloud Messaging**

Firebase Console → Build → Cloud Messaging → Enable

- [ ] **Step 5: Enable Crashlytics**

Firebase Console → Build → Crashlytics → Enable → Select iOS and Android apps

- [ ] **Step 6: Upload APNs key for iOS push**

Firebase Console → Project settings → Cloud Messaging → iOS app → Upload APNs Authentication Key (.p8):
- Get this from Apple Developer Portal → Keys → Create Key → Apple Push Notifications service (APNs)

---

### Task 8: Google OAuth Credentials

> **MANUAL TASK — Google Cloud Console + Supabase Dashboard**

- [ ] **Step 1: Create Web OAuth Client ID**

Google Cloud Console → APIs & Services → Credentials → Create OAuth Client ID:
- Type: Web application
- Name: "StepOvr Web"
- Authorized redirect URI: `https://npwneqworgyclzaofuln.supabase.co/auth/v1/callback`
- Save the Client ID and Client Secret

- [ ] **Step 2: Create iOS OAuth Client ID**

Create OAuth Client ID:
- Type: iOS
- Bundle ID: `com.stepovr.app`

- [ ] **Step 3: Create Android OAuth Client ID**

Create OAuth Client ID:
- Type: Android
- Package name: `com.stepovr.app`
- SHA-1 certificate fingerprint: from your upload keystore

- [ ] **Step 4: Enable Google provider in Supabase**

Supabase Dashboard → Authentication → Providers → Google:
- Client ID: paste Web Client ID from Step 1
- Client Secret: paste Client Secret from Step 1
- Enable

- [ ] **Step 5: Set Web Client ID in code**

Update `frontend/capacitor.config.ts`:
```typescript
serverClientId: 'YOUR_WEB_CLIENT_ID',
```

Update `frontend/src/environments/environment.prod.ts`:
```typescript
googleWebClientId: 'YOUR_WEB_CLIENT_ID',
```

- [ ] **Step 6: Commit**

```bash
git add frontend/capacitor.config.ts frontend/src/environments/environment.prod.ts
git commit -m "feat: add Google OAuth Web Client ID"
```

---

### Task 9: Apple Sign-In Credentials

> **MANUAL TASK — Apple Developer Portal + Supabase Dashboard**

- [ ] **Step 1: Register App ID with Sign In with Apple**

Apple Developer Portal → Certificates, Identifiers & Profiles → Identifiers → App IDs:
- Select `com.stepovr.app` (or register it)
- Enable "Sign In with Apple" capability

- [ ] **Step 2: Register Services ID**

Identifiers → Services IDs → Register:
- Identifier: `com.stepovr.app.web`
- Enable "Sign In with Apple"
- Configure domains: `npwneqworgyclzaofuln.supabase.co`
- Return URL: `https://npwneqworgyclzaofuln.supabase.co/auth/v1/callback`

- [ ] **Step 3: Create Sign In with Apple Key**

Keys → Create Key:
- Name: "StepOvr Sign In with Apple"
- Enable "Sign In with Apple"
- Download the .p8 key file
- Note the Key ID

- [ ] **Step 4: Enable Apple provider in Supabase**

Supabase Dashboard → Authentication → Providers → Apple:
- Services ID: `com.stepovr.app.web`
- Team ID: your Apple Team ID
- Key ID: from Step 3
- Private Key: contents of .p8 file
- Enable

- [ ] **Step 5: Add Sign In with Apple entitlement (after native project exists)**

In Xcode → App target → Signing & Capabilities → Add "Sign In with Apple"

This automatically creates/updates `App.entitlements`.

---

### Task 10: IAP Store Products

> **MANUAL TASK — App Store Connect + Play Console**

- [ ] **Step 1: Create app in App Store Connect**

App Store Connect → My Apps → New App:
- Platform: iOS
- Name: StepOvr
- Bundle ID: `com.stepovr.app`
- SKU: `stepovr`
- Primary language: English

- [ ] **Step 2: Create IAP products in App Store Connect**

Subscriptions → Create Subscription Group: "StepOvr Pro"
- Add `stepovr_pro_monthly` (Auto-Renewable Subscription) — set pricing when ready
- Add display name, description, review screenshot

In-App Purchases → Create:
- `stepovr_pro_lifetime` (Non-Consumable) — set pricing when ready

- [ ] **Step 3: Enable App Store Server Notifications v2**

App Store Connect → App → General → App Information → App Store Server Notifications:
- Production URL: `https://football-quizball-production.up.railway.app/api/subscription/apple-notification`
- Sandbox URL: same endpoint

- [ ] **Step 4: Generate App Store Connect API key**

App Store Connect → Users and Access → Keys → In-App Purchase → Generate:
- Save Key ID, Issuer ID, and .p8 file

- [ ] **Step 5: Create app in Google Play Console**

Play Console → Create app:
- App name: StepOvr
- Default language: English
- App type: Game
- Free or paid: Free (with IAP)

- [ ] **Step 6: Create IAP products in Play Console**

Monetize → Products → Subscriptions → Create:
- `stepovr_pro_monthly` — set pricing when ready

Monetize → Products → In-app products → Create:
- `stepovr_pro_lifetime` — set pricing when ready

Activate both products.

- [ ] **Step 7: Set up Google RTDN**

Google Cloud Console → Pub/Sub → Create topic: `stepovr-iap-notifications`
- Create push subscription → endpoint: `https://football-quizball-production.up.railway.app/api/subscription/google-notification`

Play Console → Monetization setup → Link Pub/Sub topic

- [ ] **Step 8: Create Google Cloud Service Account**

Google Cloud Console → IAM → Service Accounts → Create:
- Name: "stepovr-play-billing"
- Grant role: owner (or specifically `androidpublisher`)
- Create JSON key, download

Play Console → API access → Link service account

- [ ] **Step 9: Set backend env vars on Railway**

```
APPLE_IAP_KEY_ID=<key id from step 4>
APPLE_IAP_ISSUER_ID=<issuer id from step 4>
APPLE_IAP_PRIVATE_KEY=<.p8 file contents>
APPLE_BUNDLE_ID=com.stepovr.app
GOOGLE_SERVICE_ACCOUNT_KEY=<JSON key contents>
```

- [ ] **Step 10: Run IAP database migration**

Supabase Dashboard → SQL Editor → paste contents of `supabase/migrations/20260415000000_iap_hybrid.sql` → Run

Or: `cd /Users/instashop/Projects/football-quizball && npx supabase db push`

---

## Phase 3: Features & Polish

### Task 11: Install Capacitor Plugins

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install all required Capacitor plugins**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm install @capacitor/push-notifications @capacitor/splash-screen @capacitor/status-bar @capacitor/network @capacitor-community/admob @capacitor-community/firebase-crashlytics
```

- [ ] **Step 2: Install firebase-admin on backend**

```bash
cd /Users/instashop/Projects/football-quizball/backend && npm install firebase-admin
```

- [ ] **Step 3: Sync Capacitor**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx cap sync
```

- [ ] **Step 4: Commit**

```bash
cd /Users/instashop/Projects/football-quizball && git add frontend/package.json frontend/package-lock.json backend/package.json backend/package-lock.json
git commit -m "feat: install capacitor plugins (push, splash, statusbar, network, admob, crashlytics) and firebase-admin"
```

---

### Task 12: Network/Offline Service

**Files:**
- Create: `frontend/src/app/core/network.service.ts`
- Create: `frontend/src/app/shared/offline-banner/offline-banner.ts`
- Modify: `frontend/src/app/app.ts`
- Modify: `frontend/src/app/app.html`

- [ ] **Step 1: Create NetworkService**

Create `frontend/src/app/core/network.service.ts`:

```typescript
import { Injectable, signal, OnDestroy } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Network, ConnectionStatus } from '@capacitor/network';

@Injectable({ providedIn: 'root' })
export class NetworkService implements OnDestroy {
  readonly isOnline = signal(true);
  private listenerHandle?: Awaited<ReturnType<typeof Network.addListener>>;

  constructor() {
    if (Capacitor.isNativePlatform()) {
      this.initNativeListener();
    }
  }

  private async initNativeListener(): Promise<void> {
    const status = await Network.getStatus();
    this.isOnline.set(status.connected);

    this.listenerHandle = await Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
      this.isOnline.set(status.connected);
    });
  }

  ngOnDestroy(): void {
    this.listenerHandle?.remove();
  }
}
```

- [ ] **Step 2: Create OfflineBannerComponent**

Create `frontend/src/app/shared/offline-banner/offline-banner.ts`:

```typescript
import { Component, inject } from '@angular/core';
import { NetworkService } from '../../core/network.service';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  template: `
    @if (!network.isOnline()) {
      <div class="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white text-center py-2 text-sm font-medium">
        No internet connection
      </div>
    }
  `,
})
export class OfflineBannerComponent {
  readonly network = inject(NetworkService);
}
```

- [ ] **Step 3: Add OfflineBannerComponent to app.html**

In `frontend/src/app/app.html`, add at the very top (before any other content):

```html
<app-offline-banner />
```

And add `OfflineBannerComponent` to the imports array in `app.ts`.

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=development 2>&1 | head -20
```

Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/network.service.ts frontend/src/app/shared/offline-banner/ frontend/src/app/app.ts frontend/src/app/app.html
git commit -m "feat: add offline detection with network service and banner"
```

---

### Task 13: Crashlytics Service

**Files:**
- Create: `frontend/src/app/core/crashlytics.service.ts`
- Modify: `frontend/src/app/app.ts`

- [ ] **Step 1: Create CrashlyticsService**

Create `frontend/src/app/core/crashlytics.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseCrashlytics } from '@capacitor-community/firebase-crashlytics';

@Injectable({ providedIn: 'root' })
export class CrashlyticsService {
  private readonly isNative = Capacitor.isNativePlatform();

  async initialize(): Promise<void> {
    if (!this.isNative) return;
    await FirebaseCrashlytics.setEnabled({ enabled: true });
  }

  async setUserId(userId: string): Promise<void> {
    if (!this.isNative) return;
    await FirebaseCrashlytics.setUserId({ userId });
  }

  async logError(message: string, error?: unknown): Promise<void> {
    if (!this.isNative) return;
    await FirebaseCrashlytics.addLogMessage({ message });
    if (error instanceof Error) {
      await FirebaseCrashlytics.recordException({
        message: error.message,
        stacktrace: error.stack,
      });
    }
  }

  async setCustomKey(key: string, value: string): Promise<void> {
    if (!this.isNative) return;
    await FirebaseCrashlytics.setCustomKey({ key, value, type: 'string' });
  }
}
```

- [ ] **Step 2: Initialize Crashlytics in app.ts**

In `frontend/src/app/app.ts`, add to the class:

```typescript
private crashlytics = inject(CrashlyticsService);
```

In `ngOnInit()`, add after the existing initialization:

```typescript
this.crashlytics.initialize();
```

In the existing `effect()` that watches `this.auth.user()`, add after `checkUsernameSetup`:

```typescript
if (user) {
  this.crashlytics.setUserId(user.id);
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=development 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/core/crashlytics.service.ts frontend/src/app/app.ts
git commit -m "feat: add Firebase Crashlytics service with user attribution"
```

---

### Task 14: AdMob Service (Platform-Conditional Ads)

**Files:**
- Create: `frontend/src/app/core/admob.service.ts`
- Modify: `frontend/src/app/core/google-ads.service.ts`

- [ ] **Step 1: Create AdMobService**

Create `frontend/src/app/core/admob.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdOptions, BannerAdSize, BannerAdPosition, AdMobBannerSize } from '@capacitor-community/admob';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdmobService {
  private readonly isNative = Capacitor.isNativePlatform();
  private initialized = false;

  async initialize(): Promise<void> {
    if (!this.isNative) return;
    if (this.initialized) return;

    await AdMob.initialize({
      requestTrackingAuthorization: true,
      initializeForTesting: !environment.production,
    });
    this.initialized = true;
  }

  async showBanner(): Promise<void> {
    if (!this.isNative || !this.initialized) return;

    const adId = Capacitor.getPlatform() === 'ios'
      ? environment.admobBannerIdIos
      : environment.admobBannerIdAndroid;

    if (!adId) return;

    const options: BannerAdOptions = {
      adId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      isTesting: !environment.production,
    };

    await AdMob.showBanner(options);
  }

  async hideBanner(): Promise<void> {
    if (!this.isNative) return;
    await AdMob.hideBanner();
  }
}
```

- [ ] **Step 2: Skip GoogleAdsService on native**

In `frontend/src/app/core/google-ads.service.ts`, update the `isEnabled` property:

```typescript
import { Capacitor } from '@capacitor/core';

// Change this line:
private readonly isEnabled =
  environment.production && !!environment.googleAdsId && !Capacitor.isNativePlatform();
```

This ensures AdSense only loads on web, while AdMob handles native.

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=development 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/core/admob.service.ts frontend/src/app/core/google-ads.service.ts
git commit -m "feat: add AdMob service for native ads, skip AdSense on native platform"
```

---

### Task 15: Push Notification Service (Frontend)

**Files:**
- Create: `frontend/src/app/core/push-notification.service.ts`
- Modify: `frontend/src/app/app.ts`

- [ ] **Step 1: Create PushNotificationService**

Create `frontend/src/app/core/push-notification.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly isNative = Capacitor.isNativePlatform();
  private registered = false;

  async requestPermissionAndRegister(): Promise<void> {
    if (!this.isNative || this.registered) return;

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token: Token) => {
      await this.sendTokenToBackend(token.value);
      this.registered = true;
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration failed:', error);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
      const data = notification.notification.data;
      if (data?.route) {
        this.router.navigateByUrl(data.route);
      }
    });
  }

  async unregister(): Promise<void> {
    if (!this.isNative || !this.registered) return;
    try {
      await firstValueFrom(
        this.http.delete(`${environment.apiUrl}/api/notifications/unregister`, {
          headers: { Authorization: `Bearer ${this.auth.accessToken()}` },
        })
      );
    } catch {
      // Best effort — token will expire on its own
    }
    this.registered = false;
  }

  private async sendTokenToBackend(token: string): Promise<void> {
    const accessToken = this.auth.accessToken();
    if (!accessToken) return;

    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/api/notifications/register`, {
        token,
        platform: Capacitor.getPlatform(),
      }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );
  }
}
```

- [ ] **Step 2: Initialize push notifications in app.ts**

In `frontend/src/app/app.ts`, add to the class:

```typescript
private pushService = inject(PushNotificationService);
```

In the existing `effect()` watching `this.auth.user()`, add push registration after the user logs in:

```typescript
if (user) {
  this.crashlytics.setUserId(user.id);
  this.checkUsernameSetup(user.id);
  this.pushService.requestPermissionAndRegister();
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=development 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/core/push-notification.service.ts frontend/src/app/app.ts
git commit -m "feat: add push notification service with FCM token registration"
```

---

### Task 16: Push Notification Backend — Database Migration

**Files:**
- Create: `supabase/migrations/20260405000000_device_tokens.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20260405000000_device_tokens.sql`:

```sql
-- Device tokens for FCM push notifications
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, token)
);

-- Index for looking up tokens by user
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON public.device_tokens(user_id);

-- RLS: users can only manage their own tokens, service role can read all
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tokens"
  ON public.device_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260405000000_device_tokens.sql
git commit -m "feat: add device_tokens table for FCM push notifications"
```

> **MANUAL:** Run this migration via Supabase Dashboard → SQL Editor or `npx supabase db push`

---

### Task 17: Push Notification Backend — NotificationModule

**Files:**
- Create: `backend/src/notification/notification.module.ts`
- Create: `backend/src/notification/notification.service.ts`
- Create: `backend/src/notification/notification.controller.ts`
- Create: `backend/src/notification/dto/register-token.dto.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create register-token DTO**

Create `backend/src/notification/dto/register-token.dto.ts`:

```typescript
import { IsString, IsIn } from 'class-validator';

export class RegisterTokenDto {
  @IsString()
  token: string;

  @IsString()
  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';
}
```

- [ ] **Step 2: Create NotificationService**

Create `backend/src/notification/notification.service.ts`:

```typescript
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  onModuleInit(): void {
    const serviceAccountJson = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_KEY');
    if (!serviceAccountJson) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_KEY not set — push notifications disabled');
      return;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
      });
    }
  }

  async registerToken(userId: string, token: string, platform: 'ios' | 'android'): Promise<void> {
    const client = this.supabase.getAdminClient();
    const { error } = await client
      .from('device_tokens')
      .upsert({ user_id: userId, token, platform }, { onConflict: 'user_id,token' });

    if (error) {
      this.logger.error(`Failed to register token for ${userId}: ${error.message}`);
      throw error;
    }
  }

  async unregisterTokens(userId: string): Promise<void> {
    const client = this.supabase.getAdminClient();
    await client.from('device_tokens').delete().eq('user_id', userId);
  }

  async sendToUser(userId: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
    if (!admin.apps.length) return;

    const client = this.supabase.getAdminClient();
    const { data: tokens } = await client
      .from('device_tokens')
      .select('token')
      .eq('user_id', userId);

    if (!tokens?.length) return;

    const message: admin.messaging.MulticastMessage = {
      tokens: tokens.map((t) => t.token),
      notification: { title, body },
      data: data ?? {},
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Clean up invalid tokens
    const invalidTokens = response.responses
      .map((r, i) => (!r.success ? tokens[i].token : null))
      .filter(Boolean) as string[];

    if (invalidTokens.length > 0) {
      await client.from('device_tokens').delete().in('token', invalidTokens);
    }
  }

  async sendToAll(title: string, body: string, data?: Record<string, string>): Promise<number> {
    if (!admin.apps.length) return 0;

    const client = this.supabase.getAdminClient();
    const { data: tokens } = await client.from('device_tokens').select('token');

    if (!tokens?.length) return 0;

    const batchSize = 500;
    let sent = 0;

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const message: admin.messaging.MulticastMessage = {
        tokens: batch.map((t) => t.token),
        notification: { title, body },
        data: data ?? {},
      };
      const response = await admin.messaging().sendEachForMulticast(message);
      sent += response.successCount;
    }

    return sent;
  }
}
```

- [ ] **Step 3: Create NotificationController**

Create `backend/src/notification/notification.controller.ts`:

```typescript
import { Controller, Post, Delete, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { NotificationService } from './notification.service';
import { RegisterTokenDto } from './dto/register-token.dto';

@Controller('api/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('register')
  @UseGuards(AuthGuard)
  async registerToken(@Req() req: any, @Body() dto: RegisterTokenDto): Promise<{ ok: true }> {
    await this.notificationService.registerToken(req.user.id, dto.token, dto.platform);
    return { ok: true };
  }

  @Delete('unregister')
  @UseGuards(AuthGuard)
  async unregisterTokens(@Req() req: any): Promise<{ ok: true }> {
    await this.notificationService.unregisterTokens(req.user.id);
    return { ok: true };
  }
}
```

- [ ] **Step 4: Create NotificationModule**

Create `backend/src/notification/notification.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
```

- [ ] **Step 5: Import NotificationModule in AppModule**

In `backend/src/app.module.ts`, add:

```typescript
import { NotificationModule } from './notification/notification.module';
```

And add `NotificationModule` to the `imports` array.

- [ ] **Step 6: Verify backend compiles**

```bash
cd /Users/instashop/Projects/football-quizball/backend && npm run build 2>&1 | tail -5
```

Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add backend/src/notification/ backend/src/app.module.ts
git commit -m "feat: add NotificationModule with FCM push via firebase-admin"
```

---

### Task 18: Account Deletion Endpoint

**Files:**
- Modify: `backend/src/auth/auth.service.ts`
- Modify: `backend/src/auth/auth.controller.ts`

- [ ] **Step 1: Read current auth.service.ts and auth.controller.ts**

Read the current files to understand the existing structure before modifying.

- [ ] **Step 2: Add deleteAccount to AuthService**

In `backend/src/auth/auth.service.ts`, add a new method:

```typescript
async deleteAccount(userId: string): Promise<void> {
  const client = this.supabase.getAdminClient();

  // Delete related data (cascade handles most via FK, but be explicit for safety)
  await client.from('device_tokens').delete().eq('user_id', userId);
  await client.from('elo_history').delete().eq('user_id', userId);
  await client.from('profiles').delete().eq('id', userId);

  // Delete the auth user last
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`Failed to delete auth user: ${error.message}`);
  }
}
```

- [ ] **Step 3: Add DELETE endpoint to AuthController**

In `backend/src/auth/auth.controller.ts`, add:

```typescript
@Delete('delete-account')
@UseGuards(AuthGuard)
async deleteAccount(@Req() req: any): Promise<{ ok: true }> {
  await this.authService.deleteAccount(req.user.id);
  return { ok: true };
}
```

Make sure `Delete` is imported from `@nestjs/common`.

- [ ] **Step 4: Verify backend compiles**

```bash
cd /Users/instashop/Projects/football-quizball/backend && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/auth.service.ts backend/src/auth/auth.controller.ts
git commit -m "feat: add account deletion endpoint (DELETE /api/auth/delete-account)"
```

---

### Task 19: Account Deletion — Frontend UI

**Files:**
- Modify: `frontend/src/app/features/profile/profile.ts`
- Modify: `frontend/src/app/core/auth.service.ts`

- [ ] **Step 1: Read current profile component**

Read `frontend/src/app/features/profile/profile.ts` and its template to understand the current layout.

- [ ] **Step 2: Add deleteAccount method to AuthService**

In `frontend/src/app/core/auth.service.ts`, add:

```typescript
async deleteAccount(): Promise<void> {
  const token = this.accessToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${environment.apiUrl}/api/auth/delete-account`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error('Account deletion failed');

  await this.signOut();
}
```

- [ ] **Step 3: Add "Delete Account" button to profile template**

In the profile component template, add a danger zone section at the bottom (inside the settings/profile area):

```html
<div class="mt-8 border-t border-red-500/20 pt-6">
  <h3 class="text-red-400 text-sm font-semibold mb-2">Danger Zone</h3>
  <button
    (click)="confirmDeleteAccount()"
    class="px-4 py-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg text-sm hover:bg-red-600/40 transition-colors">
    Delete Account
  </button>
</div>
```

- [ ] **Step 4: Add confirmDeleteAccount method to profile component**

```typescript
async confirmDeleteAccount(): Promise<void> {
  const confirmation = prompt('This will permanently delete your account and all data. Type DELETE to confirm:');
  if (confirmation !== 'DELETE') return;

  try {
    await this.auth.deleteAccount();
    this.router.navigate(['/']);
  } catch (error) {
    console.error('Account deletion failed:', error);
  }
}
```

- [ ] **Step 5: Verify it compiles**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=development 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/profile/ frontend/src/app/core/auth.service.ts
git commit -m "feat: add account deletion UI with confirmation prompt"
```

---

### Task 20: Splash Screen — Replace Manual Implementation

**Files:**
- Modify: `frontend/src/app/app.ts`

- [ ] **Step 1: Read current app.ts splash logic**

The current splash logic in `app.ts` uses `showSplash` and `splashFading` signals with `setTimeout`. On native, the Capacitor `@capacitor/splash-screen` plugin handles this natively.

- [ ] **Step 2: Update app.ts to use Capacitor SplashScreen on native**

In `frontend/src/app/app.ts`, add import:

```typescript
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
```

Update `ngOnInit()` — replace the splash setTimeout block:

```typescript
// Splash screen handling
if (Capacitor.isNativePlatform()) {
  // Native: Capacitor plugin handles splash, just configure status bar
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#000000' }).catch(() => {});
  this.showSplash.set(false);
  this.checkOnboarding();
} else if (this.router.url !== '/' && this.router.url !== '') {
  this.showSplash.set(false);
  this.checkOnboarding();
} else {
  setTimeout(() => {
    this.splashFading.set(true);
    setTimeout(() => {
      this.showSplash.set(false);
      this.checkOnboarding();
    }, 600);
  }, 2000);
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=development 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/app.ts
git commit -m "feat: use Capacitor splash screen and status bar on native, keep web splash"
```

---

### Task 21: Battle Royale Broadcast Migration

**Files:**
- Modify: Battle Royale backend service (answer handler)
- Modify: Battle Royale frontend component (realtime subscription)

- [ ] **Step 1: Read current Battle Royale backend and frontend realtime code**

Read the BR service to find where `postgres_changes` are triggered and where `refreshRoom()` is called. Identify:
- Backend: where answers are processed and scores updated
- Frontend: where realtime subscriptions are set up

- [ ] **Step 2: Add Broadcast publish to backend answer handler**

After the existing score update logic in the BR answer handler, add a Broadcast publish:

```typescript
// After updating the score in the database, broadcast the updated leaderboard
const channel = this.supabase.getAdminClient().channel(`br:${roomId}`);
await channel.send({
  type: 'broadcast',
  event: 'leaderboard_update',
  payload: { leaderboard: updatedLeaderboard },
});
```

The exact variable names depend on what the current code uses — read the file first.

- [ ] **Step 3: Update frontend to subscribe to Broadcast instead of postgres_changes**

Replace the `postgres_changes` subscription with:

```typescript
const channel = this.supabase.client.channel(`br:${this.roomId}`);
channel.on('broadcast', { event: 'leaderboard_update' }, (payload) => {
  this.leaderboard.set(payload.payload.leaderboard);
});
channel.subscribe();
```

Remove the `refreshRoom()` call and the 500ms debounce.

- [ ] **Step 4: Verify backend and frontend compile**

```bash
cd /Users/instashop/Projects/football-quizball/backend && npm run build 2>&1 | tail -5
cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=development 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/battle-royale/ frontend/src/app/features/battle-royale/
git commit -m "perf: switch Battle Royale from postgres_changes to Supabase Broadcast"
```

---

## Phase 4: Submission & Launch

### Task 22: Code Signing

> **MANUAL TASK — requires Xcode + Android Studio**

- [ ] **Step 1: iOS — Create Distribution Certificate**

Apple Developer Portal → Certificates → Create:
- Type: Apple Distribution
- Generate CSR from Keychain Access, upload
- Download and install certificate

- [ ] **Step 2: iOS — Create App Store Provisioning Profile**

Apple Developer Portal → Profiles → Create:
- Type: App Store
- App ID: `com.stepovr.app`
- Select the Distribution certificate
- Download and install

- [ ] **Step 3: iOS — Configure in Xcode**

Open `frontend/ios/App/App.xcworkspace`:
- Select App target → Signing & Capabilities
- Team: Your Apple Developer team
- Bundle Identifier: `com.stepovr.app`
- Signing: Automatically manage signing, or select the provisioning profile

- [ ] **Step 4: Android — Generate Upload Keystore**

```bash
keytool -genkey -v -keystore ~/stepovr-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Store this file securely. NEVER commit to git.

- [ ] **Step 5: Android — Configure signing in build.gradle**

Edit `frontend/android/app/build.gradle`, add signing config:

```groovy
android {
    signingConfigs {
        release {
            storeFile file(System.getenv("KEYSTORE_PATH") ?: "${System.getProperty('user.home')}/stepovr-upload.jks")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias 'upload'
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

- [ ] **Step 6: Android — Enroll in Play App Signing**

Play Console → App → Release → Setup → App signing → Enroll

---

### Task 23: App Icon Generation

> **MANUAL TASK — design work**

- [ ] **Step 1: Create 1024×1024 app icon**

From existing `frontend/public/icons/stepovr-logo.png`:
- Create a 1024×1024 PNG with NO transparency (solid background)
- NO rounded corners (Apple adds them automatically)
- Use the StepOvr logo centered on dark background (#000000)

- [ ] **Step 2: iOS — Add to asset catalog**

In Xcode, open `ios/App/App/Assets.xcassets/AppIcon.appiconset/`:
- Replace the placeholder with your 1024×1024 icon
- Xcode generates all required sizes automatically

- [ ] **Step 3: Android — Create adaptive icon**

Create foreground and background layers:
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png` (432×432)
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.png` (432×432, solid #000000)

Use Android Studio → Image Asset Studio for easy generation.

- [ ] **Step 4: Play Store — Upload 512×512 icon**

Play Console → Store listing → App icon: Upload 512×512 PNG

---

### Task 24: Store Listing Content

> **MANUAL TASK — store console setup**

- [ ] **Step 1: iOS App Store listing**

App Store Connect → App → App Information:
- Name: StepOvr
- Subtitle: Football Trivia & Quiz Game
- Category: Games > Trivia (primary), Sports (secondary)
- Content Rights: Does not contain third-party content
- Age Rating: Complete questionnaire (answer No to all — no violence, gambling, etc.) → should result in 4+

App Store Connect → App → Version:
- Description: (use the description from the spec, Section 4.1)
- Keywords: football,trivia,quiz,soccer,ELO,ranked,duel,logo,battle royale
- Support URL: `https://football-quizball.vercel.app/terms`
- Privacy Policy URL: `https://football-quizball.vercel.app/privacy`
- Review notes: "Demo account: test@stepovr.com / TestPass123!" (create this account first)

- [ ] **Step 2: Google Play Store listing**

Play Console → Store listing:
- App name: StepOvr
- Short description (80 chars): "Football trivia duels, logo quizzes & battle royale — climb the ELO ranks"
- Full description: (use the description from the spec, Section 4.1)
- App category: Game > Trivia
- Content rating: Complete IARC questionnaire
- Privacy policy: `https://football-quizball.vercel.app/privacy`

- [ ] **Step 3: Privacy Nutrition Labels (iOS)**

App Store Connect → App → App Privacy:
Complete the questionnaire declaring:
- Email address: collected, linked to identity
- User ID: collected, linked to identity
- Gameplay data: collected, linked to identity
- Analytics: collected, not linked to identity (PostHog)
- Advertising data: collected with ATT consent (AdMob)
- Purchases: collected, linked to identity

- [ ] **Step 4: Data Safety section (Android)**

Play Console → App content → Data safety:
- Data collected: email, user ID, gameplay activity, purchase history
- Data shared: analytics (PostHog), advertising (AdMob)
- Encryption: data encrypted in transit
- Deletion: users can request account deletion in-app

---

### Task 25: Screenshots

> **MANUAL TASK — capture on device or simulator**

- [ ] **Step 1: Prepare demo state**

Log into the app with a test account that has:
- Some ELO history (not default 1000)
- Games played
- A username and avatar set

- [ ] **Step 2: Capture iOS screenshots**

Using iPhone 15 Pro Max simulator (6.7") and iPhone 15 Pro simulator (6.1"):
1. Home screen (all game modes visible)
2. Duel gameplay (mid-question with timer, answer choices)
3. Logo Quiz (partially revealed badge)
4. Battle Royale leaderboard (mid-game with players)
5. Profile/ELO stats screen
6. Pro upgrade modal

- [ ] **Step 3: Capture Android screenshots**

Same 6 screens on a Pixel device or emulator at 1080×1920+.

- [ ] **Step 4: Create Play Store feature graphic**

1024×500 PNG: StepOvr logo + tagline + gameplay montage

- [ ] **Step 5: Upload to both stores**

App Store Connect → Screenshots section
Play Console → Store listing → Graphics

---

### Task 26: Beta Testing

> **MANUAL TASK — requires physical devices + testers**

- [ ] **Step 1: Build and upload iOS beta**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build && npx cap sync ios
```

In Xcode:
- Select "Any iOS Device (arm64)" as destination
- Product → Archive
- Distribute App → App Store Connect → Upload
- Wait for processing in App Store Connect

- [ ] **Step 2: Set up TestFlight**

App Store Connect → TestFlight:
- Add internal testers (up to 25 team members)
- Add external testers (up to 10,000)
- Submit for TestFlight review (usually < 24 hours)

- [ ] **Step 3: Build and upload Android beta**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build && npx cap sync android
```

In Android Studio:
- Build → Generate Signed Bundle/APK → Android App Bundle
- Use your upload keystore
- Upload AAB to Play Console → Testing → Internal testing

- [ ] **Step 4: Add testers to Play Console**

Play Console → Testing → Internal testing:
- Create email list of testers
- Share the opt-in link

- [ ] **Step 5: Test critical flows**

Both platforms — verify:
- [ ] Email sign-up and login
- [ ] Google Sign-In
- [ ] Apple Sign-In (iOS only)
- [ ] Solo game start to finish
- [ ] Duel matchmaking and gameplay
- [ ] Battle Royale join and play
- [ ] Logo Quiz gameplay
- [ ] IAP purchase (sandbox/test)
- [ ] IAP restore purchases
- [ ] Push notification received
- [ ] Deep link opens correct screen
- [ ] Offline banner appears when disconnecting
- [ ] Account deletion works
- [ ] App doesn't crash on launch

- [ ] **Step 6: Run beta for at least 1 week**

Collect feedback, fix any issues found.

---

### Task 27: Final Submission

> **MANUAL TASK — store submission**

- [ ] **Step 1: Pre-submission checklist**

- [ ] All beta test feedback addressed
- [ ] Privacy policy and terms accessible at public URLs
- [ ] Demo account created for Apple reviewers
- [ ] App version set to 1.0.0 in all locations
- [ ] No console.log or debug statements
- [ ] No Stripe references visible in native app UI
- [ ] AdMob app ID in AndroidManifest.xml
- [ ] ATT prompt configured for iOS

- [ ] **Step 2: Submit iOS for review**

App Store Connect → App → Submit for Review:
- Select the build from TestFlight
- Complete all metadata
- Add review notes with demo account credentials
- Submit

Expected review time: 1-3 days

- [ ] **Step 3: Submit Android for review**

Play Console → Production → Create new release:
- Upload the same signed AAB from beta
- Complete all store listing requirements
- Set rollout percentage: 10% (staged rollout)
- Submit for review

Expected review time: 1-7 days (first submission takes longer)

- [ ] **Step 4: Monitor and respond**

- Check App Store Connect and Play Console daily for status updates
- If rejected: read rejection reason carefully, fix, and resubmit
- Common iOS rejections: missing functionality, broken links, metadata issues
- Common Android rejections: policy violations, missing declarations

- [ ] **Step 5: Post-approval — release**

iOS: Click "Release This Version" in App Store Connect
Android: Increase rollout: 10% → 50% → 100% over 3 days

- [ ] **Step 6: Post-launch monitoring**

- Monitor Crashlytics for new crash patterns
- Monitor PostHog for user flow drop-offs
- Monitor IAP revenue in both consoles
- Watch app store reviews for feedback

---

## Summary — Code vs. Manual Tasks

### Tasks I can build (code changes):

| Task | Description |
|------|-------------|
| 2 | Deep linking .well-known files |
| 3 | Capacitor config updates |
| 4 | App name + version + env updates |
| 11 | Install Capacitor plugins |
| 12 | NetworkService + OfflineBanner |
| 13 | CrashlyticsService |
| 14 | AdMobService + AdSense platform check |
| 15 | PushNotificationService (frontend) |
| 16 | device_tokens migration |
| 17 | NotificationModule (backend) |
| 18 | Account deletion endpoint (backend) |
| 19 | Account deletion UI (frontend) |
| 20 | Splash screen native integration |
| 21 | Battle Royale Broadcast migration |

### Tasks you do manually:

| Task | Description |
|------|-------------|
| 1 | Generate Capacitor native projects (needs Xcode/Android Studio) |
| 5 | Set Railway environment variables |
| 6 | Upgrade Supabase + Upstash + configure Supabase Auth URLs |
| 7 | Firebase project setup |
| 8 | Google OAuth credentials |
| 9 | Apple Sign-In credentials |
| 10 | IAP store products + backend env vars + migration |
| 22 | Code signing (certificates, keystores) |
| 23 | App icon generation |
| 24 | Store listing content |
| 25 | Screenshots |
| 26 | Beta testing |
| 27 | Final submission |
