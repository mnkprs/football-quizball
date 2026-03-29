# Design System — Stepover

> Redesigned via `/design-consultation` · 2026-03-24 · Branch: main
> Source: Stitch project `11680002323878810353` — "Home Screen - Redesign"

---

## Product Context

- **What this is:** Competitive football trivia app — Battle Royale, Duel (ELO-rated), Blitz, Mayhem, Solo Ranked, Daily Challenge. AI-generated unlimited questions.
- **Platform:** Native mobile (iOS + Android via Capacitor), Angular frontend
- **Audience:** Obsessive football fans 18–35, competitive, WhatsApp-native
- **Design north star:** The product communicates that it was made by someone who takes football as seriously as the player does. Premium broadcast energy, not a casual quiz app.

---

## Aesthetic Direction

### "The Floodlit Arena"

This design system captures the electric tension of a midnight kickoff. It blends **Organic Brutalism** — bold, unapologetic typography and raw dark surfaces — with high-end **Glassmorphism** to simulate the depth of a stadium atmosphere.

The experience is defined by **intentional asymmetry and depth**. We avoid flat design by using high-contrast typography scales and overlapping elements that break the grid — ensuring the app feels like a premium broadcast production, not a generic utility.

**Decoration level:** Intentional — atmospheric background imagery (stadium, ball, crowd) with heavy overlays. Glass-surface navigation and selection containers. Neon accent glow on primary CTAs and progress indicators.

**Emotional reaction in first 3 seconds:** Depth → Anticipation. The dark surfaces and glass layers make you feel inside the stadium. Then the accent color fires like a floodlight coming on.

---

## Typography

| Role | Font | Weight(s) | Use |
|------|------|-----------|-----|
| Display / Headlines | **Space Grotesk** | 600, 700 | Mode names, score headlines, hero text, section titles |
| Body / UI | **Inter** | 400, 500, 600 | Question text, descriptions, labels, nav items, buttons |
| Labels / Data | **Lexend** | 400, 500 | Micro-data (Question 1/5, timer chips, stat eyebrows) |

**Why Space Grotesk:** Athletic geometry with wide apertures. Conveys modern sports confidence without cosplaying esports. Owns the "stadium screen" moment.

**Why Inter:** Neutral, legible at any size. Provides the technical counterpoint to Space Grotesk. `title-lg` (1.375rem) reads authoritative on quiz questions.

**Why Lexend:** Acts as a distinct "data layer" — separating game stats from immersive content. Visually distinct from both Space Grotesk and Inter.

**Font loading — Google Fonts:**
```
https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700&family=Lexend:wght@400;500;600&display=swap
```

### Typography Scale

| Token | Size | Font | Weight | Use |
|-------|------|------|--------|-----|
| `display-lg` | 3.5rem (56px) | Space Grotesk | 700 | Score summaries, result screens |
| `display-md` | 2.8rem (45px) | Space Grotesk | 700 | Hero headlines |
| `headline-lg` | 2rem (32px) | Space Grotesk | 600 | Game mode titles, section headers |
| `headline-md` | 1.75rem (28px) | Space Grotesk | 600 | Card titles |
| `title-lg` | 1.375rem (22px) | Inter | 600 | Quiz question text |
| `title-md` | 1rem (16px) | Inter | 500 | Sub-headings, descriptions |
| `body-lg` | 1rem (16px) | Inter | 400 | Body copy, answer options |
| `body-md` | 0.875rem (14px) | Inter | 400 | Secondary descriptions |
| `label-lg` | 0.875rem (14px) | Inter | 600 | Buttons (uppercase) |
| `label-md` | 0.75rem (12px) | Lexend | 500 | Game chips, timer, stat rows |
| `label-sm` | 0.6875rem (11px) | Lexend | 400 | Timestamps, metadata |

---

## Color System

**Philosophy:** One high-vis iOS blue accent on a deep pitch-at-night base. Surface hierarchy creates elevation through tonal steps — not borders or shadows.

### CSS Custom Properties

