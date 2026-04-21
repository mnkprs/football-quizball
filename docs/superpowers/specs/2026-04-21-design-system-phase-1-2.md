# StepOver Design System — Phase 1 + 2 Integration

**Date:** 2026-04-21
**Scope:** Foundation wiring (tokens, mixins, tailwind) + component library install (`so-*` → `shared/ui/`) + 3-file split + verification gallery.
**Out of scope:** Screen migration (Phase 3). No existing feature screen is rewritten in this phase.

---

## Goal

Get the StepOver design system loadable and usable without touching any feature screens. After this phase:

- Every existing screen inherits the new palette/type via CSS variables (Material components included).
- 12 `so-*` components live at `frontend/src/app/shared/ui/`, split into standard Angular 3-file layout (`.ts` + `.html` + `.css`), importable via `@app/shared/ui`.
- A `/dev/ui-gallery` route renders every `so-*` component in every documented state for visual QA.
- No `app-*` component is removed and no feature screen is edited.

---

## Current state (verified 2026-04-21)

| Artifact | Location | Status |
|---|---|---|
| `tokens.css` | `frontend/src/styles/tokens.css` | Copied but not imported anywhere |
| `mixins.css` | `frontend/src/styles/mixins.css` | Copied but not imported anywhere |
| New `tailwind.config.js` (bundle) | `/tailwind.config.js` (repo root) | Orphaned — Angular reads `frontend/tailwind.config.js` |
| 12 `so-*` components | `frontend/src/app/shared/so-*/` | Single-file `.ts` each; wrong parent folder per playbook |
| Barrel | `frontend/src/app/shared/index.ts` | Exports `so-*` components; wrong location per playbook |
| `@app/*` path alias | `frontend/tsconfig.json` | **Not configured** |
| `--mat-sys-*` usage | 12 files, 69 occurrences | Real Material integration in place; palette collision is material |
| Fonts in `index.html` | — | Inter/Lexend/Space Grotesk (400,600,700)/JetBrains Mono/Material Symbols — Space Grotesk **500 missing** |

---

## Three approved foundation decisions (from brainstorm)

1. **Material theme**: load `tokens.css` **after** `styles.scss` via `angular.json` styles array. No rewrite of `mat.theme()`.
2. **Legacy `styles/abstracts/_tokens.css`**: keep in place; new tokens override (Phase 3 will revisit removal).
3. **Verification gallery**: add `/dev/ui-gallery` route rendering every `so-*` component.

---

## Implementation plan

### Step 0 — Audit (no writes)

Purpose: surface collisions before we touch files.

- Diff `frontend/src/styles/abstracts/_tokens.css` against new `frontend/src/styles/tokens.css`. Flag variable names that exist in both but differ. Any mismatch is a deliberate override, not a bug — just document.
- Grep for any existing relative import of `'./shared/so-*'` in the app. Expectation: zero hits (barrel is the only consumer). If non-zero, those imports must be updated in Step 2.
- Grep for any existing consumer of `@app/*` path alias. Expectation: zero. Confirms alias addition is safe.

**Deliverable:** short audit report pasted into PR description. No code changes.

---

### Step 1 — Foundation wiring

One commit, reversible, zero consumer changes.

1. **Tailwind config**
   - Merge bundle `tailwind.config.js` content into `frontend/tailwind.config.js`:
     - Preserve existing `safelist` entries (board gradients, solo/blitz dynamic classes).
     - Add bundle's `safelist` additions (`so-tier-*`).
     - Add `colors.surface.{lowest,low,DEFAULT,high,highest,bright}` keyed to `--color-surface-*`.
     - Add `colors.tier.{legend,elite,challenger,contender,grassroots}`.
     - Add `colors.warning`, `colors.pro`, `colors.accent.dim`.
     - Add `fontFamily.display` aliased to Space Grotesk.
     - Add `borderRadius.{sm,md,lg,xl}` and `boxShadow.{accent-glow,accent-floodlit,ghost}` and `backdropBlur.glass`.
     - Add `animation.pulse-accent` + keyframes.
   - Delete `/tailwind.config.js` at repo root.

2. **`tokens.css` hardening**
   - Remove the `@import url('https://fonts.googleapis.com/...')` line at top of `tokens.css`. Fonts are already delivered via `index.html` `<link>` tags; avoiding double-load.

3. **`index.html`**
   - Update the existing Space Grotesk `<link>` to include weight `500` (currently `400;600;700`).
   - No other snippet additions from the bundle (Material Symbols + other fonts already present).

