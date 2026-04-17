# Landing Page Design

**Date:** 2026-04-17
**Status:** Approved — awaiting implementation plan
**Author:** Claude + Emmanouil Kaparos

## Context

StepOver is a native-only iOS/Android app (per project constraint in `.claude/CLAUDE.md`). The current Angular web frontend is used only for development and will be retired once the native app launches. At launch, the web domain should serve a single-purpose marketing landing page that converts visitors into app installs.

## Goals

1. Produce a single-route landing page that informs visitors about StepOver and directs them to the appropriate app store.
2. Coexist with the current dev web app without disrupting development; flip to landing-only mode at launch via a single environment flag.
3. Keep visual identity consistent with the product so users recognize the brand post-install.
4. Require zero backend calls — the landing page is static content only.

## Non-Goals (v1)

- Analytics / event tracking
- Internationalization (English only)
- A/B testing infrastructure
- Newsletter signup / lead capture
- Real production screenshots (placeholders with TODO markers for launch)
- Dynamic content (reviews, player counts, live leaderboards)

## Architecture

### Route strategy

Landing lives at `/` behind an environment flag. Implementation in `frontend/src/app/app.routes.ts`:

```ts
export const routes: Routes = environment.landingMode
  ? [
      { path: '', loadComponent: () => import('./features/landing/landing').then(m => m.LandingComponent) },
      { path: 'terms', loadComponent: () => import('./features/legal/terms').then(m => m.TermsComponent) },
      { path: 'privacy', loadComponent: () => import('./features/legal/privacy').then(m => m.PrivacyComponent) },
      { path: '**', redirectTo: '' },
    ]
  : [ /* existing full routes array unchanged */ ];
```

- `environment.ts` (dev): `landingMode: false`
- `environment.prod.ts` (launch): `landingMode: true`
- Launch-day change is flipping one boolean and redeploying.
- In landing mode, only `/`, `/terms`, and `/privacy` resolve. Any bookmarked app route (e.g. `/duel`, `/solo`) redirects to `/` via the `**` wildcard. This prevents the dev app from leaking into the launch build.

### Component structure

Location: `frontend/src/app/features/landing/`

Files:
- `landing.ts` — standalone component, no auth/shell dependencies
- `landing.html` — template with 6 sections
- `landing.scss` — landing-specific styles (no TailwindCSS conflicts)
- `landing.spec.ts` — unit tests
- `platform-detector.ts` — pure utility, `detectPlatform(ua: string): 'ios' | 'android' | 'other'`
- `platform-detector.spec.ts` — unit tests for detection matrix

The component MUST NOT import from `ShellComponent`, `AuthService`, or any gameplay modules.

### Config

Extend `environment.ts` and `environment.prod.ts`:

```ts
export const environment = {
  // ... existing fields
  landingMode: false,  // true in prod at launch
  stores: {
    appStoreUrl: 'https://apps.apple.com/app/idXXXXXXXX',     // TODO: replace at launch
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.stepover.app', // TODO: confirm package name
    appStoreId: 'XXXXXXXX',                                    // TODO: for smart-banner meta tag
  },
};
```

## Page Sections (top to bottom)

### 1. Hero
- StepOver logomark (reuse existing brand asset)
- Headline: "Football trivia, head-to-head."
- Subhead: one-line pitch (e.g., "Duel friends, climb ELO, master the badges.")
- Device-aware store badges (primary badge matches detected platform)
- Hero phone mockup on the right (desktop) / below CTA (mobile)
- Full-viewport-height on desktop, comfortable min-height on mobile

### 2. Feature grid
6 cards, 3 columns desktop / 2 columns tablet / 1 column mobile. Each card:
- Icon (reuse existing mode icons from `assets/icons/`)
- Mode name
- One-line description

Cards:
- **Logo Quiz** — Guess the club from the crest.
- **Duel** — Head-to-head ELO trivia matches.
- **Battle Royale** — Last player standing wins.
- **Solo ELO** — Climb the ranked ladder alone.
- **Mayhem** — Chaotic multi-topic sprints.
- **Blitz** — 60-second rapid-fire rounds.

### 3. Screenshots strip
3–5 phone mockups. Horizontal scroll on mobile (snap-scroll), grid on desktop. Placeholder images at `frontend/src/assets/landing/screenshot-{1..5}.png` with `TODO: replace with App Store screenshots` comment.

### 4. How it works
3 numbered steps, horizontal on desktop, stacked on mobile:
1. **Download** — Tap the store badge for your device.
2. **Sign up** — Create a free StepOver profile in seconds.
3. **Play** — Pick a mode and start climbing.

### 5. Final CTA band
- Heading: "Ready to play?"
- Store badges repeated at same size as hero

### 6. Footer
- Small logomark + tagline
- Links: Terms (`/terms`), Privacy (`/privacy`), contact email (`mailto:support@stepover.app`)
- Copyright line with current year

## Device Detection & Store CTAs

### `detectPlatform(userAgent: string): 'ios' | 'android' | 'other'`

Rules:
- iOS: `/iPad|iPhone|iPod/.test(ua)` AND not in `window.MSStream` (Edge legacy guard)
- Android: `/Android/i.test(ua)`
- Otherwise: `'other'`