```css
:root {
  /* ---- Surfaces ---- */
  --color-bg:              #131313;  /* Base background — pitch at night */
  --color-surface-lowest:  #0e0e0e;  /* Deepest layer — atmospheric overlays */
  --color-surface-low:     #1c1b1b;  /* Large content areas */
  --color-surface:         #201f1f;  /* Default container */
  --color-surface-high:    #2a2a2a;  /* Interactive cards, answer tiles */
  --color-surface-highest: #353534;  /* Game chips, elevated elements */
  --color-surface-bright:  #3a3939;  /* Glassmorphism base (at 40% opacity) */

  /* ---- Text ---- */
  --color-fg:          #e5e2e1;  /* Primary text — warm off-white */
  --color-fg-variant:  #a8b3c4;  /* Secondary text — muted cool grey */
  --color-fg-muted:    #6b7a8d;  /* Outline, tertiary labels */
  --color-fg-dim:      #2a3544;  /* Ghost borders (at 15% opacity) */

  /* ---- Brand Accent ---- */
  --color-accent:      #007AFF;               /* iOS Blue. The ONE brand color. */
  --color-accent-dim:  #0066d6;               /* Gradient endpoint, hover */
  --color-accent-fg:   #ffffff;               /* Text on accent */
  --color-accent-bg:   rgba(0, 122, 255, 0.15); /* Accent tints, badges */
  --color-accent-glow: rgba(0, 122, 255, 0.3);  /* Neon accent glow shadow */

  /* ---- Semantic ---- */
  --color-error:       #ffb4ab;                /* Wrong answer, elimination */
  --color-error-bg:    #93000a;                /* Error container */
  --color-success:     #22C55E;                /* Correct answer */
  --color-success-bg:  rgba(34, 197, 94, 0.12);
  --color-warning:     #FF9500;                /* Time pressure (last 5s only) */

  /* ---- Pro / Premium ---- */
  --color-pro:         #e6a800;                /* Gold — Pro modes, premium accent */
  --color-pro-bg:      rgba(230, 168, 0, 0.08); /* Pro section background tint */

  /* ---- Border Radius ---- */
  --radius-sm:   0.25rem;  /* 4px  — chips, tags */
  --radius-md:   0.5rem;   /* 8px  — inputs */
  --radius-lg:   0.75rem;  /* 12px — primary cards, buttons */
  --radius-xl:   1.5rem;   /* 24px — modals, bottom sheets */
  --radius-full: 9999px;   /* pills, avatars */
}
```

### Swatches

| Token | Hex | Role |
|-------|-----|------|
| `--color-bg` | `#131313` | Base background |
| `--color-surface-lowest` | `#0e0e0e` | Atmospheric overlays |
| `--color-surface-high` | `#2a2a2a` | Interactive cards |
| `--color-fg` | `#e5e2e1` | Primary text |
| `--color-fg-variant` | `#a8b3c4` | Secondary text |
| `--color-accent` | `#007AFF` | The ONE brand accent |
| `--color-accent-dim` | `#0066d6` | Gradient endpoint |
| `--color-error` | `#ffb4ab` | Wrong / elimination |
| `--color-success` | `#22C55E` | Correct |

---

## Elevation & Depth

### The Layering Principle

Stack surfaces from `--color-surface-lowest` up to `--color-surface-highest`. A card on `--color-surface-low` uses `--color-surface-high` as its background — natural recess without any border.

### The No-Line Rule

**Never use 1px solid, 100% opaque borders.** All boundaries defined via background color shifts.

**Ghost Border Fallback:** If containment is strictly necessary, use `#2a3544` at **15% opacity only**:
```css
box-shadow: inset 0 0 0 1px rgba(42, 53, 68, 0.15);
```

### Glassmorphism

Navigation bars and selection containers float above background imagery:
```css
.glass-surface {
  background: rgba(58, 57, 57, 0.4);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
```

### Neon Glow

Primary CTAs, progress fills, and key interactive elements:
```css
.neon-glow    { box-shadow: 0 0 15px rgba(0, 122, 255, 0.3); }
.floodlit-glow { box-shadow: 0 0 60px -15px rgba(0, 122, 255, 0.3); }
```

### Atmospheric Overlays

All background images must have a gradient overlay:
```css
.bg-atmospheric::after {
  background: linear-gradient(
    to bottom,
    rgba(14, 14, 14, 0.7) 0%,
    rgba(19, 19, 19, 0.95) 100%
  );
}
```

### Ambient Shadows

For floating modals only — diffused, never hard:
```css
box-shadow: 0 4px 40px rgba(0, 0, 0, 0.06);
```

---

## Components

### Buttons

**Primary (accent gradient):**
```css
background: linear-gradient(135deg, #007AFF 0%, #0066d6 100%);
color: #ffffff;
font: 600 0.875rem 'Inter';
text-transform: uppercase;
border-radius: var(--radius-lg);
box-shadow: 0 0 15px rgba(0, 122, 255, 0.3);
```

**Secondary (glass):**
```css
background: rgba(53, 53, 52, 0.2);
backdrop-filter: blur(10px);
color: #ffffff;
border-radius: var(--radius-lg);
box-shadow: inset 0 0 0 1px rgba(42, 53, 68, 0.15);
```

**Tertiary:**
```css
background: transparent;
color: #ffffff;
border-bottom: 1px solid rgba(107, 122, 141, 0.3);
```

### Answer Cards (Multiple Choice)

Always 4 options (A / B / C / D). Cards are tappable; reveal fires on tap — no separate "Check" step.

**States:**