4. **Stylesheet load order via `angular.json`**
   - Current: `["src/tailwind.css", "src/styles/index.css", "src/styles.scss"]`.
   - Target: `["src/tailwind.css", "src/styles/index.css", "src/styles.scss", "src/styles/tokens.css", "src/styles/mixins.css"]`.
   - This guarantees StepOver tokens override `mat.theme()` output without rewriting the Material integration.

5. **Smoke test**
   - `npm run start` and load home, solo, leaderboard, profile, one settings modal.
   - Expect: overall palette shifts to StepOver (darker surfaces, blue accent) without any layout breakage. Material buttons inherit accent color via `--mat-sys-primary`.
   - If a Material component looks broken (not merely re-skinned), roll back the `angular.json` change and file a follow-up rather than blocking this phase.

**Exit criteria:**
- Build green, app boots.
- Visual palette matches StepOver tokens on existing screens.
- Zero new TypeScript files touched.

---

### Step 2 — Component relocation + path alias

Mechanical. Single commit.

1. **Move folders**
   ```
   frontend/src/app/shared/so-answer-card/    →  frontend/src/app/shared/ui/so-answer-card/
   frontend/src/app/shared/so-avatar/         →  frontend/src/app/shared/ui/so-avatar/
   frontend/src/app/shared/so-button/         →  frontend/src/app/shared/ui/so-button/
   frontend/src/app/shared/so-chip/           →  frontend/src/app/shared/ui/so-chip/
   frontend/src/app/shared/so-icon-button/    →  frontend/src/app/shared/ui/so-icon-button/
   frontend/src/app/shared/so-leaderboard-row/→  frontend/src/app/shared/ui/so-leaderboard-row/
   frontend/src/app/shared/so-mode-card/      →  frontend/src/app/shared/ui/so-mode-card/
   frontend/src/app/shared/so-mode-row/       →  frontend/src/app/shared/ui/so-mode-row/
   frontend/src/app/shared/so-progress-track/ →  frontend/src/app/shared/ui/so-progress-track/
   frontend/src/app/shared/so-rank-badge/     →  frontend/src/app/shared/ui/so-rank-badge/
   frontend/src/app/shared/so-stat-card/      →  frontend/src/app/shared/ui/so-stat-card/
   frontend/src/app/shared/so-top-bar/        →  frontend/src/app/shared/ui/so-top-bar/
   ```
   Use `git mv` so history is preserved.

2. **Relocate barrel**
   - `frontend/src/app/shared/index.ts` → `frontend/src/app/shared/ui/index.ts`.
   - Update relative paths inside barrel accordingly (`./so-button/so-button` entries stay the same).

3. **Update inter-component relative imports**
   - `so-mode-card.ts` imports `../so-chip/so-chip` — unchanged after the move (both still in `ui/`).
   - `so-mode-row.ts` imports `../so-chip/so-chip` — unchanged.
   - `so-leaderboard-row.ts` imports `../so-avatar/so-avatar` — unchanged.
   - `so-rank-badge.ts` imports `../so-avatar/so-avatar` — unchanged.

4. **Path alias**
   - Add to `frontend/tsconfig.json`:
     ```json
     "compilerOptions": {
       "baseUrl": "./src",
       "paths": {
         "@app/*": ["app/*"]
       }
     }
     ```
   - Verify with `npm run build` — still zero consumers, so only the compiler resolver is tested here.

**Exit criteria:**
- `npm run build` passes.
- `@app/shared/ui` resolves in an IDE test file (spot-check).
- `git log --follow` on a component shows history preserved.

---

### Step 3 — 3-file split per component

One commit per component family (bisect-friendly). 12 components grouped as:

- **Commit A — Buttons**: `so-button`, `so-icon-button`
- **Commit B — Chips & badges**: `so-chip`, `so-rank-badge`
- **Commit C — Cards**: `so-mode-card`, `so-mode-row`, `so-answer-card`, `so-stat-card`
- **Commit D — Primitives**: `so-avatar`, `so-progress-track`
- **Commit E — Composites**: `so-leaderboard-row`, `so-top-bar`

Per component, mechanical transformation:

- Extract the value of `template: \`...\``  → new `so-x.html` file; replace with `templateUrl: './so-x.html'`.
- Extract the contents of the `styles: [\`...\`]` array element → new `so-x.css` file; replace with `styleUrl: './so-x.css'`.
- Component class body unchanged.
- `ChangeDetectionStrategy.OnPush` and `standalone: true` preserved.
- `imports: [...]` preserved.

**No behavior changes** in this step. If the diff in a component's `.ts` shows anything beyond `template` → `templateUrl` and `styles` → `styleUrl`, stop and fix.

**Exit criteria:**
- Each `so-*` folder contains exactly 3 files.
- `npm run build` passes after each commit.
- `ng lint` (if configured) passes.

