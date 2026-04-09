# ELO Ranking Legend Overlay — Design Spec

**Date:** 2026-04-09
**Status:** Approved

## Overview

A full-screen overlay modal on the leaderboard page that educates users about the 7 ELO ranking tiers. Shown automatically on a user's first visit to the leaderboard, and re-openable anytime via a discreet info icon button in the header.

## Behavior

### First-Visit Auto-Show
- On `ngOnInit`, check `localStorage` for key `leaderboard_legend_seen`.
- If the key is absent, show the legend overlay automatically after data loads.
- When the user dismisses the overlay (via "Got it" button, close ✕, or backdrop tap), set `localStorage.setItem('leaderboard_legend_seen', 'true')`.

### Re-Open via Header Button
- Add a small circular info icon button (ℹ) in the leaderboard header, positioned to the left of the existing refresh button.
- Tapping the button opens the same legend overlay.
- The button uses a subtle blue tint: `background: rgba(0, 122, 255, 0.12); border: 1px solid rgba(0, 122, 255, 0.25); color: #007AFF`.

## Overlay Design

### Backdrop
- `position: fixed; inset: 0; z-index: 1000`
- `background: rgba(0, 0, 0, 0.85)`
- Fade-in animation (200ms)
- Tapping backdrop dismisses the overlay

### Card
- Centered vertically and horizontally (flexbox)
- `background: var(--color-surface); border: 1px solid rgba(255,255,255,0.08); border-radius: 1.25rem`
- `padding: 1.75rem 1.25rem 1.25rem; width: 92%; max-width: 22rem`
- Slide-up + fade entrance animation (400ms cubic-bezier)
- Ambient glow at top (radial gradient, blue-to-purple, same as upgrade modal)

### Header Section
- Trophy emoji (🏆) centered, 1.75rem
- Title: "Ranking Tiers" — Space Grotesk, 700, 1.15rem
- Subtitle: "Climb the ladder by answering correctly" — muted color, 0.8rem

### Tier List
- 7 rows, ordered Challenger (top) → Iron (bottom)
- Each row: `display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem; border-radius: 0.75rem`
- Row background: tier color at 0.06 opacity
- Row border: tier color at 0.15 opacity
- Left: 2rem circle with gradient fill (tier color) containing an emoji icon
- Center: tier name in tier color, 0.85rem, weight 600
- Right: ELO range in muted color, 0.75rem

### Tier Data (from `elo-tier.ts`)

| Tier | Range | Color | Icon |
|------|-------|-------|------|
| Challenger | 2400+ | #e8ff7a | 👑 |
| Diamond | 2000 – 2399 | #a855f7 | 💎 |
| Platinum | 1650 – 1999 | #06b6d4 | ⚡ |
| Gold | 1300 – 1649 | #f59e0b | 🥇 |
| Silver | 1000 – 1299 | #94a3b8 | 🥈 |
| Bronze | 750 – 999 | #b45309 | 🥉 |
| Iron | 500 – 749 | #6b7280 | 🛡️ |

### Footer
- Divider: `border-top: 1px solid rgba(255,255,255,0.06)`
- Note: "All players start at Silver (1000 ELO)" — muted, 0.7rem, "Silver" highlighted in silver color
- "Got it" button: full-width, pill shape, gradient blue-to-indigo, white text, 0.85rem weight 600, glow shadow

### Close Button
- Top-right corner of card, 1.75rem circle
- `background: rgba(255,255,255,0.06); color: #6b7a8d`
- ✕ icon, tapping dismisses overlay

## Implementation Approach

### Files to Modify
- `frontend/src/app/features/leaderboard/leaderboard.ts` — add `showLegend` signal, localStorage check, toggle methods
- `frontend/src/app/features/leaderboard/leaderboard.html` — add info button in header, add overlay template
- `frontend/src/app/features/leaderboard/leaderboard.css` — add overlay styles (backdrop, card, tier rows, animations)

### No New Components Needed
The overlay is simple enough to live inline in the leaderboard component. No shared component, no service — just a signal, a template block, and CSS.

### Data Source
Tier names, colors, and ranges are already defined in `frontend/src/app/core/elo-tier.ts`. The overlay can either:
- Reference the existing `getEloTier` function for colors (but ranges aren't exposed as a list)
- Define a static `TIER_INFO` array in the component for the 7 rows (simpler, since the overlay is a static display)

Recommended: static array in the component — keeps it self-contained and avoids coupling display-only data to the runtime ELO utility.

## Animations

- **Backdrop**: `fade-in 200ms ease-out`
- **Card**: `slide-up 400ms cubic-bezier(0.25, 1, 0.5, 1)` (same as upgrade modal)
- **Tier rows**: staggered entrance, each row 50ms apart (pure CSS `animation-delay`)

## Accessibility

- Backdrop click dismisses
- Close button is focusable
- "Got it" button is focusable
- `aria-modal="true"` and `role="dialog"` on the overlay container

## Out of Scope

- Detailed ELO mechanics (K-factor, provisional multiplier, time limits)
- Internationalization of tier names (future)
- Syncing "seen" state across devices (localStorage is device-local, acceptable for v1)