| State | Background | Border/Shadow | Text |
|-------|-----------|---------------|------|
| Default | `--color-surface-high` | none | `--color-fg` |
| Selected (pre-reveal) | `--color-surface-highest` | `inset 0 0 0 2px rgba(0,122,255,0.4)` | `--color-fg` |
| Correct (chosen) | `linear-gradient(135deg, #007AFF, #0066d6)` | `0 0 20px rgba(0,122,255,0.35)` | `--color-accent-fg` `#ffffff` |
| Wrong (chosen by user) | `--color-error-bg` `#93000a` | `inset 0 0 0 1px rgba(255,180,171,0.2)` | `--color-error` |
| Correct (revealed, user chose wrong) | `--color-success-bg` `rgba(34,197,94,0.12)` | `inset 0 0 0 1px rgba(34,197,94,0.25)` | `--color-success` |
| Wrong (unchosen, dimmed) | unchanged | none | `opacity: 0.45` |

**Answer label badge (A/B/C/D):**
```css
width: 28px; height: 28px;
border-radius: var(--radius-sm);
background: var(--color-surface-highest);
font: 600 0.7rem 'Lexend';
color: var(--color-fg-muted);

/* Selected state */
background: rgba(0, 122, 255, 0.15);
color: var(--color-accent);
```

**Indicator icon (right side — visible on selected/revealed states only):**
- Selected pre-reveal: filled dot `●`
- Correct: checkmark `✓` in circle, `rgba(0,122,255,0.25)` bg
- Wrong chosen: × in circle, `rgba(255,180,171,0.1)` bg
- Correct revealed: checkmark, `rgba(34,197,94,0.15)` bg

**Gutter:** `12px` between cards — **no dividers**

**Accessibility:** This is a touch-first mobile game. Full keyboard navigation is explicitly out of scope. Minimum requirements: answer cards must have `aria-label` (e.g., `Option A: Brazil`) so screen readers can announce selections. `role="button"` on tappable tiles. Touch targets are 44px+ by default from the padding spec — no additional changes needed.

### Game Mode Cards

```
background: var(--color-surface-high)
border-radius: var(--radius-lg)
border-left: 3px solid var(--color-accent)      ← standard modes
border-left: 3px solid var(--color-error)       ← elimination modes (Mayhem, BR)
padding: 20px
```

### Progress Bar

```css
.progress-track { background: var(--color-surface-lowest); height: 4px; }
.progress-fill  { background: var(--color-accent); box-shadow: 0 0 8px rgba(0,122,255,0.5); }
```

### Game Chips / Pills

```css
background: var(--color-surface-highest);
border-radius: var(--radius-full);
font: 500 0.75rem 'Lexend';
padding: 4px 12px;
```

### Free Text Questions

Questions where the user types an answer. Submit is explicit: user taps **Check Answer** button.

**Layout:**
```
┌──────────────────────────────┐
│  ← Back    Q 7/10    0:30   │  ← Glass nav
│  ██████████████░░░░░  (glow) │  ← Progress bar
├──────────────────────────────┤
│  [CATEGORY]                  │
│                              │
│  Question text here          │  ← Inter title-lg
│                              │
│  ┌──────────────────────┐    │
│  │  Type your answer... │    │  ← Free text input
│  └──────────────────────┘    │
│                              │
│  [CHECK ANSWER ▶]            │  ← Disabled until input non-empty
└──────────────────────────────┘
```

**Input field states:**

```css
/* Default */
background: var(--color-surface-low);
border-radius: var(--radius-md);
padding: 18px 16px;
box-shadow: inset 0 0 0 1px rgba(42, 53, 68, 0.15);
font: 400 1rem 'Inter';
color: var(--color-fg);

/* Focused (keyboard active) */
box-shadow: inset 0 0 0 2px var(--color-accent);

/* Correct reveal */
background: linear-gradient(135deg,
  rgba(0, 122, 255, 0.12) 0%,
  rgba(0, 102, 214, 0.08) 100%);
box-shadow:
  inset 0 0 0 2px var(--color-accent),
  0 0 12px rgba(0, 122, 255, 0.15);
color: var(--color-accent);
font-weight: 600;
/* + checkmark icon right-aligned, rgba(0,122,255,0.2) circle bg */

/* Wrong reveal */
background: rgba(147, 0, 10, 0.15);
box-shadow: inset 0 0 0 2px rgba(255, 180, 171, 0.4);
color: var(--color-error);
/* User's typed text preserved — they see exactly what they entered */
/* + × icon right-aligned, rgba(255,180,171,0.15) circle bg */
```

**Check Answer button states:**
```css
/* Disabled (empty input) */
background: var(--color-surface-highest);
color: var(--color-fg-muted);
box-shadow: none;
cursor: not-allowed;

/* Enabled (has text) — standard primary button */
background: linear-gradient(135deg, #007AFF 0%, #0066d6 100%);
color: var(--color-accent-fg);
box-shadow: 0 0 15px rgba(0, 122, 255, 0.3);
```

**Button layout:** Stacked — input full-width above, "Check Answer" button full-width below. Apply to ALL free-text templates (default, logo, playerID, guessScore). The existing inline (side-by-side) layout in question.html should be updated.

