# Force Update Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an in-app banner when a new version is available, with two modes: soft update (dismissible) and force update (blocks app usage until updated).

**Architecture:** The backend already has an `app_settings` table and `getSetting()` helper. We'll add two keys: `min_version` (force update below this) and `latest_version` (soft prompt below this). On app launch, a new `UpdateService` calls `@capacitor/app` → `App.getInfo()` to get the installed version, fetches the version config from a new `/api/config/version` endpoint, compares using semver logic, and exposes a signal consumed by a new `ForceUpdateBannerComponent`. The banner is non-dismissible for force updates (covers the entire screen) and dismissible for soft updates (notification-style, reusing the existing banner pattern).

**Tech Stack:** Angular 20, `@capacitor/app`, NestJS, Supabase `app_settings` table, existing `ConfigController`, existing banner CSS patterns.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/src/config/config.controller.ts` | Add `GET /api/config/version` endpoint |
| Create | `frontend/src/app/core/update.service.ts` | Version check logic, semver compare, signals |
| Create | `frontend/src/app/shared/force-update-banner/force-update-banner.ts` | Force update overlay + soft update banner UI |
| Create | `frontend/src/app/shared/force-update-banner/force-update-banner.html` | Template |
| Create | `frontend/src/app/shared/force-update-banner/force-update-banner.css` | Styles |
| Modify | `frontend/src/app/core/config-api.service.ts` | Add `loadVersionConfig()` method |
| Modify | `frontend/src/app/app.ts` | Import UpdateService, trigger check on init |
| Modify | `frontend/src/app/app.html` | Add `<app-force-update-banner />` |

---

### Task 1: Add Version Endpoint to Backend

**Files:**
- Modify: `backend/src/config/config.controller.ts`

This reuses the existing `app_settings` table and `getSetting()` pattern already used for ad config.

- [ ] **Step 1: Add the version config endpoint**

Add this method to `ConfigController` in `backend/src/config/config.controller.ts`, below the existing `getAdConfig()` method:

```typescript
interface VersionConfig {
  minVersion: string;
  latestVersion: string;
  updateUrl: {
    ios: string;
    android: string;
  };
}