---

### Step 4 — Verification gallery (`/dev/ui-gallery`)

Single commit.

1. **Create `frontend/src/app/features/dev/ui-gallery/`** with 3-file component `UiGalleryComponent`, selector `app-ui-gallery`.
2. **Route** added to `frontend/src/app/app.routes.ts`:
   ```ts
   { path: 'dev/ui-gallery', loadComponent: () =>
       import('./features/dev/ui-gallery/ui-gallery').then(m => m.UiGalleryComponent) }
   ```
   No auth guard. Route is **unlinked from any nav** (reachable only by typing the URL). No environment gating in this phase — the route is dev-aid only and an unlinked hidden URL on production is acceptable.
3. **Gallery content** — one section per component, every documented state:
   - `so-button`: all 5 variants × 3 sizes, disabled state, fullWidth, leading/trailing slot example.
   - `so-chip`: all 7 variants × 3 sizes.
   - `so-mode-card`: with/without image, with/without badge, short/long title.
   - `so-mode-row`: with/without image, with/without badge, with material-icon slot.
   - `so-answer-card`: `default`, `selected`, `correct`, `wrong`, `dim`.
   - `so-progress-track`: 0%, 50%, 100%; heights 2/4/8; glow on/off; custom color.
   - `so-avatar`: sizes 24/36/48/72; initials fallback; `src` image; `ring` + `tier` for each of 5 tiers.
   - `so-rank-badge`: 5 tiers, with and without `elo` value.
   - `so-leaderboard-row`: rank 1/2/3 (medal display), rank 4+ (numeric), `me=true`, delta +/0/−.
   - `so-stat-card`: with/without unit, delta positive/negative/neutral, custom color.
   - `so-top-bar`: compact + large variant, with leading/trailing icon-button content.
   - `so-icon-button`: default + glass.

**Exit criteria:**
- Navigating to `/dev/ui-gallery` renders all 12 components without console errors.
- Visual inspection confirms each component matches its documented visual spec.

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Material components look wrong after palette override | Medium | Smoke test Step 1; rollback is removing two lines from `angular.json` |
| Existing styles consuming legacy `_tokens.css` variables break | Low | We keep legacy tokens loaded; new tokens only override, never delete |
| Tailwind arbitrary values in existing templates use removed tokens | Low | Bundle tailwind is additive over old config; nothing removed |
| Hot-reload doesn't pick up `angular.json` styles change | Low | Restart `ng serve` after Step 1 |
| `git mv` loses history on macOS if case-insensitive FS bites | Low | Operating on lowercased folder names only — safe |
| Gallery route accidentally shipped to prod unguarded | Low | Environment gate in the loadComponent or via a guard flag; call out in PR |

---

## Deliverables

1. PR with ~5 commits in order:
   - `chore(styles): wire StepOver tokens + tailwind + font weights (Phase 1)`
   - `chore(ui): relocate so-* components to shared/ui + add @app path alias (Phase 2 step 2)`
   - `refactor(ui): split so-* components into .ts/.html/.css (Phase 2 step 3, 5 commits grouped by family)`
   - `feat(dev): /dev/ui-gallery route for visual QA of design system`
2. PR description contains:
   - Step 0 audit output.
   - Before/after screenshots of home + one Material-heavy screen (settings modal or auth card).
   - Link to `/dev/ui-gallery` on the Vercel preview.
3. VERSION + CHANGELOG bump per project convention.

---

## Verification checklist (pre-merge)

- [ ] `npm run build` passes.
- [ ] `npm run test` passes (no new tests required; existing tests still green).
- [ ] `/dev/ui-gallery` renders all 12 components without console errors.
- [ ] Home, solo, leaderboard, profile, auth modal — each visually smoke-tested on dev build.
- [ ] No existing feature screen was edited (git diff touches only: `frontend/tailwind.config.js`, `frontend/src/styles/tokens.css`, `frontend/src/styles/mixins.css`, `frontend/src/index.html`, `frontend/src/styles.scss`, `frontend/angular.json`, `frontend/tsconfig.json`, `frontend/src/app/shared/ui/**`, `frontend/src/app/app.routes.ts`, `frontend/src/app/features/dev/**`, `VERSION`, `CHANGELOG.md`).
- [ ] `git log --follow` on one relocated component shows pre-move history.
- [ ] Root-level `/tailwind.config.js` deleted.

---

## Next phase (not in scope)

Phase 3 — screen-by-screen migration per `DESIGN_SYSTEM_MIGRATION.md` playbook tiers. Not started until Phase 1 + 2 is merged and live in production.