**Blitz mode exception:** No "Check Answer" button. Text submission fires on Enter only (or auto-submit with countdown). MC options fire on tap immediately.

**Correct answer reveal card** (shown below input only on wrong answer):
```css
background: rgba(58, 57, 57, 0.4);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
border-radius: var(--radius-lg);
border-left: 3px solid var(--color-success);
padding: 14px 16px;
margin-top: 12px;

/* Label: "Correct Answer" */
font: 500 0.65rem 'Lexend';
color: var(--color-success);
text-transform: uppercase;
letter-spacing: 0.1em;

/* Value */
font: 600 1rem 'Inter';
color: var(--color-fg);
```

**Timeout state:** When the timer expires before the user answers, trigger wrong-reveal state immediately. Same CSS as wrong-reveal — no separate "Time's Up" visual. Timer chip switches to `--color-warning` at ≤5s, then the wrong-reveal fires on expiry. The ELO penalty badge shows the extra penalty amount (e.g., `−13` instead of `−8`).

**Result badge** (shown above question on reveal):
```css
/* Correct */
background: var(--color-success-bg);
color: var(--color-success);
box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.2);

/* Wrong */
background: rgba(147, 0, 10, 0.2);
color: var(--color-error);
box-shadow: inset 0 0 0 1px rgba(255, 180, 171, 0.15);

/* Common */
border-radius: var(--radius-full);
font: 600 0.7rem 'Lexend';
text-transform: uppercase;
letter-spacing: 0.08em;
padding: 6px 12px;
```

**Three question interaction modes**

The question screen operates in one of three modes, determined by the game mode:

| Mode | Used in | Behavior |
|------|---------|----------|
| `standard` | Solo, Duel, Battle Royale, daily | Tap → selected-pre state → auto-submit after brief highlight → reveal |
| `free-text` | Any question with open text input | Type → tap "Check Answer" button → reveal |
| `blitz` | Blitz mode (speedrun) | Tap → **immediately** fires event, no selected-pre state, no check button |

**Blitz mode note:** In blitz mode, speed is the product. The selected-pre state and Check Answer button are removed. Tapping an MC option or submitting a text input fires immediately. The in-place reveal still applies (ANSWERING → REVEALING), but the transition is instant.

This mode distinction should be passed as a component input/signal: `@Input() mode: 'standard' | 'blitz'`. The question template renders check button and selected-pre state only when `mode !== 'blitz'`.

**Reveal architecture: In-place (do NOT route to result.html)**

Both free text and multiple choice use in-place reveal. The question screen transitions through three sub-states without a route change:

```
ANSWERING → REVEALING → (navigate to next question)
```

| Sub-state | What the user sees |
|-----------|-------------------|
| ANSWERING | Input/options active, timer running |
| REVEALING | Input/options frozen in correct/wrong state, ELO delta card shown, timer stopped, "Next Question →" button appears |

The existing `result.html` route remains for game-over summary screens. Per-question reveal is always in-place.

**Reveal timing:**
1. User taps "Check Answer" (free text) or taps an option (MC)
2. `150ms` — input/card transitions to correct/wrong state
3. `200ms` — ELO delta card enters (slide up, `ease-out`)
4. `250ms` — "Next Question →" button appears
5. User taps → navigate to next question (or result.html when game is over)

**Mobile keyboard behavior:**
- Question text + input field must remain visible above the raised software keyboard
- "Check Answer" button docks immediately above the keyboard (fixed to bottom of visible area)
- Use `padding-bottom: env(keyboard-inset-height, 80px)` or scroll-into-view on input focus
- On reveal, dismiss keyboard programmatically (`input.blur()`)

### Input Fields (General)

```css
/* Default */
background: var(--color-surface-low);
border-radius: var(--radius-md);
box-shadow: inset 0 0 0 1px rgba(42, 53, 68, 0.15);
/* Focus */
box-shadow: inset 0 0 0 2px var(--color-accent);
```

### ELO Delta Card

Shown after both MC and free-text reveals, below the answer area.

```css
/* Correct */
background: var(--color-success-bg);
border-radius: var(--radius-lg);
box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.15);
padding: 12px 16px;

/* Wrong */
background: rgba(147, 0, 10, 0.15);
box-shadow: inset 0 0 0 1px rgba(255, 180, 171, 0.15);

/* Value (e.g. "+24" / "−8") */
font: 700 1.5rem 'Space Grotesk';
color: var(--color-success);  /* or var(--color-error) */

/* Label ("ELO gained" / "ELO lost") */
font: 400 0.75rem 'Lexend';
color: var(--color-fg-muted);
```

### Bottom Navigation

```css
background: rgba(58, 57, 57, 0.4);
backdrop-filter: blur(20px);
height: calc(64px + env(safe-area-inset-bottom));
/* No top border — glass edge defines boundary */
```

---

## Layout & Composition

