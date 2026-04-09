# ELO Legend Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen overlay modal to the leaderboard page showing all 7 ELO ranking tiers, auto-shown on first visit and re-openable via an info button in the header.

**Architecture:** All changes are contained within the existing `LeaderboardComponent` — no new components, services, or modules. A `showLegend` signal controls overlay visibility. `localStorage` tracks first-visit state. Static tier data array drives the template.

**Tech Stack:** Angular 20 (standalone components, signals, `@if` control flow), CSS animations, localStorage

---

### Task 1: Add legend state and tier data to the component

**Files:**
- Modify: `frontend/src/app/features/leaderboard/leaderboard.ts`

- [ ] **Step 1: Add the `showLegend` signal and static tier data**

Add the following to `leaderboard.ts`. The `LEGEND_TIERS` array is defined at module level, and the `showLegend` signal + methods are added to the class:

```typescript
// Add at top of file, after imports, before @Component:
interface LegendTier {
  readonly label: string;
  readonly range: string;
  readonly color: string;
  readonly gradientFrom: string;
  readonly icon: string;
}

const LEGEND_TIERS: readonly LegendTier[] = [
  { label: 'Challenger', range: '2400+',       color: '#e8ff7a', gradientFrom: '#c4d94a', icon: '👑' },
  { label: 'Diamond',    range: '2000 – 2399', color: '#a855f7', gradientFrom: '#7c3aed', icon: '💎' },
  { label: 'Platinum',   range: '1650 – 1999', color: '#06b6d4', gradientFrom: '#0891b2', icon: '⚡' },
  { label: 'Gold',       range: '1300 – 1649', color: '#f59e0b', gradientFrom: '#d97706', icon: '🥇' },
  { label: 'Silver',     range: '1000 – 1299', color: '#94a3b8', gradientFrom: '#64748b', icon: '🥈' },
  { label: 'Bronze',     range: '750 – 999',   color: '#b45309', gradientFrom: '#92400e', icon: '🥉' },
  { label: 'Iron',       range: '500 – 749',   color: '#6b7280', gradientFrom: '#4b5563', icon: '🛡️' },
] as const;
```

Then inside the `LeaderboardComponent` class, after the `logoQuizSubTab` signal:

```typescript
  showLegend = signal(false);
  readonly legendTiers = LEGEND_TIERS;

  openLegend(): void {
    this.showLegend.set(true);
  }

  closeLegend(): void {
    this.showLegend.set(false);
    localStorage.setItem('leaderboard_legend_seen', 'true');
  }
```

- [ ] **Step 2: Add first-visit auto-show logic to `ngOnInit`**

Update the existing `ngOnInit` method to check localStorage and show the legend after data loads:

```typescript
  ngOnInit(): void {
    this.load().then(() => {
      if (!localStorage.getItem('leaderboard_legend_seen')) {
        this.showLegend.set(true);
      }
    });
  }
```

This replaces the current `ngOnInit` which just calls `this.load()`.

- [ ] **Step 3: Verify the build compiles**

