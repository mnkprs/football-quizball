# StepOver Design System — Phase 1 + 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the StepOver design system tokens/mixins/tailwind extensions into the Angular app, relocate the 12 `so-*` components into `shared/ui/`, split each into `.ts`/`.html`/`.css`, and add a `/dev/ui-gallery` verification route — without touching any feature screen.

**Architecture:** Three-step foundation (tailwind merge, tokens import order via `angular.json`, font link adjustment) leaves the existing `mat.theme()` and legacy `_tokens.css` in place; new tokens load **last** to win the cascade. Components relocate via `git mv` + a `@app/*` path alias. The split is mechanical (`template`/`styles` → `templateUrl`/`styleUrl`).

**Tech Stack:** Angular 20 (standalone, signals), Tailwind v3 (CSS-var-backed palette), Angular Material (via `mat.theme()` sass mixin), SCSS (global styles.scss), plain CSS (token + mixin layer).

**Branch:** `design-system/phase-1-2` (already created, spec already committed).

---

## Pre-flight

Before Task 1, verify:

- [ ] You are on branch `design-system/phase-1-2`
  ```bash
  cd /Users/instashop/Projects/football-quizball && git branch --show-current
  ```
  Expected output: `design-system/phase-1-2`

- [ ] Working tree is clean except for the new untracked `so-*` + styles files
  ```bash
  git status --short
  ```
  Expected: every listed path is either `??` (untracked new file) or the committed spec. No `M` lines.

- [ ] `frontend/node_modules` exists (avoid surprise installs mid-plan)
  ```bash
  test -d frontend/node_modules && echo OK || echo "Run: cd frontend && npm install"
  ```

---

## Task 1: Pre-integration audit

**Purpose:** produce 3 small audit outputs that de-risk the subsequent edits. Pure read-only.

**Files:** none modified. Outputs pasted into the PR description later.

- [ ] **Step 1.1: Diff legacy vs new token variable names**

Run:
```bash
cd /Users/instashop/Projects/football-quizball
grep -E '^\s*--[a-z-]+' frontend/src/styles/abstracts/_tokens.css | sed -E 's/^\s*(--[a-z0-9-]+).*/\1/' | sort -u > /tmp/tokens-legacy.txt
grep -E '^\s*--[a-z-]+' frontend/src/styles/tokens.css | sed -E 's/^\s*(--[a-z0-9-]+).*/\1/' | sort -u > /tmp/tokens-new.txt
comm -12 /tmp/tokens-legacy.txt /tmp/tokens-new.txt | head -50
```
Expected: a list of variables defined by both files. These are the override-winners.

- [ ] **Step 1.2: Confirm no existing consumer of the new components**

Run:
```bash
grep -rEn "from ['\"].*shared/so-" frontend/src --include="*.ts" | grep -v "^frontend/src/app/shared/"
```
Expected: zero lines (components are unused outside their own folder + barrel).

- [ ] **Step 1.3: Confirm `@app/` path alias is not already in use**

Run:
```bash
grep -rEn "from ['\"]@app/" frontend/src --include="*.ts" | head
```
Expected: zero lines.

- [ ] **Step 1.4: Save audit notes for the PR description**

Capture the three outputs into a single paragraph you can paste into the PR body later. No file commit in this task.

---

## Task 2: Merge tailwind config + delete orphan root config

**Files:**
- Modify: `frontend/tailwind.config.js`
- Delete: `tailwind.config.js` (repo root)

**Why:** Angular reads `frontend/tailwind.config.js`. The bundle's config was placed at repo root; it's orphaned. We merge additive content into the live file and delete the root one.

- [ ] **Step 2.1: Replace `frontend/tailwind.config.js`**

Write this exact content to `frontend/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,ts}'],
  safelist: [
    // Board category gradients (dynamic class binding)
    'from-amber-800', 'to-amber-600', 'bg-amber-900', 'border-amber-700',
    'from-purple-700', 'to-purple-500', 'bg-purple-900', 'border-purple-700',
    'from-blue-700',   'to-blue-500',   'bg-blue-900',   'border-blue-700',
    'from-red-700',    'to-red-500',    'bg-red-900',    'border-red-700',
    'from-teal-700',   'to-teal-500',   'bg-teal-900',   'border-teal-700',
    'from-green-700',  'to-green-500',  'bg-green-900',  'border-green-700',
    'from-pink-700',   'to-pink-500',   'bg-pink-900',   'border-pink-700',
    'from-indigo-700', 'to-indigo-500', 'bg-indigo-900', 'border-indigo-700',
    // Solo & Blitz dynamic classes (choiceClass, difficultyBadgeClass, result banners)
    'bg-win/10', 'bg-win/20', 'bg-win/95', 'border-win', 'border-win/50', 'text-win',
    'bg-loss/10', 'bg-loss/20', 'bg-loss/95', 'border-loss', 'text-loss',
    'bg-yellow-900/50', 'text-yellow-400', 'border-yellow-700',
    'text-white/80',
    'animate-wrong-shake',
    // StepOver tier classes for dynamic leaderboard rows
    'so-tier-legend','so-tier-elite','so-tier-challenger','so-tier-contender','so-tier-grassroots',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        card: {
          DEFAULT: 'var(--color-card)',
          foreground: 'var(--color-card-foreground)',
        },
        border: 'var(--color-border)',
        muted: {
          DEFAULT: 'var(--color-muted)',
          foreground: 'var(--color-muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          foreground: 'var(--color-accent-foreground)',
          light: 'var(--color-accent-light)',
          dim: 'var(--color-accent-dim)',
        },
        surface: {
          lowest:  'var(--color-surface-lowest)',
          low:     'var(--color-surface-low)',
          DEFAULT: 'var(--color-surface)',
          high:    'var(--color-surface-high)',
          highest: 'var(--color-surface-highest)',
          bright:  'var(--color-surface-bright)',
        },
        destructive: 'var(--color-destructive)',
        win:  'var(--color-win)',
        loss: 'var(--color-loss)',
        draw: 'var(--color-draw)',
        ring: 'var(--color-ring)',
        warning: 'var(--color-warning)',
        pro: 'var(--color-pro)',
        tier: {
          legend:     'var(--tier-legend)',
          elite:      'var(--tier-elite)',
          challenger: 'var(--tier-challenger)',
          contender:  'var(--tier-contender)',
          grassroots: 'var(--tier-grassroots)',
        },
      },
      fontFamily: {
        sans:     ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        headline: ['Space Grotesk', 'sans-serif'],
        display:  ['Space Grotesk', 'sans-serif'],
        numeric:  ['Lexend', 'sans-serif'],
        mono:     ['JetBrains Mono', 'monospace'],
        brand:    ['Alfa Slab One', 'serif'],
      },
      borderRadius: {
        sm: '4px', md: '8px', lg: '12px', xl: '24px',
      },
      boxShadow: {
        'accent-glow':     '0 0 15px rgba(0, 122, 255, 0.30)',
        'accent-floodlit': '0 0 60px -15px rgba(0, 122, 255, 0.30)',
        'ghost':           'inset 0 0 0 1px rgba(42, 53, 68, 0.15)',
      },
      backdropBlur: {
        glass: '20px',
      },
      animation: {
        'wrong-shake':  'wrong-shake-tight 400ms cubic-bezier(0.25, 1, 0.5, 1)',
        'pulse-accent': 'so-pulse-accent 1.8s ease-in-out infinite',
      },
      keyframes: {
        'wrong-shake-tight': {
          '0%,100%': { transform: 'translateX(0)' },
          '20%':     { transform: 'translateX(-4px)' },
          '40%':     { transform: 'translateX(4px)' },
          '60%':     { transform: 'translateX(-3px)' },
          '80%':     { transform: 'translateX(2px)' },
        },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2.2: Delete orphan root tailwind config**

Run:
```bash
rm /Users/instashop/Projects/football-quizball/tailwind.config.js
```

- [ ] **Step 2.3: Verify tailwind still parses by running a build**

Run:
```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build
```
Expected: build succeeds. Zero TypeScript errors. Zero tailwind errors. Non-zero output acceptable if only pre-existing warnings; fail loudly on new errors.

- [ ] **Step 2.4: Commit**

```bash
cd /Users/instashop/Projects/football-quizball
git add frontend/tailwind.config.js tailwind.config.js
git commit -m "chore(tailwind): merge StepOver tokens + tier palette, drop orphan root config"
```

---

## Task 3: Strip duplicate font @import from tokens.css

**Files:**
- Modify: `frontend/src/styles/tokens.css` (remove lines 7 in the copy currently on disk)

**Why:** `index.html` already `<link>`s Inter/Lexend/Space Grotesk/JetBrains Mono. `tokens.css` as shipped starts with an `@import url('https://fonts.googleapis.com/...')` that would double-load those fonts.

- [ ] **Step 3.1: Locate the import line**

Run:
```bash
grep -n "^@import url" /Users/instashop/Projects/football-quizball/frontend/src/styles/tokens.css
```
Expected output:
```
7:@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Lexend:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
```

- [ ] **Step 3.2: Remove the line via targeted edit**

Replace in `frontend/src/styles/tokens.css`:

FIND:
```
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Lexend:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');