**Principle:** First viewport as poster, not document. Editorial asymmetry. Break the grid when it serves drama.

### Mobile (primary: 375–430px)

- **Max content width:** 100% full-bleed, 16px side padding
- **Top nav:** Fixed, 56px, glass surface
- **Bottom nav:** Fixed, 64px + safe area, glass surface, 5 items
- **Section spacing:** 24px between sections
- **Card gutter:** 12–16px
- **Card padding:** 20px internal

### Background Treatment

1. Image fills full screen (`object-fit: cover`)
2. Gradient overlay: `rgba(14,14,14,0.7)` → `rgba(19,19,19,0.95)` top-to-bottom
3. Optional: 2–4px Gaussian blur on the image
4. Content floats above on glass surfaces

### Home Screen Layout

Mixed design: Screen 1's editorial hero + Screen 2's structured mode list.

```
┌──────────────────────────────┐
│  [Logo]          [Coins] [👤]│  ← Glass nav (backdrop-blur)
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │  [Pitch bg + overlay]  │  │  ← Hero card, full-bleed, 240px min
│  │  ● Most Popular        │  │    Stitch image: CLASSIC bg
│  │  CLASSIC               │  │
│  │  MODE                  │  │  ← Space Grotesk 36px/700
│  │  [PLAY NOW ▶]          │  │  ← Accent gradient button + glow
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │  Global Standing       │  │  ← Rank card (surface-high)
│  │  1,240  ▲ Top 5%       │  │    Space Grotesk 40px num + bar chart
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │  🏆 Hat-Trick Hero     │  │  ← Achievement card, progress bar
│  │  ████████░░  2/3       │  │
│  └────────────────────────┘  │
│  GAME MODES                  │
│  ┌────────────────────────┐  │
│  │ 🎯 Solo Ranked    ›    │  │  ← Mode row, left accent border
│  └────────────────────────┘  │  ← bg: SOLO image + left-fade overlay
│  ┌────────────────────────┐  │
│  │ 💀 Mayhem Mode    ›    │  │  ← Mode row, left error border
│  └────────────────────────┘  │  ← bg: MAYHEM image + left-fade overlay
│  ┌────────────────────────┐  │
│  │ 👑 Battle Royale  ›    │  │  ← Mode row featured, accent border
│  └────────────────────────┘  │  ← bg: BATTLE image + left-fade overlay
│  ┌────────────────────────┐  │
│  │ ⚔️ Duel Mode      ›    │  │  ← Mode row, accent border
│  └────────────────────────┘  │  ← bg: DUEL image + left-fade overlay
│  SPECIAL MODES               │
│  ┌──────────┐ ┌────────────┐ │
│  │ Weekly   │ │  Daily     │ │  ← 2-col grid, 80px image tops
│  │ Recap    │ │  Challenge │ │    bg: WEEKLY / DAILY images
│  └──────────┘ └────────────┘ │
├──────────────────────────────┤
│  [Home][Leagues][+][Stats][👤]│  ← Glass bottom nav (backdrop-blur)
└──────────────────────────────┘
```

**Mode row pattern:**
```css
/* Background: left-to-right fade over image so text stays legible on left */
background:
  linear-gradient(90deg, rgba(14,14,14,0.82) 0%, rgba(14,14,14,0.4) 100%),
  url('<IMAGE_URL>') center / cover no-repeat;
border-left: 3px solid var(--color-accent);   /* std modes */
border-left: 3px solid var(--color-error);    /* elimination modes */
border-radius: var(--radius-lg);
min-height: 80px;
```

### Question Screen Layout — Multiple Choice

```
┌──────────────────────────────┐
│  ← Back    Q 3/10    0:23   │  ← Glass nav, Lexend timer
│  ████████░░░░░░░░░░░░  (glow)│  ← Progress bar
├──────────────────────────────┤
│  [WORLD CUP]                 │  ← Lexend label-md, accent
│                              │
│  Which country won the       │  ← Inter title-lg (22px/600)
│  first FIFA World Cup?       │
│                              │
│  ┌──────────────────────┐    │
│  │  A  Brazil           │    │  ← Default: surface-high
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  B  Uruguay   ✓      │    │  ← Correct: accent gradient
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  C  Argentina  ✕     │    │  ← Wrong chosen: error-bg
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  D  Italy            │    │  ← Wrong unchosen: opacity 0.45
│  └──────────────────────┘    │
│  ┌────────────────────────┐  │
│  │  +24 ELO gained        │  │  ← ELO delta card
│  └────────────────────────┘  │
│  [NEXT QUESTION →]           │  ← Primary button
└──────────────────────────────┘
```

### Question Screen Layout — Free Text