Run: `cd frontend && npx ng build --configuration production 2>&1 | tail -5`
Expected: Build succeeds (template doesn't reference anything new yet, so no errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/leaderboard/leaderboard.ts
git commit -m "feat(leaderboard): add legend state, tier data, and first-visit logic"
```

---

### Task 2: Add info button and overlay template to the HTML

**Files:**
- Modify: `frontend/src/app/features/leaderboard/leaderboard.html`

- [ ] **Step 1: Add the info button to the header**

In `leaderboard.html`, the header currently looks like:

```html
<header class="leaderboard-header">
  <h1 class="leaderboard-title">{{ lang.t().lbTitle }}</h1>
  <button class="leaderboard-refresh-btn" (click)="load()" [disabled]="loading()">
    <mat-icon>refresh</mat-icon>
  </button>
</header>
```

Replace it with (adds a right-side container with the info button + refresh button):

```html
<header class="leaderboard-header">
  <h1 class="leaderboard-title">{{ lang.t().lbTitle }}</h1>
  <div class="leaderboard-header-actions">
    <button class="leaderboard-info-btn" (click)="openLegend()" aria-label="View ranking tiers">
      <mat-icon>info_outline</mat-icon>
    </button>
    <button class="leaderboard-refresh-btn" (click)="load()" [disabled]="loading()">
      <mat-icon>refresh</mat-icon>
    </button>
  </div>
</header>
```

- [ ] **Step 2: Add the legend overlay template at the end of the file**

Append the following at the very end of `leaderboard.html`, just before the closing `</div>` of `.leaderboard-page`:

```html
<!-- ELO Legend Overlay -->
@if (showLegend()) {
  <div class="legend-backdrop" (click)="closeLegend()" role="dialog" aria-modal="true" aria-label="Ranking Tiers">
    <div class="legend-card" (click)="$event.stopPropagation()">
      <!-- Close button -->
      <button class="legend-close" (click)="closeLegend()" aria-label="Close">
        <mat-icon>close</mat-icon>
      </button>

      <!-- Header -->
      <div class="legend-header">
        <span class="legend-trophy">🏆</span>
        <h2 class="legend-title">Ranking Tiers</h2>
        <p class="legend-subtitle">Climb the ladder by answering correctly</p>
      </div>

      <!-- Tier list -->
      <div class="legend-tiers">
        @for (tier of legendTiers; track tier.label; let i = $index) {
          <div
            class="legend-tier-row"
            [style.background]="'rgba(' + tier.color + ', 0.06)'"
            [style.border-color]="tier.color + '26'"
            [style.animation-delay]="(i * 50) + 'ms'"
          >
            <div
              class="legend-tier-icon"
              [style.background]="'linear-gradient(135deg, ' + tier.color + ', ' + tier.gradientFrom + ')'"
            >
              {{ tier.icon }}
            </div>
            <span class="legend-tier-name" [style.color]="tier.color">{{ tier.label }}</span>
            <span class="legend-tier-range">{{ tier.range }}</span>
          </div>
        }
      </div>

      <!-- Footer -->
      <div class="legend-footer">
        <p class="legend-note">All players start at <span class="legend-note-highlight">Silver (1000 ELO)</span></p>
        <button class="legend-cta" (click)="closeLegend()">Got it</button>
      </div>
    </div>
  </div>
}
```

**Note on inline styles:** The tier rows use `[style.*]` bindings because each row has a unique color from the data array. The `rgba()` trick won't work directly with hex — we need to handle this in CSS instead. See Task 2 Step 3 for the fix.

- [ ] **Step 3: Fix tier row coloring approach**

The inline `[style.background]` with `rgba()` won't parse hex colors. Instead, use CSS custom properties per row. Replace the tier row in the template with:

```html
        @for (tier of legendTiers; track tier.label; let i = $index) {
          <div
            class="legend-tier-row"
            [style.--tier-color]="tier.color"
            [style.--tier-gradient-from]="tier.gradientFrom"
            [style.animation-delay]="(i * 50) + 'ms'"
          >
            <div class="legend-tier-icon">
              {{ tier.icon }}
            </div>
            <span class="legend-tier-name">{{ tier.label }}</span>
            <span class="legend-tier-range">{{ tier.range }}</span>
          </div>
        }
```

The CSS (Task 3) will use `var(--tier-color)` with `color-mix()` for the background and border.

- [ ] **Step 4: Verify the build compiles**

Run: `cd frontend && npx ng build --configuration production 2>&1 | tail -5`
Expected: Build succeeds (CSS classes don't exist yet but that's fine — Angular doesn't error on missing CSS classes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/leaderboard/leaderboard.html
git commit -m "feat(leaderboard): add legend overlay template and info button"
```

---

### Task 3: Add all overlay CSS styles

**Files:**
- Modify: `frontend/src/app/features/leaderboard/leaderboard.css`

- [ ] **Step 1: Add info button styles**

Append after the `.leaderboard-refresh-btn mat-icon` block (around line 53), add:

```css
.leaderboard-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.leaderboard-info-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(0, 122, 255, 0.25);
  background: rgba(0, 122, 255, 0.12);
  color: var(--color-accent);
  cursor: pointer;
  transition: all 0.2s ease;
}

.leaderboard-info-btn:hover {
  background: rgba(0, 122, 255, 0.2);
}

.leaderboard-info-btn mat-icon {
  font-size: 1.25rem;
  width: 1.25rem;
  height: 1.25rem;
}
```

- [ ] **Step 2: Add legend overlay styles**

Append at the end of `leaderboard.css`, before the `@media (min-width: 768px)` block:

```css
/* ============================================
   ELO Legend Overlay
   ============================================ */
.legend-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
  animation: legend-fade-in 200ms ease-out;
}

@keyframes legend-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.legend-card {
  background: var(--color-surface, #1a1a1a);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.25rem;
  padding: 1.75rem 1.25rem 1.25rem;
  width: 92%;
  max-width: 22rem;
  position: relative;
  overflow: hidden;
  animation: legend-slide-up 400ms cubic-bezier(0.25, 1, 0.5, 1) both;
}

@keyframes legend-slide-up {
  from { transform: translateY(2rem); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Ambient glow */
.legend-card::before {
  content: '';
  position: absolute;
  top: -3rem;
  left: 50%;
  transform: translateX(-50%);
  width: 14rem;
  height: 6rem;
  border-radius: 50%;
  background: radial-gradient(
    ellipse,
    rgba(0, 122, 255, 0.15) 0%,
    rgba(139, 92, 246, 0.06) 50%,
    transparent 80%
  );
  pointer-events: none;
}

/* Close button */
.legend-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: #6b7a8d;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
  z-index: 1;
}

.legend-close:hover {
  background: rgba(255, 255, 255, 0.12);
}

.legend-close mat-icon {
  font-size: 1rem;
  width: 1rem;
  height: 1rem;
}

/* Header */
.legend-header {
  text-align: center;
  margin-bottom: 1.25rem;
  position: relative;
}

.legend-trophy {
  display: block;
  font-size: 1.75rem;
  margin-bottom: 0.25rem;
}

.legend-title {
  color: var(--color-fg, #e5e2e1);
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0 0 0.25rem;
  font-family: 'Space Grotesk', sans-serif;
}

.legend-subtitle {
  color: #6b7a8d;
  font-size: 0.8rem;
  margin: 0;
}

/* Tier list */
.legend-tiers {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.legend-tier-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--tier-color) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--tier-color) 15%, transparent);
  opacity: 0;
  animation: legend-tier-in 350ms ease-out forwards;
}

@keyframes legend-tier-in {
  from { transform: translateY(0.5rem); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.legend-tier-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--tier-color), var(--tier-gradient-from));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.legend-tier-name {
  color: var(--tier-color);
  font-size: 0.85rem;
  font-weight: 600;
  flex: 1;
}

.legend-tier-range {
  color: #6b7a8d;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}

/* Footer */
.legend-footer {
  text-align: center;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.legend-note {
  color: #6b7a8d;
  font-size: 0.7rem;
  margin: 0 0 0.75rem;
}

.legend-note-highlight {
  color: #94a3b8;
}

.legend-cta {
  width: 100%;
  padding: 0.6rem 2rem;
  border: none;
  border-radius: 9999px;
  background: linear-gradient(135deg, #007AFF, #5856D6);
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 122, 255, 0.3);
  transition: opacity 0.15s ease;
}

.legend-cta:hover {
  opacity: 0.9;
}
```

- [ ] **Step 3: Verify the build compiles and renders**

Run: `cd frontend && npx ng build --configuration production 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/leaderboard/leaderboard.css
git commit -m "feat(leaderboard): add ELO legend overlay styles and animations"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Clear localStorage and verify first-visit behavior**

Open the app, navigate to `/leaderboard`. The legend overlay should appear automatically. Dismiss it with "Got it". Refresh the page — it should NOT appear again.

- [ ] **Step 2: Verify re-open button**

Click the ℹ️ info button in the header. The legend overlay should appear again with full animations.

- [ ] **Step 3: Verify dismiss methods**

Test all three dismiss methods:
1. Click the ✕ close button
2. Click the "Got it" button
3. Click the backdrop (outside the card)

All three should close the overlay and set localStorage.

- [ ] **Step 4: Verify tier data accuracy**

Cross-reference the displayed tiers against `elo-tier.ts`:
- Challenger: 2400+ (#e8ff7a)
- Diamond: 2000–2399 (#a855f7)
- Platinum: 1650–1999 (#06b6d4)
- Gold: 1300–1649 (#f59e0b)
- Silver: 1000–1299 (#94a3b8)
- Bronze: 750–999 (#b45309)
- Iron: 500–749 (#6b7280)