### CTA rendering

- `ios` → App Store badge primary (full size), Play Store badge secondary (60% opacity, smaller)
- `android` → Play Store primary, App Store secondary
- `other` → Both badges at equal size side-by-side

Badges link to `environment.stores.appStoreUrl` / `playStoreUrl`.

### Smart banner (native OS feature)

- **iOS Safari:** `<meta name="apple-itunes-app" content="app-id=XXXXXXXX">` added to `index.html`. Browser renders native install banner.
- **Android Chrome:** `manifest.json` `related_applications` entry:
  ```json
  "related_applications": [{ "platform": "play", "id": "com.stepover.app" }],
  "prefer_related_applications": true
  ```
- No JavaScript required for either.

## Visual System (Hybrid)

- **Background:** `#0a0a0a` base with a radial gradient accent (low-intensity, matches Pro Arena vocabulary)
- **Accent panels:** gold glass (reuse existing `--glass-gold` token if present, else define as part of this work)
- **Typography scale (desktop → mobile):**
  - Hero H1: 72px → 44px
  - Section H2: 44px → 28px
  - Body: 18px → 16px
- **Section padding:** vertical 96px desktop / 48px mobile; horizontal 24px max-width 1200px
- **Motion:** one subtle parallax on hero phone mockup tied to scroll. No entrance animations, no auto-playing video.

## Testing

### Unit tests
- `platform-detector.spec.ts`:
  - iPhone UA → `'ios'`
  - iPad UA → `'ios'`
  - Android Chrome UA → `'android'`
  - macOS Safari UA → `'other'`
  - Empty/malformed UA → `'other'`
- `landing.spec.ts`:
  - Renders all 6 sections
  - CTA primary badge matches mocked platform
  - Store URLs come from `environment.stores`
  - Footer links resolve to `/terms` and `/privacy`

### Integration
- Smart-banner meta tag present in built `index.html`
- `manifest.json` contains `related_applications` and `prefer_related_applications: true`

### E2E (Playwright)
- With `landingMode=true` build, visit `/`, assert:
  - Hero headline text visible
  - At least one store badge is a clickable link
  - Footer contains links to `/terms` and `/privacy`
  - Page does NOT contain shell top-nav chrome

## File Impact Summary

**New:**
- `frontend/src/app/features/landing/landing.ts`
- `frontend/src/app/features/landing/landing.html`
- `frontend/src/app/features/landing/landing.scss`
- `frontend/src/app/features/landing/landing.spec.ts`
- `frontend/src/app/features/landing/platform-detector.ts`
- `frontend/src/app/features/landing/platform-detector.spec.ts`
- `frontend/src/assets/landing/*.png` (placeholder screenshots + icons)
- `frontend/e2e/landing.spec.ts` (Playwright)

**Modified:**
- `frontend/src/app/app.routes.ts` — conditional root route
- `frontend/src/environments/environment.ts` — add `landingMode: false`, `stores` block
- `frontend/src/environments/environment.prod.ts` — add `landingMode: false` (flipped to `true` on launch day) and real store URLs
- `frontend/src/index.html` — add `apple-itunes-app` meta tag
- `frontend/src/manifest.webmanifest` — add `related_applications` and `prefer_related_applications`
- `VERSION` and `CHANGELOG.md` — per project commit rules

## Asset Audit (to verify in planning phase)

Before implementation, verify these assets exist in `frontend/src/assets/` and either reuse or create placeholders marked with TODO:
- StepOver logomark (hero + footer)
- 6 mode icons (Logo Quiz, Duel, Battle Royale, Solo ELO, Mayhem, Blitz)
- Hero phone mockup frame
- 5 screenshot placeholders
- App Store / Play Store badge SVGs (official brand assets from Apple & Google)

Gold glass design token: if `--glass-gold` (or equivalent) does not exist in the shared CSS token system, define it in `landing.scss` scoped to the component to avoid polluting shared tokens.

## Risks & Mitigations

- **Risk:** Dev accidentally ships with `landingMode: true` locally → sees landing instead of app during dev. **Mitigation:** default `false` in base `environment.ts`; only `environment.prod.ts` toggles it; document in PR description.
- **Risk:** Store URLs wrong at launch. **Mitigation:** mark placeholders with `TODO: replace at launch`; add launch checklist item to verify before flipping flag.
- **Risk:** Component CSS budget violation (see prior fix in commit `fcb26aa`). **Mitigation:** keep `landing.scss` under 25kB; use shared tokens where possible; fail fast in CI.

## Open Items for Launch Day (not this PR)

- Replace placeholder App Store ID and Play Store package ID with real values
- Replace 5 placeholder screenshots with App Store submission screenshots
- Flip `environment.prod.ts` `landingMode` to `true`
- Verify smart-banner meta tags resolve correctly on real devices

## Acceptance Criteria

- Running `ng serve` with `environment.ts` defaults shows the current app at `/` (dev behavior unchanged)
- Building with `environment.prod.ts` and `landingMode: true` serves the landing page at `/`
- All unit tests pass, E2E landing spec passes
- Component CSS stays under the 25kB budget
- Visual review confirms Hybrid direction (dark + gold glass + marketing-scale spacing)