```
┌──────────────────────────────┐
│  ← Back    Q 7/10    0:30   │  ← Glass nav, timer
│  ██████████████░░░░░  (glow) │  ← Progress bar
├──────────────────────────────┤
│  [WORLD CUP FINALS]          │  ← Category label
│                              │
│  Who scored the winning      │  ← Inter title-lg
│  goal in the 2010 WC Final?  │
│                              │
│  ┌──────────────────────┐    │
│  │  Type your answer... │    │  ← Input idle: ghost border
│  └──────────────────────┘    │
│  [CHECK ANSWER]              │  ← Disabled (empty)
│                              │
│  ─── keyboard raised ───     │
│  [Q][W][E][R][T][Y]...       │
│  [A][S][D][F][G][H]...       │
│  [     space     ] [Go▶]     │
└──────────────────────────────┘

After correct submit:
│  ✓ CORRECT                   │  ← Result badge
│  ┌──────────────────────┐    │
│  │  Iniesta          ✓  │    │  ← Input: accent state
│  └──────────────────────┘    │
│  +24 ELO gained              │  ← ELO delta card

After wrong submit:
│  ✗ WRONG                     │  ← Result badge
│  ┌──────────────────────┐    │
│  │  Torres           ✕  │    │  ← Input: error state
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  Correct: Iniesta    │    │  ← Reveal card (glass, green border)
│  └──────────────────────┘    │
│  −8 ELO lost                 │  ← ELO delta card
```

### Result Screen Layout

```
┌──────────────────────────────┐
│  [Stadium bg full + overlay] │
│                              │
│  DUEL RESULT   ← Lexend sm   │
│  CLEAN                       │  ← Space Grotesk display-lg
│  SWEEP  ← accent color       │
│                              │
│  You  9    vs    4  Opponent  │  ← Score as hero element
│        +32 ELO               │  ← Lexend, success green
│                              │
│  [REMATCH]     ← Primary     │
│  [Home]        ← Secondary   │
└──────────────────────────────┘
```

---

## Spacing

**Base unit:** 4px

| Token | Value | Use |
|-------|-------|-----|
| `space-1` | 4px | Micro gaps |
| `space-2` | 8px | Tight spacing |
| `space-3` | 12px | Card internal, grid gutter |
| `space-4` | 16px | Side padding, default gutter |
| `space-5` | 20px | Card internal padding |
| `space-6` | 24px | Section gaps |
| `space-8` | 32px | Large section separation |
| `space-10` | 40px | Major sections |
| `space-12` | 48px | Page-level |

**Touch targets:** Minimum 44×44px. Non-negotiable.

---

## Motion

| Event | Duration | Easing | Description |
|-------|----------|--------|-------------|
| Answer tap | 150ms | ease-out | Card background transition |
| Correct/wrong reveal | 200ms | ease-out | Gradient flash |
| Screen transition | 250ms | ease-in-out | Slide |
| Progress bar fill | 300ms | ease-out | On question load |
| ELO counter | 600ms | ease-out | Old → new number |
| Bottom sheet open | 350ms | cubic-bezier(0.34,1.56,0.64,1) | Spring |
| Card tap | 100ms | ease-out | Scale 0.97 → 1.0 |

---

## ELO Tier Identity

Expressed via left-border color on rank cards — not background fills:

| Tier | ELO | Color |
|------|-----|-------|
| Legend | 1800+ | `#007AFF` (accent blue) |
| Elite | 1600+ | `#C0C0C0` (silver) |
| Challenger | 1400+ | `#CD7F32` (bronze) |
| Contender | 1200+ | `#4A90D9` (steel blue) |
| Grassroots | < 1200 | `#6b7a8d` (muted) |

---

## Anti-Slop Commitments

| Never | Always |
|-------|--------|
| 1px solid opaque borders | Tonal surface steps |
| Standard grey drop shadows | Ambient occlusion (40px blur, 6%) |
| Inter for all headlines | Space Grotesk for display moments |
| Dividers between content | Spacing + surface changes |
| Purple, violet, teal | iOS blue as the only expressive accent color |
| Per-mode background fills | Left-border accent + mode name |
| Gradient backgrounds on surfaces | Gradients for CTAs + overlays only |
| Decorative blobs, particles, orbs | Atmospheric imagery |
| Border-radius > 12px on primary cards | `--radius-lg` (12px) max |

---

## Implementation Checklist

### Typography
- [ ] Replace Bebas Neue with Space Grotesk for all headlines
- [ ] Keep Inter for body (already in use)
- [ ] Add Lexend for label/data layer (chips, timers, eyebrows)
- [ ] Update Google Fonts `<link>` in `index.html`

### Color
- [ ] Update all CSS custom properties
- [ ] Replace `#0E0F0C` → `#131313` (bg)
- [ ] Replace `#D4FF33` → `#007AFF` (accent)
- [ ] Replace `#6B6E60` → `#6b7a8d` (muted)
- [ ] Audit all hardcoded hex values → CSS variable tokens