const DEFAULT_VERSION_CONFIG: VersionConfig = {
  minVersion: '0.0.0',
  latestVersion: '0.0.0',
  updateUrl: {
    ios: 'https://apps.apple.com/app/stepovr/id_PLACEHOLDER',
    android: 'https://play.google.com/store/apps/details?id=com.stepovr.app',
  },
};
```

And the endpoint:

```typescript
@Get('version')
async getVersionConfig(): Promise<VersionConfig> {
  const raw = await this.supabase.getSetting('version_config');
  if (!raw) return DEFAULT_VERSION_CONFIG;
  try {
    return { ...DEFAULT_VERSION_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_VERSION_CONFIG;
  }
}
```

- [ ] **Step 2: Verify the backend compiles**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Seed the `app_settings` row in Supabase**

Insert the initial version config into the existing `app_settings` table:

```sql
INSERT INTO app_settings (key, value)
VALUES (
  'version_config',
  '{"minVersion":"1.7.0","latestVersion":"1.7.0","updateUrl":{"ios":"https://apps.apple.com/app/stepovr/id_PLACEHOLDER","android":"https://play.google.com/store/apps/details?id=com.stepovr.app"}}'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/config/config.controller.ts
git commit -m "feat: add GET /api/config/version endpoint for app update checks"
```

---

### Task 2: Create UpdateService

**Files:**
- Create: `frontend/src/app/core/update.service.ts`
- Modify: `frontend/src/app/core/config-api.service.ts`

- [ ] **Step 1: Add `loadVersionConfig` to ConfigApiService**

Add the following to `frontend/src/app/core/config-api.service.ts`. Add the import for `Observable` and the interface + method:

```typescript
export interface VersionConfig {
  minVersion: string;
  latestVersion: string;
  updateUrl: {
    ios: string;
    android: string;
  };
}
```

Add this method to the class:

```typescript
getVersionConfig(): Observable<VersionConfig> {
  return this.http.get<VersionConfig>(`${this.base}/version`);
}
```

Also add the import at the top:

```typescript
import { firstValueFrom, Observable } from 'rxjs';
```

(Replace the existing `import { firstValueFrom } from 'rxjs';`)

- [ ] **Step 2: Create UpdateService**

Create `frontend/src/app/core/update.service.ts`:

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { firstValueFrom, catchError, of } from 'rxjs';
import { ConfigApiService, type VersionConfig } from './config-api.service';
import { PlatformService } from './platform.service';

export type UpdateMode = 'none' | 'soft' | 'force';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private configApi = inject(ConfigApiService);
  private platform = inject(PlatformService);

  readonly mode = signal<UpdateMode>('none');
  readonly storeUrl = signal('');

  async check(): Promise<void> {
    if (!this.platform.isNative) return;

    try {
      const [info, config] = await Promise.all([
        App.getInfo(),
        firstValueFrom(
          this.configApi.getVersionConfig().pipe(catchError(() => of(null))),
        ),
      ]);

      if (!config) return;

      const current = info.version; // e.g. "1.7.0"

      // Resolve store URL for the current platform
      const url = this.platform.isIos
        ? config.updateUrl.ios
        : config.updateUrl.android;
      this.storeUrl.set(url);

      if (this.isOlderThan(current, config.minVersion)) {
        this.mode.set('force');
      } else if (this.isOlderThan(current, config.latestVersion)) {
        this.mode.set('soft');
      }
    } catch {
      // Non-critical — don't block app startup
    }
  }

  /** Returns true if `a` is strictly older than `b` (semver major.minor.patch). */
  private isOlderThan(a: string, b: string): boolean {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const va = pa[i] ?? 0;
      const vb = pb[i] ?? 0;
      if (va < vb) return true;
      if (va > vb) return false;
    }
    return false;
  }
}
```

- [ ] **Step 3: Verify frontend compiles**

Run: `cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds (the service isn't used yet, but should compile)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/core/update.service.ts frontend/src/app/core/config-api.service.ts
git commit -m "feat: add UpdateService with semver compare and version config fetch"
```

---

### Task 3: Create ForceUpdateBannerComponent

**Files:**
- Create: `frontend/src/app/shared/force-update-banner/force-update-banner.ts`
- Create: `frontend/src/app/shared/force-update-banner/force-update-banner.html`
- Create: `frontend/src/app/shared/force-update-banner/force-update-banner.css`

- [ ] **Step 1: Create the component TypeScript**

Create `frontend/src/app/shared/force-update-banner/force-update-banner.ts`:

```typescript
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { UpdateService } from '../../core/update.service';

@Component({
  selector: 'app-force-update-banner',
  standalone: true,
  templateUrl: './force-update-banner.html',
  styleUrl: './force-update-banner.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForceUpdateBannerComponent {
  readonly update = inject(UpdateService);

  openStore(): void {
    const url = this.update.storeUrl();
    if (url) {
      window.open(url, '_system');
    }
  }

  dismiss(): void {
    this.update.mode.set('none');
  }
}
```

- [ ] **Step 2: Create the template**

Create `frontend/src/app/shared/force-update-banner/force-update-banner.html`:

```html
<!-- Force update: full-screen blocking overlay -->
@if (update.mode() === 'force') {
  <div class="force-overlay" role="alertdialog" aria-modal="true" aria-label="Update required">
    <div class="force-card glass-surface">
      <span class="force-icon material-icons">system_update</span>
      <h2 class="force-title">Update Required</h2>
      <p class="force-body">
        A new version of StepOvr is available. Please update to continue playing.
      </p>
      <button class="force-cta" (click)="openStore()">Update Now</button>
    </div>
  </div>
}

<!-- Soft update: dismissible notification banner -->
@if (update.mode() === 'soft') {
  <div class="banner banner--update glass-surface" role="status" aria-live="polite">
    <span class="banner__icon material-icons" aria-hidden="true">upgrade</span>
    <div class="banner__body">
      <p class="banner__title">New version available!</p>
    </div>
    <div class="banner__actions">
      <button class="banner__cta" (click)="openStore()">Update</button>
      <button class="banner__dismiss" (click)="dismiss()" aria-label="Dismiss update notification">
        <span class="material-icons">close</span>
      </button>
    </div>
  </div>
}
```

- [ ] **Step 3: Create the styles**

Create `frontend/src/app/shared/force-update-banner/force-update-banner.css`:

```css
/* ── Force update overlay (full-screen, non-dismissible) ── */

.force-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 1.5rem;
}

.force-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 320px;
  width: 100%;
  padding: 2.5rem 2rem;
  border-radius: var(--radius-xl);
  border: 1px solid var(--glass-border-strong);
  box-shadow: var(--shadow-lg);
}

.force-icon {
  font-size: 3rem;
  color: var(--color-accent);
  margin-bottom: 1rem;
}

.force-title {
  margin: 0;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--color-fg);
  letter-spacing: -0.02em;
}

.force-body {
  margin: 0.75rem 0 1.5rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.875rem;
  color: var(--color-fg-variant);
  line-height: 1.5;
}

.force-cta {
  padding: 0.75rem 2rem;
  border-radius: var(--radius-full);
  font-family: 'Inter', sans-serif;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--color-accent-fg);
  background: var(--color-accent);
  border: none;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}

.force-cta:active {
  opacity: 0.85;
  transform: scale(0.96);
}

/* ── Soft update banner (reuses notification-banner pattern) ── */

.banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--glass-border-strong);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(var(--glass-blur-md));
  -webkit-backdrop-filter: blur(var(--glass-blur-md));
  box-shadow: var(--shadow-md);
  animation: banner-slide-in 0.3s ease-out both;
}

@keyframes banner-slide-in {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.banner--update {
  border-color: rgba(255, 149, 0, 0.3);
  background: linear-gradient(
    120deg,
    rgba(255, 149, 0, 0.12) 0%,
    var(--glass-bg-default) 60%
  );
}

.banner__icon {
  font-size: 1.375rem;
  line-height: 1;
  flex-shrink: 0;
  color: rgb(255, 149, 0);
}

.banner__body {
  flex: 1;
  min-width: 0;
}

.banner__title {
  margin: 0;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-fg);
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.banner__actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

.banner__cta {
  padding: 0.375rem 0.75rem;
  border-radius: var(--radius-full);
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #fff;
  background: rgb(255, 149, 0);
  border: none;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  white-space: nowrap;
}

.banner__cta:active {
  opacity: 0.85;
  transform: scale(0.96);
}

.banner__dismiss {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--color-fg-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.1s;
  padding: 0;
}

.banner__dismiss:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-fg);
}

.banner__dismiss:active {
  transform: scale(0.92);
}

.banner__dismiss .material-icons {
  font-size: 0.875rem;
  line-height: 1;
}

@media (prefers-reduced-motion: reduce) {
  .banner { animation: none; }
}
```

- [ ] **Step 4: Verify frontend compiles**

Run: `cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/force-update-banner/
git commit -m "feat: add ForceUpdateBannerComponent with force and soft update modes"
```

---

### Task 4: Wire UpdateService into App Startup

**Files:**
- Modify: `frontend/src/app/app.ts`
- Modify: `frontend/src/app/app.html`

- [ ] **Step 1: Import and inject UpdateService in App component**

In `frontend/src/app/app.ts`, add the import:

```typescript
import { UpdateService } from './core/update.service';
import { ForceUpdateBannerComponent } from './shared/force-update-banner/force-update-banner';
```

Add `ForceUpdateBannerComponent` to the `imports` array:

```typescript
imports: [RouterOutlet, DonateModalComponent, AuthModalComponent, UsernameModalComponent, AchievementUnlockModalComponent, ToastComponent, CookieConsentComponent, NgOptimizedImage, ForceUpdateBannerComponent],
```

Add the injection in the class body (alongside the other private injections):

```typescript
private updateService = inject(UpdateService);
```

- [ ] **Step 2: Trigger version check in ngOnInit**

In the `ngOnInit()` method of `App`, add the version check call right after the ad config load (line 73-74 area):

```typescript
void this.updateService.check();
```

So it becomes:

```typescript
ngOnInit(): void {
  void this.configApi.loadAdConfig();
  void this.adService.initialize();
  void this.updateService.check();
  // ... rest of ngOnInit
```

- [ ] **Step 3: Add the banner to app.html**

In `frontend/src/app/app.html`, add the force update banner right after `<app-cookie-consent />` (before the splash):

```html
<app-toast />
<app-cookie-consent />
<app-force-update-banner />
```

The force overlay (z-index 10000) will cover everything when active. The soft banner renders inline but won't show on web (UpdateService returns early for non-native).

- [ ] **Step 4: Verify frontend compiles**

Run: `cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app.ts frontend/src/app/app.html
git commit -m "feat: wire UpdateService into app startup, show force-update banner on launch"
```

---

### Task 5: Manual Testing & Version Bump Workflow

This task documents how to test and how to use the system going forward.

- [ ] **Step 1: Test locally by faking a low version**

To test without a real native build, temporarily modify `UpdateService.check()` to skip the `isNative` guard and hardcode a version:

```typescript
// TEMPORARY — remove after testing
const info = { version: '1.5.0' }; // fake old version
```

Set `app_settings.version_config` to `{"minVersion":"1.6.0","latestVersion":"1.7.0",...}` so `1.5.0 < 1.6.0` triggers force mode.

Verify:
- Force overlay appears, covers entire screen
- No way to dismiss it
- "Update Now" opens the store URL

Then change the fake version to `1.6.5` (between min and latest):
- Soft banner appears (orange, dismissible)
- Dismiss button hides it
- "Update" button opens the store URL

Revert the temporary changes after testing.

- [ ] **Step 2: Document the release workflow**

When releasing a new version:

1. Build and publish the app to App Store / Play Store with the new version number (e.g., `1.8.0`)
2. Once the new version is live in stores, update the Supabase `app_settings` row:

```sql
UPDATE app_settings
SET value = '{"minVersion":"1.7.0","latestVersion":"1.8.0","updateUrl":{"ios":"https://apps.apple.com/app/stepovr/id_PLACEHOLDER","android":"https://play.google.com/store/apps/details?id=com.stepovr.app"}}'
WHERE key = 'version_config';
```

- Set `latestVersion` to the new version → users on older versions get a soft prompt
- Set `minVersion` to the oldest version you still support → users below this are force-blocked
- Update the iOS store URL once you have the real App Store ID

- [ ] **Step 3: Commit any final cleanup**

```bash
git add -A
git commit -m "chore: finalize force update banner implementation"
```

---

## Summary

| What | Where |
|------|-------|
| Version config storage | Supabase `app_settings` table, key `version_config` |
| Backend endpoint | `GET /api/config/version` |
| Version compare logic | `UpdateService.isOlderThan()` (semver major.minor.patch) |
| Force update | Full-screen overlay, non-dismissible, blocks all app usage |
| Soft update | Orange notification banner, dismissible, follows existing banner pattern |
| Platform detection | `PlatformService.isNative` — skips entirely on web |
| Store links | Configurable per-platform via the `updateUrl` field |
| When to update config | After publishing a new version to the stores |
