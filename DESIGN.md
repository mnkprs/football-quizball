# Design System — QuizBall

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

**Decoration level:** Intentional — atmospheric background imagery (stadium, ball, crowd) with heavy overlays. Glass-surface navigation and selection containers. Neon lime glow on primary CTAs and progress indicators.

**Emotional reaction in first 3 seconds:** Depth → Anticipation. The dark surfaces and glass layers make you feel inside the stadium. Then the lime accent fires like a floodlight coming on.

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

**Philosophy:** One high-vis lime accent on a deep pitch-at-night base. Surface hierarchy creates elevation through tonal steps — not borders or shadows.

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
  --color-fg-variant:  #c4c9ac;  /* Secondary text — muted sage */
  --color-fg-muted:    #8e9379;  /* Outline, tertiary labels */
  --color-fg-dim:      #444933;  /* Ghost borders (at 15% opacity) */

  /* ---- Brand Accent ---- */
  --color-accent:      #c3f400;               /* Lime. The ONE brand color. */
  --color-accent-dim:  #abd600;               /* Gradient endpoint, hover */
  --color-accent-fg:   #161e00;               /* Text on lime */
  --color-accent-bg:   rgba(195, 244, 0, 0.15); /* Accent tints, badges */
  --color-accent-glow: rgba(195, 244, 0, 0.3);  /* Neon glow shadow */

  /* ---- Semantic ---- */
  --color-error:       #ffb4ab;                /* Wrong answer, elimination */
  --color-error-bg:    #93000a;                /* Error container */
  --color-success:     #22C55E;                /* Correct answer */
  --color-success-bg:  rgba(34, 197, 94, 0.12);
  --color-warning:     #FF9500;                /* Time pressure (last 5s only) */

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
| `--color-fg-variant` | `#c4c9ac` | Secondary text |
| `--color-accent` | `#c3f400` | The ONE brand accent |
| `--color-accent-dim` | `#abd600` | Gradient endpoint |
| `--color-error` | `#ffb4ab` | Wrong / elimination |
| `--color-success` | `#22C55E` | Correct |

---

## Elevation & Depth

### The Layering Principle

Stack surfaces from `--color-surface-lowest` up to `--color-surface-highest`. A card on `--color-surface-low` uses `--color-surface-high` as its background — natural recess without any border.

### The No-Line Rule

**Never use 1px solid, 100% opaque borders.** All boundaries defined via background color shifts.

**Ghost Border Fallback:** If containment is strictly necessary, use `#444933` at **15% opacity only**:
```css
box-shadow: inset 0 0 0 1px rgba(68, 73, 51, 0.15);
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
.neon-glow    { box-shadow: 0 0 15px rgba(195, 244, 0, 0.3); }
.floodlit-glow { box-shadow: 0 0 60px -15px rgba(195, 244, 0, 0.3); }
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

**Primary (lime gradient):**
```css
background: linear-gradient(135deg, #c3f400 0%, #abd600 100%);
color: #161e00;
font: 600 0.875rem 'Inter';
text-transform: uppercase;
border-radius: var(--radius-lg);
box-shadow: 0 0 15px rgba(195, 244, 0, 0.3);
```

**Secondary (glass):**
```css
background: rgba(53, 53, 52, 0.2);
backdrop-filter: blur(10px);
color: #ffffff;
border-radius: var(--radius-lg);
box-shadow: inset 0 0 0 1px rgba(68, 73, 51, 0.15);
```

**Tertiary:**
```css
background: transparent;
color: #ffffff;
border-bottom: 1px solid rgba(142, 147, 121, 0.3);
```

### Answer Cards

- **Default:** `var(--color-surface-high)` bg, `var(--radius-lg)` corners, no border
- **Correct:** lime gradient fill, text `#161e00`
- **Wrong:** `var(--color-error-bg)` bg, text `var(--color-error)`
- **Gutter:** `1rem` between cards — **no dividers**

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
.progress-fill  { background: var(--color-accent); box-shadow: 0 0 8px rgba(195,244,0,0.5); }
```

### Game Chips / Pills

```css
background: var(--color-surface-highest);
border-radius: var(--radius-full);
font: 500 0.75rem 'Lexend';
padding: 4px 12px;
```

### Input Fields

```css
/* Default */
background: var(--color-surface-low);
border-radius: var(--radius-md);
box-shadow: inset 0 0 0 1px rgba(68, 73, 51, 0.15);
/* Focus */
box-shadow: inset 0 0 0 2px var(--color-accent);
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
│  │  [PLAY NOW ▶]          │  │  ← Lime gradient button + glow
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
│  │ 🎯 Solo Ranked    ›    │  │  ← Mode row, left lime border
│  └────────────────────────┘  │  ← bg: SOLO image + left-fade overlay
│  ┌────────────────────────┐  │
│  │ 💀 Mayhem Mode    ›    │  │  ← Mode row, left error border
│  └────────────────────────┘  │  ← bg: MAYHEM image + left-fade overlay
│  ┌────────────────────────┐  │
│  │ 👑 Battle Royale  ›    │  │  ← Mode row featured, lime border
│  └────────────────────────┘  │  ← bg: BATTLE image + left-fade overlay
│  ┌────────────────────────┐  │
│  │ ⚔️ Duel Mode      ›    │  │  ← Mode row, lime border
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

### Question Screen Layout

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
│  │  A  Brazil           │    │  ← Answer card (surface-high)
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  B  Uruguay   ✓      │    │  ← Correct: lime gradient
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  C  Argentina  ✕     │    │  ← Wrong: error container
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  D  Italy            │    │
│  └──────────────────────┘    │
└──────────────────────────────┘
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
| Legend | 1800+ | `#c3f400` (lime) |
| Elite | 1600+ | `#C0C0C0` (silver) |
| Challenger | 1400+ | `#CD7F32` (bronze) |
| Contender | 1200+ | `#4A90D9` (steel blue) |
| Grassroots | < 1200 | `#8e9379` (muted) |

---

## Anti-Slop Commitments

| Never | Always |
|-------|--------|
| 1px solid opaque borders | Tonal surface steps |
| Standard grey drop shadows | Ambient occlusion (40px blur, 6%) |
| Inter for all headlines | Space Grotesk for display moments |
| Dividers between content | Spacing + surface changes |
| Purple, violet, teal | Lime as the only expressive color |
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
- [ ] Replace `#D4FF33` → `#c3f400` (accent)
- [ ] Replace `#6B6E60` → `#8e9379` (muted)
- [ ] Audit all hardcoded hex values → CSS variable tokens

### Components
- [ ] Primary buttons: add lime gradient + neon glow
- [ ] Answer cards: radius 6px → 12px
- [ ] Add glass effect (backdrop-blur) to nav bars + modals
- [ ] Add atmospheric overlay system for hero backgrounds
- [ ] Progress bars: add glowing lime fill
- [ ] Input focus: ghost border → lime glow

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

## Stitch Reference

All source screens: Stitch project `11680002323878810353`

| Screen | ID | Notes |
|--------|----|-------|
| Home Screen - Redesign | `24b58d347dd74376b62ce49e9a69cf79` | **Source of truth** |
| Final Home Screen - All Modes | `723117df1e764985a5f50f73146d4360` | Reference |
| Classic Mode Quiz Screen | `0e396cafd4254dd095aa7cbb6d883ed2` | Reference |
| Challenge Mode Quiz Screen | `88e984db1d804c7aa2d4926f0cd9e03d` | Reference |
| Quick Intro Mode Quiz Screen | `e0ebcf649bb04b8fb626276321df02ab` | Reference |