### Components
- [ ] Primary buttons: add accent gradient + neon glow
- [ ] Answer cards: radius 6px → 12px
- [ ] Add glass effect (backdrop-blur) to nav bars + modals
- [ ] Add atmospheric overlay system for hero backgrounds
- [ ] Progress bars: add glowing accent fill
- [ ] Input focus: ghost border → accent glow

### Pages still to design
- [ ] Profile screen
- [ ] Leaderboard screen
- [ ] Login / Auth screen
- [ ] Battle Royale lobby / waiting room
- [ ] Post-game result screen (Duel, BR, Solo variants)
- [ ] Settings screen

---

## Background Image URLs

All images from Stitch (Google CDN). Use with atmospheric gradient overlay — never raw.

```
BASE = https://lh3.googleusercontent.com/aida-public/
```

| Usage | URL key | Description |
|-------|---------|-------------|
| Classic hero / home bg | `AB6AXuBeVRVY5jax1tLOVFqUNOfYZXG7SVastrcWb9hzkUqOKxw24f33boRjNBiMiUSnTZl4CfWZnFCJ1r_773z7iiL3FRiYZkOJMb6LhJ1qhyBtHLEGbuiECXM_FPRl37yG_A0AVHYaagNKr-aPInVAmEKngoHdv02O4hUw7s6oKKHFqCvYbrb5k6pU8bfLossV049wi6KHPuMU5QKJ_LO366XaRZOP9qkC2wiTohf3Bc2s2KYtM_7npmGiuDIhTn6ZSgmxzX01Rx5Jyvnr` | Cinematic pitch at night, bright floodlights |
| Solo Ranked | `AB6AXuCOC8qGfrSip9IAw0cKWtlZ52n3kew8m-m6Mcy2-u6P9llP42Ah-SVHg9E_hCccbUTeUEfby1TsOamROvFQ1ogjXF26Z4b8ugwopyTqg12IFGL_h3ASHDQzwmamsZIvVYwhRy38xgtV-M-JVMwdHOMpEstQ435qwVhviY08Tg7lMwSH0XTta28sALQ75vyNGls2Xyn1eEpJmBByLYelTxK6uA80AtcS6-tUWdFrVlvayCCFWrKVHOAYbvkyyWJKdfbwFpOuur_pdUwO` | Football on grass, single spotlight |
| Mayhem Mode | `AB6AXuCl_2IDuVEnsk6DvjtVfOGJoGBbgvEAQ1yq-9lOnXTRTQtHxluMucyoNNWbBE9c6e8lup4_ibfOsh1WbMNTTexa7xmC2RM-QdbPBZq854RcOgJKoAcHAeNUNerboyaGOFPQGrevluJzRbs_W93HjZNnThXeyN8ZA6P88e9MBBOMzerUTv-JfDOb_N0alzHpDI4cokBN8ixVqD32PUoaX_ybVbaMGb-TWJeJKpYBiJPh99B-b6ooEA9g8TYhIfsjsMBv4oddsRa_6Bpf` | High-energy stadium, electric sparks |
| Battle Royale | `AB6AXuD7WfzJ2uPX0wjysz1MSZoy0euR6Is7vhMQpFfvhnF3HEs446XHwhF_xnn8Zv4ncuWJE5H4SqzNAREfGltBMRRELd_v9yAbxvsKWb6aPxoSCYBr5CXqAN59Szi1QXMfb3xu1qXyrSyJKY8qvhWnYEy_zlAXhPWuQOhaHZnmmE05C8ih9f2QURXhXyGs0tey-7wLPPmTPiYeSRU_PZiVKH_jA9JfRF9lbczNEskW5UoSiE1WSAghOe0lEmrQolL3xUDYP9pauFfAqKKl` | Dramatic stadium atmosphere |
| Duel Mode | `AB6AXuDOymDiASJQ5XrBGrHQDo5CGYh3bXZrLz0DP4mty8g4yPENjoj6V6RlRmH4mF08P70DbAEW2smBV-7iVcxt4es6RuQyYaqEYtOwdW33atT20vAvOUc83AWb0oOLqmUOaeq9Q9uOihczaAT7SG4PXei6GzSSVFBnrvPlziCuFWgGGdy-PUT6vVGDSUuf-ztmQ2j2pqTias3mhQfR7m28x-cGjyFItaa4aGpvFRnt8MzplhsqQze9S8DCPczyyTJugvDjFqKj0yL61czy` | 1v1 intense atmosphere |
| Weekly Recap | `AB6AXuDLsFyPW5qqCGm2G1JpctPPof3UeSfNl4DVt-uRxV-XuOAnk7lMrTzLCFoKtKsv9cnoMth6u-RA3wGFilZOyl--1kGJ8NwwfYIZE0jkHuMHNGW63G7ighHF8jdxVbDvagqv-6t6DUMigwKY5am582iqoJx1IQ5a9a-xhmTwos8MN3MK1-tY1OT97l7BkJyeYPAV2nl9Y2mRS5e2aLY6YKBuEla0tStjgE9n-kL6KlRi07AhTuwZwgWirtan99QuJFS1Os8WruUWwaJ3` | Weekly football recap visual |
| Daily Challenge | `AB6AXuCxCyFwOniKxQ6C2RCzbXx84vb9hK3Sg20G9lWf6EOtpTjEr-qvoOV7zvwvjAOyw3zntTpzKqVT7UixLkOJAmZtyFM9QEljYL_Qh3Owg3ntfaUhiivj7LayVG0m2q23LmO-WNytMuPg2oBcX4_50QvYGNb5rzyrEGxwsOQte3xcSFopa3QJye8YBPDMn57IpgU8_2rQdkCrPvd_s87FFKXvNAYiUD0jyXxClDCqS5yvieBLXO_YWPR_rzLviPgkRey2ozGW2zAjvAC8` | Daily challenge atmosphere |