:root {
```

REPLACE WITH:
```
:root {
```

(This also removes the trailing blank line that preceded the `:root` block.)

- [ ] **Step 3.3: Verify no other `@import url(...googleapis...)` hides in styles**

Run:
```bash
grep -rn "fonts.googleapis.com" /Users/instashop/Projects/football-quizball/frontend/src/styles/
```
Expected: no matches. If any show up, leave them; note for future cleanup.

- [ ] **Step 3.4: (no commit yet — will batch with Task 4)**

---

## Task 4: Add Space Grotesk weight 500 to index.html

**Files:**
- Modify: `frontend/src/index.html`

**Why:** the design tokens reference Space Grotesk 500 via `font-weight: 500` in mixin text styles. `index.html` currently requests only `400;600;700`.

- [ ] **Step 4.1: Update the Space Grotesk link**

In `frontend/src/index.html`, find the existing combined font `<link>`:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&amp;family=JetBrains+Mono:wght@400;600&amp;family=Lexend:wght@400;500;600;700&amp;family=Space+Grotesk:wght@400;600;700&amp;display=swap" rel="stylesheet">
```

Replace the `Space+Grotesk:wght@400;600;700` segment with `Space+Grotesk:wght@400;500;600;700`. Full new link:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&amp;family=JetBrains+Mono:wght@400;600&amp;family=Lexend:wght@400;500;600;700&amp;family=Space+Grotesk:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
```

Only the Space Grotesk weight list changes (`400;600;700` → `400;500;600;700`).

- [ ] **Step 4.2: Verify**

Run:
```bash
grep "Space+Grotesk" /Users/instashop/Projects/football-quizball/frontend/src/index.html
```
Expected: the updated line containing `Space+Grotesk:wght@400;500;600;700`.

- [ ] **Step 4.3: Commit Tasks 3 + 4 together**

```bash
cd /Users/instashop/Projects/football-quizball
git add frontend/src/styles/tokens.css frontend/src/styles/mixins.css frontend/src/index.html
git commit -m "chore(styles): add StepOver tokens + mixins, bump Space Grotesk to include weight 500"
```
(The `mixins.css` addition has no edits in Tasks 3/4 but this is the moment we bring it into source control.)

---

## Task 5: Wire tokens + mixins into Angular build via `angular.json`

**Files:**
- Modify: `frontend/angular.json`

**Why:** Loading tokens.css/mixins.css **after** `styles.scss` in the compiled stylesheet chain is what lets StepOver `--mat-sys-*` overrides beat the `mat.theme()` output.

- [ ] **Step 5.1: Update the `styles` array**

In `frontend/angular.json`, find the `build.options.styles` array. It currently reads:

```json
"styles": [
  "src/tailwind.css",
  "src/styles/index.css",
  "src/styles.scss"
],
```

Change it to:

```json
"styles": [
  "src/tailwind.css",
  "src/styles/index.css",
  "src/styles.scss",
  "src/styles/tokens.css",
  "src/styles/mixins.css"
],
```

- [ ] **Step 5.2: Check if the `test` target has a similar `styles` array**

Run:
```bash
grep -n '"styles"' /Users/instashop/Projects/football-quizball/frontend/angular.json
```
If there's a second `"styles"` block under `architect.test.options`, make the identical change there so unit-test compilation matches production. If only one block, skip.

- [ ] **Step 5.3: Build verification**

Run:
```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 5.4: Smoke-test dev server visually**

Run (in a second terminal, or with `run_in_background`):
```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run start
```
Open `http://localhost:4200` and check:
- Home page backgrounds look dark (surfaces #131313/#1c1b1b, not pure black).
- Primary buttons still render (may look subtly different — accent blue unchanged).
- Click through to a Material-based view (settings menu / auth modal). Buttons and inputs should show the StepOver blue accent, not green.

If Material components appear visually broken (not re-skinned — actually unreadable or collapsed), **roll back Step 5.1** and raise a follow-up before continuing. Otherwise proceed.

- [ ] **Step 5.5: Commit**

```bash
cd /Users/instashop/Projects/football-quizball
git add frontend/angular.json
git commit -m "chore(build): load StepOver tokens/mixins after styles.scss to override mat.theme()"
```

---

## Task 6: Add `@app/*` path alias to tsconfig

**Files:**
- Modify: `frontend/tsconfig.json`

**Why:** the playbook uses `import { SoButtonComponent } from '@app/shared/ui'`. The alias must resolve before the barrel relocation is useful.

- [ ] **Step 6.1: Update compilerOptions**

In `frontend/tsconfig.json`, the current `compilerOptions` block starts at line 5. Replace the block:

FIND:
```json
  "compilerOptions": {
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "experimentalDecorators": true,
    "importHelpers": true,
    "target": "ES2022",
    "module": "preserve"
  },
```

REPLACE WITH:
```json
  "compilerOptions": {
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "experimentalDecorators": true,
    "importHelpers": true,
    "target": "ES2022",
    "module": "preserve",
    "baseUrl": "./src",
    "paths": {
      "@app/*": ["app/*"]
    }
  },
```

- [ ] **Step 6.2: Build verification**

Run:
```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build
```
Expected: build succeeds. (No consumer is using `@app/*` yet, so only the resolver is under test.)

- [ ] **Step 6.3: (no commit yet — batch with Task 7's relocation)**

---

## Task 7: Relocate `so-*` components into `shared/ui/`

**Files:**
- Move: 12 `so-*` folders from `frontend/src/app/shared/` to `frontend/src/app/shared/ui/`
- Move: `frontend/src/app/shared/index.ts` → `frontend/src/app/shared/ui/index.ts`

**Why:** match the playbook's `@app/shared/ui` import path.

- [ ] **Step 7.1: Create target directory**

```bash
mkdir -p /Users/instashop/Projects/football-quizball/frontend/src/app/shared/ui
```

- [ ] **Step 7.2: Move folders (preserves git history once committed)**

NOTE: the `so-*` folders are currently **untracked** (`??` in `git status`). `git mv` on an untracked path fails. Use a plain `mv` and then `git add` the new location. (History preservation is N/A here because these are new files.)

```bash
cd /Users/instashop/Projects/football-quizball/frontend/src/app/shared
mv so-answer-card     ui/
mv so-avatar          ui/
mv so-button          ui/
mv so-chip            ui/
mv so-icon-button     ui/
mv so-leaderboard-row ui/
mv so-mode-card       ui/
mv so-mode-row        ui/
mv so-progress-track  ui/
mv so-rank-badge      ui/
mv so-stat-card       ui/
mv so-top-bar         ui/
```

Verify:
```bash
ls ui/
```
Expected: 12 `so-*` directories.

- [ ] **Step 7.3: Move barrel**

```bash
cd /Users/instashop/Projects/football-quizball/frontend/src/app/shared
mv index.ts ui/index.ts
```

The barrel's internal paths (`./so-button/so-button`) stay correct because the barrel moved with the folders.

- [ ] **Step 7.4: Verify inter-component relative imports still resolve**

Inside `shared/ui/`, `so-mode-card.ts` imports `../so-chip/so-chip`, `so-mode-row.ts` imports `../so-chip/so-chip`, `so-leaderboard-row.ts` imports `../so-avatar/so-avatar`, `so-rank-badge.ts` imports `../so-avatar/so-avatar`. Since all 12 folders are now siblings under `ui/`, these relative paths are unchanged. Confirm:

```bash
grep -rEn "from ['\"]\.\./" /Users/instashop/Projects/football-quizball/frontend/src/app/shared/ui/
```
Expected: only relative imports between sibling `so-*` folders.

- [ ] **Step 7.5: Build verification**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 7.6: Commit (with Task 6's tsconfig change)**

```bash
cd /Users/instashop/Projects/football-quizball
git add frontend/tsconfig.json frontend/src/app/shared/ui
git commit -m "feat(ui): add @app/* alias and relocate so-* components to shared/ui/"
```

---

## Task 8: Split `so-button` + `so-icon-button` into 3 files

**Files:**
- Modify: `frontend/src/app/shared/ui/so-button/so-button.ts`
- Create: `frontend/src/app/shared/ui/so-button/so-button.html`, `frontend/src/app/shared/ui/so-button/so-button.css`
- Modify: `frontend/src/app/shared/ui/so-icon-button/so-icon-button.ts`
- Create: `frontend/src/app/shared/ui/so-icon-button/so-icon-button.html`, `frontend/src/app/shared/ui/so-icon-button/so-icon-button.css`

- [ ] **Step 8.1: Create `so-button.html`**

Write to `frontend/src/app/shared/ui/so-button/so-button.html`:

```html
<button
  type="button"
  class="so-btn inline-flex items-center justify-center gap-2 font-semibold uppercase tracking-[0.08em] rounded-lg whitespace-nowrap select-none transition-[transform,box-shadow] duration-150 ease-out"
  [class.opacity-60]="disabled()"
  [class.cursor-not-allowed]="disabled()"
  [class.w-full]="fullWidth()"
  [ngClass]="[sizeClass(), variantClass()]"
  [disabled]="disabled()"
  (click)="pressed.emit()">
  <ng-content select="[leading]" />
  <ng-content />
  <ng-content select="[trailing]" />
</button>
```

- [ ] **Step 8.2: Create `so-button.css`**

Write to `frontend/src/app/shared/ui/so-button/so-button.css`:

```css
:host { display: inline-block; }
:host([full-width]) { display: block; }
.so-btn:active:not(:disabled) { transform: scale(0.98); }
.variant-primary   { background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dim) 100%); color: var(--color-accent-foreground); box-shadow: 0 0 15px rgba(0,122,255,0.30); }
.variant-secondary { background: var(--glass-bg); color: var(--color-foreground); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }
.variant-ghost     { background: transparent; color: var(--color-foreground); box-shadow: inset 0 0 0 1px rgba(107,122,141,0.3); }
.variant-tertiary  { background: transparent; color: var(--color-foreground); border-radius: 0; border-bottom: 1px solid rgba(107,122,141,0.4); padding: 10px 4px; text-transform: none; letter-spacing: 0; font-weight: 500; }
.variant-danger    { background: #93000a; color: #ffb4ab; }
.size-sm { height: 36px; padding: 0 14px; font-size: 12px; }
.size-md { height: 48px; padding: 0 22px; font-size: 13px; }
.size-lg { height: 56px; padding: 0 24px; font-size: 14px; }
```

- [ ] **Step 8.3: Rewrite `so-button.ts` to use `templateUrl`/`styleUrl`**

Replace entire file `frontend/src/app/shared/ui/so-button/so-button.ts` with:

```ts
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoButtonVariant = 'primary' | 'secondary' | 'ghost' | 'tertiary' | 'danger';
export type SoButtonSize    = 'sm' | 'md' | 'lg';

@Component({
  selector: 'so-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-button.html',
  styleUrl: './so-button.css',
})
export class SoButtonComponent {
  variant   = input<SoButtonVariant>('primary');
  size      = input<SoButtonSize>('md');
  disabled  = input<boolean>(false);
  fullWidth = input<boolean>(false);
  pressed   = output<void>();

  variantClass() { return `variant-${this.variant()}`; }
  sizeClass()    { return `size-${this.size()}`; }
}
```

- [ ] **Step 8.4: Create `so-icon-button.html`**

Write to `frontend/src/app/shared/ui/so-icon-button/so-icon-button.html`:

```html
<button type="button" class="so-iconbtn" [class.glass]="glass()" (click)="pressed.emit()">
  <ng-content />
</button>
```

- [ ] **Step 8.5: Create `so-icon-button.css`**

Write to `frontend/src/app/shared/ui/so-icon-button/so-icon-button.css`:

```css
:host { display: inline-block; }
.so-iconbtn {
  width: 36px; height: 36px; border-radius: 10px; border: 0; cursor: pointer;
  display: grid; place-items: center; color: #fff; background: transparent;
}
.so-iconbtn.glass {
  background: rgba(58,57,57,0.6);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
}
```

- [ ] **Step 8.6: Rewrite `so-icon-button.ts`**

Replace entire file `frontend/src/app/shared/ui/so-icon-button/so-icon-button.ts` with:

```ts
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

@Component({
  selector: 'so-icon-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './so-icon-button.html',
  styleUrl: './so-icon-button.css',
})
export class SoIconButtonComponent {
  glass   = input<boolean>(false);
  pressed = output<void>();
}
```

- [ ] **Step 8.7: Build**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 8.8: Commit**

```bash
cd /Users/instashop/Projects/football-quizball
git add frontend/src/app/shared/ui/so-button frontend/src/app/shared/ui/so-icon-button
git commit -m "refactor(ui): split so-button and so-icon-button into .ts/.html/.css"
```

---

## Task 9: Split `so-chip` + `so-rank-badge` into 3 files

- [ ] **Step 9.1: Create `so-chip.html`**

Write to `frontend/src/app/shared/ui/so-chip/so-chip.html`:

```html
<span class="so-chip inline-flex items-center gap-1 rounded-full font-medium font-numeric tracking-[0.04em]"
      [ngClass]="[sizeClass(), variantClass()]">
  <ng-content />
</span>
```

- [ ] **Step 9.2: Create `so-chip.css`**

Write to `frontend/src/app/shared/ui/so-chip/so-chip.css`:

```css
.size-xs { padding: 2px 8px;  font-size: 10px; }
.size-sm { padding: 3px 10px; font-size: 11px; }
.size-md { padding: 5px 12px; font-size: 12px; }

.variant-default { background: var(--color-surface-highest); color: var(--color-foreground); }
.variant-accent  { background: rgba(0,122,255,0.15); color: var(--color-accent); }
.variant-success { background: rgba(34,197,94,0.12); color: var(--color-win); box-shadow: inset 0 0 0 1px rgba(34,197,94,0.25); }
.variant-error   { background: rgba(147,0,10,0.25); color: var(--color-destructive); box-shadow: inset 0 0 0 1px rgba(255,180,171,0.15); }
.variant-warn    { background: rgba(255,149,0,0.14); color: var(--color-warning); }
.variant-gold    { background: rgba(230,168,0,0.12); color: var(--color-pro); box-shadow: inset 0 0 0 1px rgba(230,168,0,0.2); }
.variant-glass   { background: rgba(255,255,255,0.1); color: #fff; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
```

- [ ] **Step 9.3: Rewrite `so-chip.ts`**

Replace entire file `frontend/src/app/shared/ui/so-chip/so-chip.ts`:

```ts
import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoChipVariant = 'default' | 'accent' | 'success' | 'error' | 'warn' | 'gold' | 'glass';
export type SoChipSize    = 'xs' | 'sm' | 'md';

@Component({
  selector: 'so-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-chip.html',
  styleUrl: './so-chip.css',
})
export class SoChipComponent {
  variant = input<SoChipVariant>('default');
  size    = input<SoChipSize>('md');
  variantClass() { return `variant-${this.variant()}`; }
  sizeClass()    { return `size-${this.size()}`; }
}
```

- [ ] **Step 9.4: Create `so-rank-badge.html`**

Write to `frontend/src/app/shared/ui/so-rank-badge/so-rank-badge.html`:

```html
<div class="so-badge">
  <div class="so-stripe" [style.background]="tierColor()"></div>
  <span class="so-tier font-headline">{{ tier() }}</span>
  @if (elo()) { <span class="so-elo font-numeric">{{ elo() }}</span> }
</div>
```

- [ ] **Step 9.5: Create `so-rank-badge.css`**

Write to `frontend/src/app/shared/ui/so-rank-badge/so-rank-badge.css`:

```css
:host { display: inline-block; }
.so-badge {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 4px 10px 4px 8px; background: var(--color-surface-low);
  border-radius: 999px;
}
.so-stripe { width: 3px; height: 14px; border-radius: 2px; }
.so-tier   { font-weight: 600; font-size: 13px; color: #fff; }
.so-elo    { font-size: 11px; color: var(--color-muted-foreground); letter-spacing: 0.04em; }
```

- [ ] **Step 9.6: Rewrite `so-rank-badge.ts`**

Replace entire file `frontend/src/app/shared/ui/so-rank-badge/so-rank-badge.ts`:

```ts
import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoTier } from '../so-avatar/so-avatar';

@Component({
  selector: 'so-rank-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-rank-badge.html',
  styleUrl: './so-rank-badge.css',
})
export class SoRankBadgeComponent {
  tier = input.required<SoTier>();
  elo  = input<string | number>();
  tierColor() {
    const map: Record<SoTier, string> = {
      Legend:     '#007AFF', Elite: '#C0C0C0',
      Challenger: '#CD7F32', Contender: '#4A90D9', Grassroots: '#6b7a8d',
    };
    return map[this.tier()];
  }
}
```

- [ ] **Step 9.7: Build**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 9.8: Commit**

```bash
cd /Users/instashop/Projects/football-quizball
git add frontend/src/app/shared/ui/so-chip frontend/src/app/shared/ui/so-rank-badge
git commit -m "refactor(ui): split so-chip and so-rank-badge into .ts/.html/.css"
```

---

## Task 10: Split `so-mode-card`, `so-mode-row`, `so-answer-card`, `so-stat-card`

- [ ] **Step 10.1: Create `so-mode-card.html`**

Write to `frontend/src/app/shared/ui/so-mode-card/so-mode-card.html`:

```html
<button type="button" class="so-card so-overlay-vertical w-full text-left"
        [style.background-image]="image() ? 'url(' + image() + ')' : null"
        [style.height.px]="height()"
        [style.border-left-color]="accent()"
        (click)="pressed.emit()">
  <div class="so-content">
    <div class="so-top">
      @if (badge()) { <so-chip variant="accent" size="sm">{{ badge() }}</so-chip> }
    </div>
    <div>
      <div class="so-title font-headline">{{ title() }}</div>
      @if (subtitle()) { <div class="so-sub">{{ subtitle() }}</div> }
    </div>
  </div>
</button>
```

- [ ] **Step 10.2: Create `so-mode-card.css`**

Write to `frontend/src/app/shared/ui/so-mode-card/so-mode-card.css`:

```css
:host { display: block; }
.so-card {
  position: relative; overflow: hidden; border: 0; padding: 0; cursor: pointer;
  border-radius: 16px;
  background-size: cover; background-position: center;
  background-color: var(--color-surface-low);
  border-left: 3px solid transparent;
}
.so-card::after { z-index: 0; }
.so-content {
  position: relative; z-index: 1;
  padding: 20px; height: 100%;
  display: flex; flex-direction: column; justify-content: space-between;
  color: #fff;
}
.so-top { display: flex; justify-content: space-between; align-items: flex-start; }
.so-title { font-weight: 700; font-size: 24px; letter-spacing: -0.02em; line-height: 1.1; }
.so-sub   { font-size: 13px; color: rgba(255,255,255,0.75); margin-top: 4px; }
```

- [ ] **Step 10.3: Rewrite `so-mode-card.ts`**

Replace entire file `frontend/src/app/shared/ui/so-mode-card/so-mode-card.ts`:

```ts
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoChipComponent } from '../so-chip/so-chip';

@Component({
  selector: 'so-mode-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SoChipComponent],
  templateUrl: './so-mode-card.html',
  styleUrl: './so-mode-card.css',
})
export class SoModeCardComponent {
  title    = input.required<string>();
  subtitle = input<string>();
  badge    = input<string>();
  image    = input<string>();
  accent   = input<string>('var(--color-accent)');
  height   = input<number>(180);
  pressed  = output<void>();
}
```

- [ ] **Step 10.4: Create `so-mode-row.html`**

Write to `frontend/src/app/shared/ui/so-mode-row/so-mode-row.html`:

```html
<button type="button" class="so-row so-overlay-horizontal"
        [style.background-image]="image() ? 'url(' + image() + ')' : null"
        [style.border-left-color]="accent()"
        (click)="pressed.emit()">
  <div class="so-icon" [style.background]="iconBg() || 'rgba(0,122,255,0.15)'"
       [style.color]="iconColor() || 'var(--color-accent)'">
    <span class="material-symbols-outlined" *ngIf="materialIcon()">{{ materialIcon() }}</span>
    <ng-content select="[icon]" />
  </div>
  <div class="so-text">
    <div class="so-title">
      <span class="font-headline">{{ title() }}</span>
      @if (badge()) { <so-chip variant="accent" size="xs">{{ badge() }}</so-chip> }
    </div>
    @if (subtitle()) { <div class="so-sub">{{ subtitle() }}</div> }
  </div>
  <div class="so-chev">›</div>
</button>
```

- [ ] **Step 10.5: Create `so-mode-row.css`**

Write to `frontend/src/app/shared/ui/so-mode-row/so-mode-row.css`:

```css
:host { display: block; }
.so-row {
  position: relative; overflow: hidden;
  width: 100%; min-height: 72px;
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px 14px 18px;
  border: 0; border-left: 3px solid var(--color-accent);
  border-radius: 12px; cursor: pointer; text-align: left;
  background-color: var(--color-surface-low);
  background-size: cover; background-position: center;
  color: #fff;
}
.so-row::after { z-index: 0; }
.so-icon, .so-text, .so-chev { position: relative; z-index: 1; }
.so-icon { width: 40px; height: 40px; border-radius: 10px;
           display: grid; place-items: center; font-size: 20px; flex-shrink: 0; }
.so-text { flex: 1; min-width: 0; }
.so-title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 16px; letter-spacing: -0.01em; }
.so-sub   { font-size: 12px; color: rgba(255,255,255,0.72); margin-top: 2px; }
.so-chev  { font-family: 'Lexend'; font-size: 18px; color: rgba(255,255,255,0.5); }
```

- [ ] **Step 10.6: Rewrite `so-mode-row.ts`**

Replace entire file `frontend/src/app/shared/ui/so-mode-row/so-mode-row.ts`:

```ts
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoChipComponent } from '../so-chip/so-chip';

@Component({
  selector: 'so-mode-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SoChipComponent],
  templateUrl: './so-mode-row.html',
  styleUrl: './so-mode-row.css',
})
export class SoModeRowComponent {
  title        = input.required<string>();
  subtitle     = input<string>();
  image        = input<string>();
  badge        = input<string>();
  accent       = input<string>('var(--color-accent)');
  materialIcon = input<string>();
  iconBg       = input<string>();
  iconColor    = input<string>();
  pressed      = output<void>();
}
```

- [ ] **Step 10.7: Create `so-answer-card.html`**

Write to `frontend/src/app/shared/ui/so-answer-card/so-answer-card.html`:

```html
<button type="button" class="so-answer" [ngClass]="'state-' + state()" (click)="pressed.emit()">
  <span class="so-letter">{{ letter() }}</span>
  <span class="so-label"><ng-content /></span>
  @if (state() === 'correct') { <span class="so-indicator">✓</span> }
  @else if (state() === 'wrong') { <span class="so-indicator wrong">✕</span> }
</button>
```

- [ ] **Step 10.8: Create `so-answer-card.css`**

Write to `frontend/src/app/shared/ui/so-answer-card/so-answer-card.css`:

```css
:host { display: block; }
.so-answer {
  width: 100%; min-height: 52px; padding: 14px 16px; border: 0; border-radius: 12px;
  display: flex; align-items: center; gap: 14px; cursor: pointer; text-align: left;
  font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 500;
  transition: all 180ms ease-out;
}
.so-letter {
  width: 28px; height: 28px; border-radius: 6px;
  display: grid; place-items: center;
  font-family: 'Lexend', sans-serif; font-weight: 600; font-size: 12px; flex-shrink: 0;
}
.so-label     { flex: 1; }
.so-indicator { width: 24px; height: 24px; border-radius: 999px; display: grid; place-items: center; font-size: 13px; font-weight: 700; background: rgba(255,255,255,0.25); }
.so-indicator.wrong { background: rgba(255,180,171,0.15); }

.state-default  { background: var(--color-surface-high); color: var(--color-foreground); }
.state-default  .so-letter { background: var(--color-surface-highest); color: var(--color-muted-foreground); }
.state-selected { background: var(--color-surface-highest); color: var(--color-foreground); box-shadow: inset 0 0 0 2px rgba(0,122,255,0.5); }
.state-selected .so-letter { background: rgba(0,122,255,0.15); color: var(--color-accent); }
.state-correct  { background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dim) 100%); color: #fff; box-shadow: 0 0 20px rgba(0,122,255,0.35); }
.state-correct  .so-letter { background: rgba(255,255,255,0.18); color: #fff; }
.state-wrong    { background: #93000a; color: var(--color-destructive); box-shadow: inset 0 0 0 1px rgba(255,180,171,0.2); animation: wrong-shake-tight 400ms cubic-bezier(0.25, 1, 0.5, 1); }
.state-wrong    .so-letter { background: rgba(255,180,171,0.1); color: var(--color-destructive); }
.state-dim      { background: var(--color-surface-high); color: var(--color-foreground); opacity: 0.4; }
.state-dim      .so-letter { background: var(--color-surface-highest); color: var(--color-muted-foreground); }
```

- [ ] **Step 10.9: Rewrite `so-answer-card.ts`**

Replace entire file `frontend/src/app/shared/ui/so-answer-card/so-answer-card.ts`:

```ts
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoAnswerState = 'default' | 'selected' | 'correct' | 'wrong' | 'dim';

@Component({
  selector: 'so-answer-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-answer-card.html',
  styleUrl: './so-answer-card.css',
})
export class SoAnswerCardComponent {
  letter  = input.required<string>();
  state   = input<SoAnswerState>('default');
  pressed = output<void>();
}
```

- [ ] **Step 10.10: Create `so-stat-card.html`**

Write to `frontend/src/app/shared/ui/so-stat-card/so-stat-card.html`:

```html
<div class="so-stat">
  <div class="so-label">{{ label() }}</div>
  <div class="so-main">
    <span class="so-value font-headline" [style.color]="color() || '#fff'">{{ value() }}</span>
    @if (unit()) { <span class="so-unit">{{ unit() }}</span> }
  </div>
  @if (delta()) {
    <div class="so-delta" [style.color]="deltaColor()">{{ delta() }}</div>
  }
</div>
```

- [ ] **Step 10.11: Create `so-stat-card.css`**

Write to `frontend/src/app/shared/ui/so-stat-card/so-stat-card.css`:

```css
:host { display: block; }
.so-stat {
  background: var(--color-surface-low); border-radius: 12px; padding: 14px;
  display: flex; flex-direction: column; gap: 4px;
}
.so-label { font-family: 'Lexend'; font-size: 10px; text-transform: uppercase;
            letter-spacing: 0.14em; color: var(--color-muted-foreground); }
.so-main  { display: flex; align-items: baseline; gap: 4px; }
.so-value { font-weight: 700; font-size: 24px; letter-spacing: -0.01em; }
.so-unit  { font-family: 'Lexend'; font-size: 11px; color: var(--color-muted-foreground); }
.so-delta { font-family: 'Lexend'; font-size: 11px; }
```

- [ ] **Step 10.12: Rewrite `so-stat-card.ts`**

Replace entire file `frontend/src/app/shared/ui/so-stat-card/so-stat-card.ts`:

```ts
import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'so-stat-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-stat-card.html',
  styleUrl: './so-stat-card.css',
})
export class SoStatCardComponent {
  label = input.required<string>();
  value = input.required<string | number>();
  unit  = input<string>();
  delta = input<string>();
  color = input<string>();
  deltaColor() {
    const d = this.delta() ?? '';
    return d.startsWith('+') ? 'var(--color-win)' : d.startsWith('-') || d.startsWith('−') ? 'var(--color-destructive)' : 'var(--color-muted-foreground)';
  }
}
```

- [ ] **Step 10.13: Build**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 10.14: Commit**

```bash
cd /Users/instashop/Projects/football-quizball
git add frontend/src/app/shared/ui/so-mode-card frontend/src/app/shared/ui/so-mode-row frontend/src/app/shared/ui/so-answer-card frontend/src/app/shared/ui/so-stat-card
git commit -m "refactor(ui): split so-mode-card, so-mode-row, so-answer-card, so-stat-card into .ts/.html/.css"
```

---

## Task 11: Split `so-avatar` + `so-progress-track`

- [ ] **Step 11.1: Create `so-avatar.html`**

Write to `frontend/src/app/shared/ui/so-avatar/so-avatar.html`:

```html
<div class="so-avatar" [style.width.px]="size()" [style.height.px]="size()"
     [style.font-size.px]="size() * 0.38"
     [style.background-image]="src() ? 'url(' + src() + ')' : null"
     [style.box-shadow]="ringShadow()">
  @if (!src()) { {{ initials() }} }
</div>
```

- [ ] **Step 11.2: Create `so-avatar.css`**

Write to `frontend/src/app/shared/ui/so-avatar/so-avatar.css`:

```css
:host { display: inline-block; flex-shrink: 0; }
.so-avatar {
  border-radius: 50%;
  background: var(--color-surface-highest); color: var(--color-foreground);
  display: grid; place-items: center;
  font-family: 'Space Grotesk', sans-serif; font-weight: 700;
  background-size: cover; background-position: center;
}
```

- [ ] **Step 11.3: Rewrite `so-avatar.ts`**

Replace entire file `frontend/src/app/shared/ui/so-avatar/so-avatar.ts`:

```ts
import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoTier = 'Legend' | 'Elite' | 'Challenger' | 'Contender' | 'Grassroots';

@Component({
  selector: 'so-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-avatar.html',
  styleUrl: './so-avatar.css',
})
export class SoAvatarComponent {
  size     = input<number>(40);
  src      = input<string>();
  initials = input<string>('');
  ring     = input<boolean>(false);
  tier     = input<SoTier | undefined>();

  ringShadow = computed(() => {
    if (!this.ring()) return null;
    const map: Record<SoTier, string> = {
      Legend:     '#007AFF',
      Elite:      '#C0C0C0',
      Challenger: '#CD7F32',
      Contender:  '#4A90D9',
      Grassroots: '#6b7a8d',
    };
    const c = (this.tier() && map[this.tier()!]) || '#007AFF';
    return `0 0 0 2px var(--color-bg), 0 0 0 4px ${c}`;
  });
}
```

- [ ] **Step 11.4: Create `so-progress-track.html`**

Write to `frontend/src/app/shared/ui/so-progress-track/so-progress-track.html`:

```html
<div class="track" [style.height.px]="height()">
  <div class="fill" [style.width.%]="value()"
       [style.background]="color()"
       [style.box-shadow]="glow() ? '0 0 8px ' + color() : null"></div>
</div>
```

- [ ] **Step 11.5: Create `so-progress-track.css`**

Write to `frontend/src/app/shared/ui/so-progress-track/so-progress-track.css`:

```css
:host { display: block; }
.track { background: var(--color-surface); border-radius: 999px; overflow: hidden; }
.fill  { height: 100%; border-radius: 999px; transition: width 300ms ease-out; }
```

- [ ] **Step 11.6: Rewrite `so-progress-track.ts`**

Replace entire file `frontend/src/app/shared/ui/so-progress-track/so-progress-track.ts`:

```ts
import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
  selector: 'so-progress-track',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './so-progress-track.html',
  styleUrl: './so-progress-track.css',
})
export class SoProgressTrackComponent {
  value  = input<number>(0);
  height = input<number>(4);
  glow   = input<boolean>(true);
  color  = input<string>('var(--color-accent)');
}
```

- [ ] **Step 11.7: Build**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 11.8: Commit**

```bash
cd /Users/instashop/Projects/football-quizball
git add frontend/src/app/shared/ui/so-avatar frontend/src/app/shared/ui/so-progress-track
git commit -m "refactor(ui): split so-avatar and so-progress-track into .ts/.html/.css"
```

---

## Task 12: Split `so-leaderboard-row` + `so-top-bar`

- [ ] **Step 12.1: Create `so-leaderboard-row.html`**

Write to `frontend/src/app/shared/ui/so-leaderboard-row/so-leaderboard-row.html`:

```html
<div class="so-lbrow" [class.me]="me()"
     [style.border-left-color]="me() ? 'transparent' : tierColor()">
  <div class="so-rank" [class.top]="rank() <= 3">{{ rankDisplay() }}</div>
  <so-avatar [size]="36" [initials]="avatarInitials()" />
  <div class="so-info">
    <div class="so-name">{{ name() }} @if (me()) { <span class="so-you">(YOU)</span> }</div>
    <div class="so-tier">{{ tier() }}</div>
  </div>
  <div class="so-right">
    <div class="so-elo font-headline">{{ elo() }}</div>
    @if (delta() != null) {
      <div class="so-delta" [style.color]="deltaColor()">{{ deltaStr() }}</div>
    }
  </div>
</div>
```

- [ ] **Step 12.2: Create `so-leaderboard-row.css`**

Write to `frontend/src/app/shared/ui/so-leaderboard-row/so-leaderboard-row.css`:

```css
:host { display: block; }
.so-lbrow {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px 10px 11px; border-radius: 12px;
  border-left: 3px solid transparent;
}
.so-lbrow.me {
  background: rgba(0,122,255,0.08);
  box-shadow: inset 0 0 0 1px rgba(0,122,255,0.3);
  padding-left: 14px; border-left: 0;
}
.so-rank       { width: 28px; text-align: center; font-weight: 600; font-size: 13px; color: var(--color-muted-foreground); font-family: 'Lexend'; }
.so-rank.top   { font-size: 18px; color: #fff; font-family: inherit; }
.so-info       { flex: 1; min-width: 0; }
.so-name       { font-weight: 600; font-size: 14px; color: #fff; }
.so-you        { color: var(--color-accent); margin-left: 6px; font-size: 11px; }
.so-tier       { font-size: 11px; color: var(--color-muted-foreground); }
.so-right      { text-align: right; }
.so-elo        { font-weight: 700; font-size: 15px; color: #fff; }
.so-delta      { font-family: 'Lexend'; font-size: 11px; }
```

- [ ] **Step 12.3: Rewrite `so-leaderboard-row.ts`**

Replace entire file `frontend/src/app/shared/ui/so-leaderboard-row/so-leaderboard-row.ts`:

```ts
import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoAvatarComponent, SoTier } from '../so-avatar/so-avatar';

@Component({
  selector: 'so-leaderboard-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SoAvatarComponent],
  templateUrl: './so-leaderboard-row.html',
  styleUrl: './so-leaderboard-row.css',
})
export class SoLeaderboardRowComponent {
  rank            = input.required<number>();
  name            = input.required<string>();
  tier            = input.required<SoTier>();
  elo             = input.required<number | string>();
  delta           = input<number>();
  avatarInitials  = input<string>('');
  me              = input<boolean>(false);

  rankDisplay() {
    const r = this.rank();
    return r <= 3 ? ['🥇','🥈','🥉'][r - 1] : r;
  }
  tierColor() {
    const map: Record<SoTier, string> = {
      Legend: '#007AFF', Elite: '#C0C0C0',
      Challenger: '#CD7F32', Contender: '#4A90D9', Grassroots: '#6b7a8d',
    };
    return map[this.tier()];
  }
  deltaStr()   { const d = this.delta() ?? 0; return (d > 0 ? '+' : '') + d; }
  deltaColor() {
    const d = this.delta() ?? 0;
    return d > 0 ? 'var(--color-win)' : d < 0 ? 'var(--color-destructive)' : 'var(--color-muted-foreground)';
  }
}
```

- [ ] **Step 12.4: Create `so-top-bar.html`**

Write to `frontend/src/app/shared/ui/so-top-bar/so-top-bar.html`:

```html
@if (large()) {
  <div class="so-bar so-bar--large">
    <div class="so-actions"><ng-content select="[leading]"/><span class="so-spacer"></span><ng-content select="[trailing]"/></div>
    <div class="so-title so-title--large font-headline">{{ title() }}</div>
    @if (subtitle()) { <div class="so-subtitle">{{ subtitle() }}</div> }
  </div>
} @else {
  <div class="so-bar">
    <div class="so-leading"><ng-content select="[leading]"/></div>
    <div class="so-title font-headline">{{ title() }}</div>
    <div class="so-trailing"><ng-content select="[trailing]"/></div>
  </div>
}
```

- [ ] **Step 12.5: Create `so-top-bar.css`**

Write to `frontend/src/app/shared/ui/so-top-bar/so-top-bar.css`:

```css
:host { display: block; }
.so-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px 14px; min-height: 48px; color: #fff; }
.so-leading, .so-trailing { display: flex; gap: 6px; min-width: 40px; }
.so-trailing { justify-content: flex-end; }
.so-bar .so-title { flex: 1; text-align: center; font-weight: 600; font-size: 17px; letter-spacing: -0.01em; }

.so-bar--large { flex-direction: column; align-items: stretch; padding: 12px 20px 18px; }
.so-actions { display: flex; justify-content: space-between; align-items: center; height: 36px; margin-bottom: 12px; }
.so-spacer { flex: 1; }
.so-title--large { font-weight: 700; font-size: 32px; letter-spacing: -0.02em; line-height: 1.05; text-align: left; }
.so-subtitle { font-size: 13px; color: var(--color-muted-foreground); margin-top: 4px; }
```

- [ ] **Step 12.6: Rewrite `so-top-bar.ts`**

Replace entire file `frontend/src/app/shared/ui/so-top-bar/so-top-bar.ts`:

```ts
import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'so-top-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-top-bar.html',
  styleUrl: './so-top-bar.css',
})
export class SoTopBarComponent {
  title    = input.required<string>();
  subtitle = input<string>();
  large    = input<boolean>(false);
}
```

- [ ] **Step 12.7: Build**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 12.8: Commit**

```bash
cd /Users/instashop/Projects/football-quizball
git add frontend/src/app/shared/ui/so-leaderboard-row frontend/src/app/shared/ui/so-top-bar
git commit -m "refactor(ui): split so-leaderboard-row and so-top-bar into .ts/.html/.css"
```

---

## Task 13: Create `/dev/ui-gallery` verification route

**Files:**
- Create: `frontend/src/app/features/dev/ui-gallery/ui-gallery.ts`
- Create: `frontend/src/app/features/dev/ui-gallery/ui-gallery.html`
- Create: `frontend/src/app/features/dev/ui-gallery/ui-gallery.css`
- Modify: `frontend/src/app/app.routes.ts`

**Why:** a single dev-only route to smoke-test every `so-*` component and every documented state before Phase 3 screen migration.

- [ ] **Step 13.1: Create `ui-gallery.css`**

Write to `frontend/src/app/features/dev/ui-gallery/ui-gallery.css`:

```css
:host { display: block; background: var(--color-bg); color: var(--color-foreground); min-height: 100vh; }
.ug-container { max-width: 960px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 40px; }
.ug-section   { display: flex; flex-direction: column; gap: 12px; }
.ug-section h2 { font-family: 'Space Grotesk', sans-serif; font-size: 22px; margin: 0; color: #fff; }
.ug-section h3 { font-family: 'Lexend', sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--color-muted-foreground); margin: 12px 0 0; }
.ug-row       { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.ug-grid-2    { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ug-stack     { display: flex; flex-direction: column; gap: 8px; }
.ug-note      { font-size: 12px; color: var(--color-muted-foreground); }
```

- [ ] **Step 13.2: Create `ui-gallery.html`**

Write to `frontend/src/app/features/dev/ui-gallery/ui-gallery.html`:

```html
<div class="ug-container">
  <h1 style="font-family: 'Space Grotesk'; font-size: 28px; margin: 0; color: #fff;">StepOver UI Gallery</h1>
  <p class="ug-note">Dev-only route. Every so-* component in every documented state.</p>

  <!-- so-button -->
  <section class="ug-section">
    <h2>so-button</h2>
    <h3>Variants (size md)</h3>
    <div class="ug-row">
      <so-button variant="primary">Primary</so-button>
      <so-button variant="secondary">Secondary</so-button>
      <so-button variant="ghost">Ghost</so-button>
      <so-button variant="tertiary">Tertiary</so-button>
      <so-button variant="danger">Danger</so-button>
    </div>
    <h3>Sizes (variant primary)</h3>
    <div class="ug-row">
      <so-button size="sm">Small</so-button>
      <so-button size="md">Medium</so-button>
      <so-button size="lg">Large</so-button>
    </div>
    <h3>States</h3>
    <div class="ug-row">
      <so-button [disabled]="true">Disabled</so-button>
      <so-button [fullWidth]="true">Full width</so-button>
    </div>
  </section>

  <!-- so-icon-button -->
  <section class="ug-section">
    <h2>so-icon-button</h2>
    <div class="ug-row">
      <so-icon-button><span class="material-symbols-outlined">search</span></so-icon-button>
      <so-icon-button [glass]="true"><span class="material-symbols-outlined">settings</span></so-icon-button>
    </div>
  </section>

  <!-- so-chip -->
  <section class="ug-section">
    <h2>so-chip</h2>
    <h3>Variants (size md)</h3>
    <div class="ug-row">
      <so-chip variant="default">default</so-chip>
      <so-chip variant="accent">accent</so-chip>
      <so-chip variant="success">success</so-chip>
      <so-chip variant="error">error</so-chip>
      <so-chip variant="warn">warn</so-chip>
      <so-chip variant="gold">gold</so-chip>
      <so-chip variant="glass">glass</so-chip>
    </div>
    <h3>Sizes</h3>
    <div class="ug-row">
      <so-chip size="xs" variant="accent">xs</so-chip>
      <so-chip size="sm" variant="accent">sm</so-chip>
      <so-chip size="md" variant="accent">md</so-chip>
    </div>
  </section>

  <!-- so-mode-card -->
  <section class="ug-section">
    <h2>so-mode-card</h2>
    <div class="ug-grid-2">
      <so-mode-card title="Solo Ranked" subtitle="Climb the ladder" badge="NEW" />
      <so-mode-card title="Battle Royale" subtitle="50-player tournament" />
    </div>
  </section>

  <!-- so-mode-row -->
  <section class="ug-section">
    <h2>so-mode-row</h2>
    <div class="ug-stack">
      <so-mode-row title="Daily Challenge" subtitle="3 questions, ranked" materialIcon="casino" />
      <so-mode-row title="Blitz" subtitle="60 seconds" badge="HOT" materialIcon="bolt" />
    </div>
  </section>

  <!-- so-answer-card -->
  <section class="ug-section">
    <h2>so-answer-card</h2>
    <div class="ug-stack">
      <so-answer-card letter="A" state="default">Default state option</so-answer-card>
      <so-answer-card letter="B" state="selected">Selected state option</so-answer-card>
      <so-answer-card letter="C" state="correct">Correct answer</so-answer-card>
      <so-answer-card letter="D" state="wrong">Wrong answer</so-answer-card>
      <so-answer-card letter="E" state="dim">Dimmed option</so-answer-card>
    </div>
  </section>

  <!-- so-progress-track -->
  <section class="ug-section">
    <h2>so-progress-track</h2>
    <h3>Values</h3>
    <so-progress-track [value]="0" />
    <so-progress-track [value]="50" />
    <so-progress-track [value]="100" />
    <h3>Heights</h3>
    <so-progress-track [value]="60" [height]="2" />
    <so-progress-track [value]="60" [height]="4" />
    <so-progress-track [value]="60" [height]="8" />
    <h3>Glow off + custom color</h3>
    <so-progress-track [value]="70" [glow]="false" color="var(--color-pro)" />
  </section>

  <!-- so-avatar -->
  <section class="ug-section">
    <h2>so-avatar</h2>
    <h3>Sizes</h3>
    <div class="ug-row">
      <so-avatar [size]="24" initials="SO" />
      <so-avatar [size]="36" initials="SO" />
      <so-avatar [size]="48" initials="SO" />
      <so-avatar [size]="72" initials="SO" />
    </div>
    <h3>Tier rings (size 48)</h3>
    <div class="ug-row">
      <so-avatar [size]="48" initials="L" [ring]="true" tier="Legend" />
      <so-avatar [size]="48" initials="E" [ring]="true" tier="Elite" />
      <so-avatar [size]="48" initials="C" [ring]="true" tier="Challenger" />
      <so-avatar [size]="48" initials="N" [ring]="true" tier="Contender" />
      <so-avatar [size]="48" initials="G" [ring]="true" tier="Grassroots" />
    </div>
  </section>

  <!-- so-rank-badge -->
  <section class="ug-section">
    <h2>so-rank-badge</h2>
    <div class="ug-row">
      <so-rank-badge tier="Legend" [elo]="2450" />
      <so-rank-badge tier="Elite" [elo]="2050" />
      <so-rank-badge tier="Challenger" [elo]="1750" />
      <so-rank-badge tier="Contender" [elo]="1150" />
      <so-rank-badge tier="Grassroots" [elo]="800" />
    </div>
    <h3>Without elo</h3>
    <div class="ug-row">
      <so-rank-badge tier="Legend" />
    </div>
  </section>

  <!-- so-leaderboard-row -->
  <section class="ug-section">
    <h2>so-leaderboard-row</h2>
    <div class="ug-stack">
      <so-leaderboard-row [rank]="1" name="Alex Stepover" tier="Legend" [elo]="2450" [delta]="12" avatarInitials="AS" />
      <so-leaderboard-row [rank]="2" name="Maria Pele" tier="Elite" [elo]="2100" [delta]="-4" avatarInitials="MP" />
      <so-leaderboard-row [rank]="3" name="Juan Messi" tier="Elite" [elo]="2050" [delta]="0" avatarInitials="JM" />
      <so-leaderboard-row [rank]="4" name="You" tier="Challenger" [elo]="1700" [delta]="24" avatarInitials="Y" [me]="true" />
      <so-leaderboard-row [rank]="12" name="Sam Fan" tier="Contender" [elo]="1200" avatarInitials="SF" />
    </div>
  </section>

  <!-- so-stat-card -->
  <section class="ug-section">
    <h2>so-stat-card</h2>
    <div class="ug-grid-2">
      <so-stat-card label="Games played" [value]="248" delta="+12" />
      <so-stat-card label="Accuracy" [value]="76" unit="%" delta="-2" />
      <so-stat-card label="Streak" [value]="5" unit="wins" />
      <so-stat-card label="ELO" [value]="1705" color="var(--color-accent)" delta="+45" />
    </div>
  </section>

  <!-- so-top-bar -->
  <section class="ug-section">
    <h2>so-top-bar</h2>
    <h3>Compact</h3>
    <so-top-bar title="Leaderboard">
      <so-icon-button leading><span class="material-symbols-outlined">arrow_back</span></so-icon-button>
      <so-icon-button trailing [glass]="true"><span class="material-symbols-outlined">filter_list</span></so-icon-button>
    </so-top-bar>
    <h3>Large</h3>
    <so-top-bar title="Your Profile" subtitle="Grassroots — 820 ELO" [large]="true">
      <so-icon-button leading><span class="material-symbols-outlined">arrow_back</span></so-icon-button>
      <so-icon-button trailing [glass]="true"><span class="material-symbols-outlined">settings</span></so-icon-button>
    </so-top-bar>
  </section>
</div>
```

- [ ] **Step 13.3: Create `ui-gallery.ts`**

Write to `frontend/src/app/features/dev/ui-gallery/ui-gallery.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  SoAnswerCardComponent,
  SoAvatarComponent,
  SoButtonComponent,
  SoChipComponent,
  SoIconButtonComponent,
  SoLeaderboardRowComponent,
  SoModeCardComponent,
  SoModeRowComponent,
  SoProgressTrackComponent,
  SoRankBadgeComponent,
  SoStatCardComponent,
  SoTopBarComponent,
} from '@app/shared/ui';

@Component({
  selector: 'app-ui-gallery',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SoAnswerCardComponent,
    SoAvatarComponent,
    SoButtonComponent,
    SoChipComponent,
    SoIconButtonComponent,
    SoLeaderboardRowComponent,
    SoModeCardComponent,
    SoModeRowComponent,
    SoProgressTrackComponent,
    SoRankBadgeComponent,
    SoStatCardComponent,
    SoTopBarComponent,
  ],
  templateUrl: './ui-gallery.html',
  styleUrl: './ui-gallery.css',
})
export class UiGalleryComponent {}
```

- [ ] **Step 13.4: Register the route**

In `frontend/src/app/app.routes.ts`, find this block:

```ts
  { path: 'admin-legacy', loadComponent: () => import('./features/admin/admin-legacy').then(m => m.AdminLegacyComponent) },
  { path: 'onboarding', loadComponent: () => import('./features/onboarding/onboarding').then(m => m.OnboardingComponent) },
```

Insert a new route immediately after `admin-legacy`, before `onboarding`:

```ts
  { path: 'dev/ui-gallery', loadComponent: () => import('./features/dev/ui-gallery/ui-gallery').then(m => m.UiGalleryComponent) },
```

Resulting block:

```ts
  { path: 'admin-legacy', loadComponent: () => import('./features/admin/admin-legacy').then(m => m.AdminLegacyComponent) },
  { path: 'dev/ui-gallery', loadComponent: () => import('./features/dev/ui-gallery/ui-gallery').then(m => m.UiGalleryComponent) },
  { path: 'onboarding', loadComponent: () => import('./features/onboarding/onboarding').then(m => m.OnboardingComponent) },
```

This sits inside `fullRoutes`, outside the shell `children` array — `/dev/ui-gallery` renders without the shell header/nav chrome. That's intentional for a dev aid.

- [ ] **Step 13.5: Build**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 13.6: Visual smoke test**

Run the dev server:
```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run start
```

In a browser, go to `http://localhost:4200/dev/ui-gallery`.

Verify:
- Page renders without a blank screen.
- Browser devtools console shows no errors (warnings OK).
- Every section has visible content (no missing component = no empty section).
- Scroll through all 12 sections; each component looks like its documented visual spec.

Stop the dev server (`Ctrl+C`) once verified.

- [ ] **Step 13.7: Commit**

```bash
cd /Users/instashop/Projects/football-quizball
git add frontend/src/app/features/dev frontend/src/app/app.routes.ts
git commit -m "feat(dev): add /dev/ui-gallery route for StepOver design system QA"
```

---

## Task 14: VERSION + CHANGELOG bump

**Files:**
- Modify: `VERSION`
- Modify: `CHANGELOG.md`

**Why:** project convention (per `feedback_bump_version_and_changelog`): every commit bumps VERSION and adds a CHANGELOG entry.

- [ ] **Step 14.1: Bump VERSION**

Current VERSION is `0.8.15.0`. Bump minor to `0.8.16.0` (feature-ish change: new dev route + foundation rewire).

Write to `/Users/instashop/Projects/football-quizball/VERSION`:

```
0.8.16.0
```

- [ ] **Step 14.2: Prepend CHANGELOG entry**

In `/Users/instashop/Projects/football-quizball/CHANGELOG.md`, insert this block immediately after the `## [0.8.15.0] - 2026-04-21` section header line (i.e., make a new section above the existing 0.8.15.0 one):

```markdown
## [0.8.16.0] - 2026-04-21

### Added — StepOver design system foundation (Phase 1 + 2)

Tokens, mixins, tailwind extensions, and 12 `so-*` primitive components landed behind a dev-only verification route — with **zero feature screens edited**. This is the foundation the screen-by-screen migration (Phase 3) will consume.

**Foundation.** `frontend/tailwind.config.js` merges the StepOver bundle additively: new `surface.*`, `tier.*`, `warning`, `pro`, `accent.dim` colors; `fontFamily.display` alias; radii, glow shadows, glass backdropBlur; `pulse-accent` animation. The orphan `tailwind.config.js` at repo root is removed. `frontend/src/styles/tokens.css` and `frontend/src/styles/mixins.css` now load via `angular.json` styles array **after** `styles.scss` — that ordering is what lets StepOver `--mat-sys-*` overrides beat the `mat.theme()` SCSS output and re-skin every existing Material component in place. Google-Fonts `@import url()` stripped from `tokens.css` (already delivered via `<link>` in `index.html`), and Space Grotesk weight 500 added to the existing font link.

**Component library.** 12 new standalone Angular 20 components under `frontend/src/app/shared/ui/`, each split into `.ts`/`.html`/`.css`: `so-button`, `so-chip`, `so-mode-card`, `so-mode-row`, `so-answer-card`, `so-progress-track`, `so-avatar`, `so-rank-badge`, `so-leaderboard-row`, `so-stat-card`, `so-top-bar`, `so-icon-button`. Barrel at `shared/ui/index.ts`. `@app/*` path alias added to `tsconfig.json` so consumers can write `import { SoButtonComponent } from '@app/shared/ui'`.

**Dev verification route.** `/dev/ui-gallery` (unlinked, not in nav) renders every component in every documented state. Used to validate the library before Phase 3 screen migration starts.

### Scope

Foundation only. No feature screen edited; existing `app-primary-btn`, `app-mode-card`, `app-page-header`, per-feature answer buttons all unchanged. Phase 3 screen migration per `docs/superpowers/specs/2026-04-21-design-system-phase-1-2.md` Tier 1 deferred to its own PR.

### Tests

No new unit tests (components are pure presentation; build + `/dev/ui-gallery` is the verification gate). `npm run build` passes. `npm run test` unchanged.
```

- [ ] **Step 14.3: Commit**

```bash
cd /Users/instashop/Projects/football-quizball
git add VERSION CHANGELOG.md
git commit -m "chore(release): bump to 0.8.16.0 for design system Phase 1+2"
```

---

## Task 15: Final verification pass

- [ ] **Step 15.1: Full build**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 15.2: Unit tests still green**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npm run test -- --watch=false --browsers=ChromeHeadless 2>&1 | tail -40
```
Expected: pre-existing tests pass. If the test runner requires interactive setup and errors out, note it in the PR and skip. (This plan adds no tests.)

- [ ] **Step 15.3: Visual QA sweep**

Run `npm run start` and walk these URLs:
- `/` (home) — dark surfaces, StepOver blue accent
- `/leaderboard` — unchanged layout, tokens re-skinned
- `/profile` — unchanged layout
- `/solo` — unchanged layout
- `/login` — auth card, unchanged layout
- `/dev/ui-gallery` — every `so-*` component renders

Take one before/after screenshot of `/` if possible for the PR body.

- [ ] **Step 15.4: Confirm only allowlisted files were modified**

```bash
cd /Users/instashop/Projects/football-quizball
git diff --name-only main...HEAD
```

Expected set (order may differ):
```
CHANGELOG.md
VERSION
docs/superpowers/specs/2026-04-21-design-system-phase-1-2.md
docs/superpowers/plans/2026-04-21-design-system-phase-1-2.md
frontend/angular.json
frontend/src/app/app.routes.ts
frontend/src/app/features/dev/ui-gallery/ui-gallery.css
frontend/src/app/features/dev/ui-gallery/ui-gallery.html
frontend/src/app/features/dev/ui-gallery/ui-gallery.ts
frontend/src/app/shared/ui/index.ts
frontend/src/app/shared/ui/so-answer-card/so-answer-card.css
frontend/src/app/shared/ui/so-answer-card/so-answer-card.html
frontend/src/app/shared/ui/so-answer-card/so-answer-card.ts
frontend/src/app/shared/ui/so-avatar/so-avatar.css
frontend/src/app/shared/ui/so-avatar/so-avatar.html
frontend/src/app/shared/ui/so-avatar/so-avatar.ts
frontend/src/app/shared/ui/so-button/so-button.css
frontend/src/app/shared/ui/so-button/so-button.html
frontend/src/app/shared/ui/so-button/so-button.ts
frontend/src/app/shared/ui/so-chip/so-chip.css
frontend/src/app/shared/ui/so-chip/so-chip.html
frontend/src/app/shared/ui/so-chip/so-chip.ts
frontend/src/app/shared/ui/so-icon-button/so-icon-button.css
frontend/src/app/shared/ui/so-icon-button/so-icon-button.html
frontend/src/app/shared/ui/so-icon-button/so-icon-button.ts
frontend/src/app/shared/ui/so-leaderboard-row/so-leaderboard-row.css
frontend/src/app/shared/ui/so-leaderboard-row/so-leaderboard-row.html
frontend/src/app/shared/ui/so-leaderboard-row/so-leaderboard-row.ts
frontend/src/app/shared/ui/so-mode-card/so-mode-card.css
frontend/src/app/shared/ui/so-mode-card/so-mode-card.html
frontend/src/app/shared/ui/so-mode-card/so-mode-card.ts
frontend/src/app/shared/ui/so-mode-row/so-mode-row.css
frontend/src/app/shared/ui/so-mode-row/so-mode-row.html
frontend/src/app/shared/ui/so-mode-row/so-mode-row.ts
frontend/src/app/shared/ui/so-progress-track/so-progress-track.css
frontend/src/app/shared/ui/so-progress-track/so-progress-track.html
frontend/src/app/shared/ui/so-progress-track/so-progress-track.ts
frontend/src/app/shared/ui/so-rank-badge/so-rank-badge.css
frontend/src/app/shared/ui/so-rank-badge/so-rank-badge.html
frontend/src/app/shared/ui/so-rank-badge/so-rank-badge.ts
frontend/src/app/shared/ui/so-stat-card/so-stat-card.css
frontend/src/app/shared/ui/so-stat-card/so-stat-card.html
frontend/src/app/shared/ui/so-stat-card/so-stat-card.ts
frontend/src/app/shared/ui/so-top-bar/so-top-bar.css
frontend/src/app/shared/ui/so-top-bar/so-top-bar.html
frontend/src/app/shared/ui/so-top-bar/so-top-bar.ts
frontend/src/index.html
frontend/src/styles/mixins.css
frontend/src/styles/tokens.css
frontend/tailwind.config.js
frontend/tsconfig.json
tailwind.config.js  (this will show as DELETED)
```

No feature screen file (`frontend/src/app/features/**` other than `dev/ui-gallery`) should appear. If any do, stop and investigate.

- [ ] **Step 15.5: Hand back to user**

At this point the branch `design-system/phase-1-2` is ready for `/review` and `/ship`. The user can decide whether to PR this independently or bundle with Phase 3.

---

## Notes on deferred items (not in this plan)

- **Legacy `styles/abstracts/_tokens.css` cleanup** — intentionally left untouched. New tokens override, old tokens stay. Cleanup deferred to Phase 3.
- **Environment gate on `/dev/ui-gallery`** — unlinked hidden URL on production is acceptable for this phase. If product wants hard exclusion before launch, add an `environment.production` check at the route level in a follow-up.
- **Material Symbols font weights** — existing `index.html` link limits to a specific glyph set (`casino,groups_3,key,military_tech,shield,swords`); `so-top-bar` and gallery examples use `arrow_back`, `settings`, `filter_list`, `search`, `bolt`. Verify these render in Step 13.6; if they show as text instead of glyphs, expand the `icon_names` query in `index.html`.