Full URL = `https://lh3.googleusercontent.com/aida-public/<key>`

---

## Implementation Token Mapping

DESIGN.md uses canonical token names. The Angular app uses Tailwind-mapped CSS variables. This table maps between them so implementers don't need to guess.

| DESIGN.md token | App equivalent | Notes |
|----------------|---------------|-------|
| `--color-bg` / `--color-surface-lowest` | `var(--color-background)` / `bg-background` | Base page background |
| `--color-surface-low` | `bg-card` / `var(--color-card)` | Card backgrounds |
| `--color-surface-high` | `bg-muted` / `var(--color-muted)` | Interactive card, answer tiles |
| `--color-surface-highest` | `bg-muted/80` or `var(--color-muted)` at higher contrast | Chips, elevated surfaces |
| `--color-fg` | `text-foreground` / `var(--color-foreground)` | Primary text |
| `--color-fg-variant` | `text-muted-foreground` | Secondary text |
| `--color-fg-muted` | `text-muted-foreground/70` | Tertiary labels |
| `--color-accent` | `var(--color-accent)` / `bg-accent` | iOS blue — already in use |
| `--color-accent-fg` | `text-accent-foreground` | Text on accent backgrounds |
| `--color-accent-bg` | `bg-accent/15` | Tinted accent backgrounds |
| `--color-accent-glow` | `rgba(0, 122, 255, 0.3)` | Used directly in box-shadow |
| `--color-error` | `var(--color-loss)` / `text-loss` | Wrong answer |
| `--color-error-bg` | `bg-loss/80` or `#93000a` directly | Wrong answer container |
| `--color-success` | `var(--color-win)` / `text-win` | Correct answer |
| `--color-success-bg` | `bg-win/10` | Correct state tint |
| `--radius-lg` | `rounded-xl` (12px) | Primary cards and buttons |
| `--radius-md` | `rounded-lg` (8px) | Input fields |
| `--radius-full` | `rounded-full` | Pills, avatars |

**Note on borders:** The app's existing `.question-page input` already uses `focus:border-accent`. The `box-shadow: inset 0 0 0 2px var(--color-accent)` pattern from the spec is the same visual result — use whichever matches the Tailwind class you're working with. Do not use both.

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-24 | Initial design system — "Floodlit Arena" | Created by /design-consultation based on Stitch mockups. Glassmorphism + organic brutalism for premium broadcast energy. |
| 2026-03-25 | Added question format specs (MC + free text) | Free text uses explicit submit button; wrong reveal preserves typed text so user sees exactly where they went wrong. Correct answer reveal uses frosted glass card with green left-border. |
| 2026-03-25 | In-place reveal (not route-based) | Reveal happens inline on question screen. result.html remains for end-of-game summary only. |
| 2026-03-25 | Three interaction modes: standard, free-text, blitz | Blitz = immediate fire on tap, no check button. Standard MC = selected-pre then auto-submit. Free text = explicit check button. |
| 2026-03-25 | Button layout stacked (all free-text) | Full-width input above, full-width Check Answer below. Applies to all 4 existing templates + new ones. |
| 2026-03-25 | Timeout = wrong-reveal (no separate state) | Timer expiry triggers wrong state, same CSS as wrong-reveal. No amber visual. |
| 2026-03-25 | MC a11y explicitly out of scope | Touch-first mobile game. Minimum: aria-label on answer cards. No keyboard nav required. |

---

## Stitch Reference

All source screens: Stitch project `11680002323878810353`

| Screen | ID | Notes |
|--------|----|-------|
| Home Screen - Redesign | `24b58d347dd74376b62ce49e9a69cf79` | **Source of truth** |
| Final Home Screen - All Modes | `723117df1e764985a5f50f73146d4360` | Reference |
| Classic Mode Quiz Screen | `0e396cafd4254dd095aa7cbb6d883ed2` | Reference |
| Challenge Mode Quiz Screen | `88e984db1d804c7aa2d4926f0cd9e03d` | Reference |
| Quick Intro Mode Quiz Screen | `e0ebcf649bb04b8fb626276321df02ab` | Reference |
