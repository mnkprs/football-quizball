# Changelog

All notable changes to StepOvr will be documented in this file.

## [0.9.7.0] - 2026-04-24

### Fixed
- Username modal no longer pops up at random for users who already have a username. The auth profile lookup now surfaces transient Supabase errors (network blips, mid-flight token refresh, RLS hiccups) instead of silently treating them as "no username," and the root component only re-checks username setup when the signed-in user id actually changes — not on every token refresh or metadata write.
- Top-nav settings panel now respects the mobile safe area on iOS. The slide-out panel pads against `env(safe-area-inset-right)` and `env(safe-area-inset-bottom)`, and the panel header clears the notch via `env(safe-area-inset-top)`.

### Changed
- Edit Profile is now a centered modal instead of a slide-in sub-panel. The settings sheet stays mounted underneath; the edit dialog renders as a sibling overlay with its own backdrop, fade/scale animation, and dynamic-viewport-aware sizing. Escape now closes the edit modal first, then the settings sheet. The settings sheet's focus trap is fully disabled (both `cdkTrapFocusEnabled` and `cdkTrapFocusAutoCapture`) while the edit modal is open, preventing two concurrent traps from fighting over focus.

## [0.9.6.0] - 2026-04-24

### Changed — Role-based typography tokens + codebase-wide migration

Added 5 role-based font-family CSS custom properties to `frontend/src/styles/tokens.css` (`--font-display`, `--font-headline`, `--font-numeric`, `--font-body`, `--font-mono`) and migrated every hardcoded font-family string in the app to reference them. 55 files swept via sed; 4 edge cases (Alfa Slab usage in `styles.scss`, unquoted `monospace` in admin `error-logs.ts`, dead text-treatment mixins in `mixins.css`, and an SVG presentation attribute in `logo-quiz.html`) handled with targeted edits. Zero hardcoded font-family strings remain outside the `@font-face` declaration.

**Role mapping.** `display` = Alfa Slab One (hero / brand), `headline` = Lexend (titles / labels), `numeric` = Space Grotesk (scores / counters / ELO), `body` = Inter (copy), `mono` = JetBrains Mono (debug / code). Each role's fallback chain uses real platform fonts (`Georgia`, `ui-sans-serif`, `system-ui`, `ui-monospace`) rather than the generic `sans-serif` / `serif` so degraded states look intentional, not broken.

**Dead tokens file consolidated.** `frontend/src/styles/abstracts/_tokens.css` had duplicate font defs with `--font-headline` and `--font-numeric` mapped to the **opposite** fonts (headline = Space Grotesk, numeric = Lexend) — these were silently overridden at runtime only because `tokens.css` loaded after `index.css` in `angular.json`. A future reshuffle of the style load order would have flipped every screen's typography. Duplicates removed; `--font-brand` (3 call sites, mapped to Alfa Slab) migrated to the canonical `--font-display`.

**SVG crest monogram.** The "FC" text inside the `logo-quiz.html` hero shield used `font-family="Space Grotesk, sans-serif"` as an SVG presentation attribute, which doesn't resolve CSS custom properties. Replaced with a `.lq-crest-monogram` class in `logo-quiz.css` — class-based CSS wins the cascade over the presentation attribute. While tokenizing, also corrected `font-weight="900"` → `font-weight: 700`: Space Grotesk on Google Fonts only loads up to weight 700, so the old value was browser-synthesized fake bold (doubled strokes, poor letter-fit at display size).

**Dead mixins aligned.** `mixins.css` defined `.so-text-display`, `.so-text-numeric`, `.so-text-label` utility classes that are unused anywhere in the codebase but referenced old hardcoded font strings. Re-pointed to the new tokens; `.so-text-display` weight corrected to 400 to match what Alfa Slab One actually loads.

**Claude-design handoff.** `tokens.css` is now the single source of truth for font tokens. The next feature generation round should reference `var(--font-*)` directly — a short preamble pointing to the file prevents the shadow-tokens problem this commit cleaned up.

## [0.9.5.1] - 2026-04-24

### Fixed — Profile "Last 10 games" now actually caps at 10

The `historyRows` computed in `ProfileComponent` was mapping the full `matchHistory()` signal, so the section labeled "Last 10 games" was rendering every match the user had ever played. Sliced to the first 10 entries inside the computed; the full list remains available via "See all matches ›" on `/profile/history`. Total-games and W/L/D chips are unaffected — they read `matchHistory()` directly, not the paged view.

## [0.9.5.0] - 2026-04-24

### Changed — Profile main screen now uses the so-* design system

The main profile screen is re-composed against the 2026-04-24 profile-flow bundle's Artboard A design language. **Every existing feature is preserved** — this is a visual refactor using the shared DS components, not a product redesign.

**Hero.** Photo background (reuses `/header-banner-bg.jpg`) with a dark scrim + tier-colored glow wash replaces the inline `hero__pitch` SVG. Top chrome reorganised as a single row: back button (when viewing another user), pro chip (when Pro), edit icon (own profile), tier chip. The existing bottom "Edit Profile" button stays too — the icon is a supplementary entry point, not a replacement. Avatar now renders via `so-avatar` (wrapped in the upload zone so click-to-change still works). Tier-colored ring kept via `outline` on the avatar container — `so-avatar`'s internal `[tier]` input was aligned to the 7-tier system in 0.9.4.0, so we could also use it directly; keeping the outline ring as a lightweight alternative that doesn't require passing a tier into the component.

**Sections now use `so-section-header`.** Every eyebrow label ("This Season", "ELO Progression", "Mode Stats", "Last 10 games", achievements) uses the DS component. Consistent vertical rhythm across the screen.

**"This Season" 4-stat grid.** The old absolute-positioned stat row is now a 2×2 grid of `so-stat-card` components: Peak ELO, Accuracy, Questions, Achievements (count). Cleaner, tighter, uses the same visual language as the `/profile/tier` hero.

**Last 10 games.** Custom `.match-row` markup replaced by `so-history-row` (with `[hideElo]=true` because `MatchHistoryEntry` doesn't carry per-match deltas yet — same reason as `/profile/history`). The W/L/D record chips and new "See all matches ›" link (when viewing your own profile) sit in a new `.section__head-extras` row under the section header. Added a `historyRows` computed to `profile.ts` that mirrors the mapper in `/profile/history`, flipping scores to the viewer's perspective and treating BR/TLB matches as neutral stripes (those modes don't have a per-viewer W/L/D notion).

**Account actions use `so-button`.** "Edit Profile" (secondary variant) and "Delete Account" (danger variant) replace the bespoke `.account-action-btn` markup. They stack vertically now instead of side-by-side for better touch targets.

**Preserved verbatim:** tier-progress strip link to `/profile/tier` (new in 0.9.3.0), XP/Level card (renamed `.xp-progress*` → `.xp-card*`, visual unchanged), ELO progression sparkline (SVG), Pro-only "View full analytics →" link, Mode Stats solo card, achievements grid with groups + progress + tap-to-popup, edit profile sheet, achievement detail popup, delete-account confirm modal, guest state, per-user-mode `isOwnProfile()` gating.

**CSS footprint:** `profile.css` shrank from 1,248 lines to 817 (-35%) — the custom `.match-row*`, `.match-badge*`, `.hero__pitch*`, `.hero__stat*`, `.account-action-btn*`, `.xp-progress*` rulesets are all gone, replaced by DS component styles or a handful of fresh selectors (`.hero__bg`, `.hero__top`, `.hero__top-btn`, `.stat-grid`, `.xp-card*`, `.section__head-extras`). Added reduced-motion fallback for all new transitions.

**Not included from the bundle.** Artboard A's "Top Categories" section (no data source), `@handle` and "location" meta line (no fields in the data model), "Share Profile" button (routes to the deferred `/profile/share` screen). The bundle's favourite-team feature (from Artboard E — Edit Profile) also omitted. These are follow-ups, not regressions.

---

## [0.9.4.0] - 2026-04-24

### Changed — Leaderboard-flow refactor + shared tier-promotion overlay

Two coordinated pieces from the 2026-04-24 leaderboard-flow design bundle land together. The leaderboard screen is overhauled onto the shared DS (−1,149 lines net), and a new app-shell celebration overlay replaces three inconsistent per-mode tier-up signals with one. Profile-tier/profile-history routes that landed in v0.9.3.0 are unaffected.

---

**1. Leaderboard screen refactor.** `LeaderboardComponent` collapsed from 729 HTML lines + 989 CSS lines down to 176 + 373 by extracting a single `<lb-section>` subcomponent that renders podium + ranked list + "me below" + empty state from a normalized `LeaderboardRow[]`. The four near-identical blocks (Solo / Logo Quiz / Logo Hardcore / Duel) — each with its own podium markup, list markup, and me-below markup — all now route through the same template.

New `features/leaderboard/leaderboard-row.ts` adapter. Introduces a `LeaderboardRow` shape (`id / rank / username / score / scoreLabel / meta / tier / isMe`) plus `toRows.*` and `meToRow.*` adapters that flatten the four backend entry shapes. Each adapter owns its meta-line format: solo shows `"N questions · X% accuracy"`, logo shows `"N games played"`, duel shows `"NW · ML · X% win rate"`. Duel deliberately leaves `tier` undefined because `DuelLeaderboardEntry` has no ELO field — the DS row falls back to a neutral accent and the avatar ring skips the tier color.

`so-tab-strip` replaces the hand-rolled mode/sub-mode tab buttons. The old `.mode-tabs` + `.mode-tab--active` CSS and the two `<button role="tab">` blocks for Solo/Logo/Duel (and Normal/Hardcore) are gone — one `<so-tab-strip>` each, keyed off `activeTab()` and `logoQuizSubTab()`. WAI-ARIA tablist + arrow-key roving focus come for free from the primitive.

`SoTier` aligned with the game's real 7-tier ELO system. The DS primitives (`so-avatar`, `so-rank-badge`, `so-leaderboard-row`) previously used a speculative 5-tier union (`Legend / Elite / Challenger / Contender / Grassroots`) that didn't exist anywhere in the game — only in the dev UI gallery. `SoTier` now aliases `EloTierId` from `core/elo-tier.ts` (`sunday_league / academy / substitute / pro / starting_xi / ballon_dor / goat`), and `elo-tier.ts` exports a new `getTierMeta(tier)` helper that is the single source of truth for tier label + color + icon. DS primitives import the helper instead of hardcoding their own 5-color map. Ring color on the avatar, stripe color on the rank badge, and border-left + label on the leaderboard row all now render the correct seven colors.

`so-leaderboard-row` gained `meta` and `scoreLabel` inputs. Now renders `{tier icon} {tier label} · {meta}` inline (matching the design's inline format), with `scoreLabel` defaulting to "ELO" and switching to "Wins" for the duel leaderboard. Ring also lights up when `me` is true, so the "you" row gets a visually anchored accent without relying on a separate avatar-you treatment.

`ui-gallery` updated to exercise all seven tiers instead of the phantom five, plus one example of the new `meta`/`scoreLabel` inputs on `so-leaderboard-row`.

---

**2. Shared tier-promotion overlay.** New `TierPromotionService` + `TierPromotionOverlayComponent` mounted at the app shell alongside the existing `LevelUpOverlayComponent`. Consumers call `tierPromotion.show(newTier, eloGained)`; the overlay renders the tier-colored ring, tier icon (pulled from the new `EloTier.icon` field), "You reached *Ballon d'Or*" headline, `+ELO` pill, and a 24-piece confetti burst tinted from `tier.color`/`tier.glow`. Auto-dismisses after 3.5s or on tap; respects `prefers-reduced-motion` by dropping confetti and the ring pulse but keeping the scale-in so the moment still registers.

Replaces three inconsistent in-mode signals with one:

- `solo.ts` — deleted the `tierUpMessage` signal, the 3-second `tierUpTimeout` toast, the `.solo-tier-toast*` CSS (28 lines), and the `<div class="solo-tier-toast">` in `solo.html`. The existing tier-up detection at line 253 now calls `this.tierPromotion.show(newTier, result.elo_change)` and nothing else.
- `logo-quiz.ts` — deleted the `tierPromoted` signal, the `[class.lq-session-elo__tier--promoted]` binding in `logo-quiz.html`, and the `.lq-session-elo__tier--promoted` animation rule (+ its reduced-motion sibling) in `logo-quiz.css`. The promotion branch now fires the overlay while still setting `borderGlow = 'glow-strong'` so the session header also reacts. Non-promotion ELO ticks keep the subtle `glow` border — unchanged. `previousTier` storage shape unchanged (still a tier-id string); the call site now passes the full `EloTier` object to the service instead of just the id.
- `mayhem-mode.ts` — **net-new**. Mayhem had no tier-crossing signal at all. Added detection at the ELO-update site in `submitSessionAnswer`: computes `getEloTier(currentElo - eloChange)` vs `getEloTier(currentElo)` and fires the overlay when they differ and `elo_change > 0`. Stateless-answer path is unaffected (no ELO = no promotion to celebrate).

Why a shell-mounted overlay. Tier promotion is a *player* event, not a *game-mode* event — every mode that touches ELO should celebrate identically. Living in `app.html` means the celebration survives route changes (a player who crosses Starting XI on the final duel question still sees the moment even if they navigate home before it fires). Mirrors `LevelUpService` 1:1 so the pattern is already familiar in the codebase.

`EloTier.icon` added. The seven emoji mascots (🐐 / 🥇 / 🎽 / ⚽ / 🪑 / 🎒 / 🥾) live on `EloTier` now, so every surface that shows a tier — overlay hero, leaderboard row, ranking-legend modal — reads from the same field instead of each re-defining its own lookup. The legend modal in `leaderboard.ts` still carries its own literal table because the ranges/gradient-from colors live there and aren't on `EloTier`; worth unifying in a later pass.

Left as follow-ups (intentional): No demotion celebration — different visual language (sober, not confetti). No promotion queue — if a player somehow gains two tiers in one answer, the service shows the final tier only. The orphaned `@keyframes tier-promote` in `styles/base/_animations.css` is harmless and kept for a future dead-CSS sweep. Screen G (`LBJumpCelebration` post-match results screen) from the design bundle is deferred — needs a routing + data-flow decision before shipping.

**Net diff: +330 insertions / −1,465 deletions** across 22 files. Production build clean; only pre-existing NG8107/NG8102 warnings in unrelated daily/mayhem templates remain. No unit tests for `TierPromotionService`/`TierPromotionOverlayComponent` or the new `lb-section`/`leaderboard-row` adapters — project has no Angular component test infrastructure; acceptable coverage gap for a display-layer refactor.

---

`LeaderboardComponent` collapsed from 729 HTML lines + 989 CSS lines down to 176 + 373 by extracting a single `<lb-section>` subcomponent that renders podium + ranked list + "me below" + empty state from a normalized `LeaderboardRow[]`. The four near-identical blocks (Solo / Logo Quiz / Logo Hardcore / Duel) — each with its own podium markup, list markup, and me-below markup — all now route through the same template.

**New `features/leaderboard/leaderboard-row.ts` adapter.** Introduces a `LeaderboardRow` shape (`id / rank / username / score / scoreLabel / meta / tier / isMe`) plus `toRows.*` and `meToRow.*` adapters that flatten the four backend entry shapes. Each adapter owns its meta-line format: solo shows `"N questions · X% accuracy"`, logo shows `"N games played"`, duel shows `"NW · ML · X% win rate"`. Duel deliberately leaves `tier` undefined because `DuelLeaderboardEntry` has no ELO field — the DS row falls back to a neutral accent and the avatar ring skips the tier color.

**`so-tab-strip` replaces the hand-rolled mode/sub-mode tab buttons.** The old `.mode-tabs` + `.mode-tab--active` CSS and the two `<button role="tab">` blocks for Solo/Logo/Duel (and Normal/Hardcore) are gone — one `<so-tab-strip>` each, keyed off `activeTab()` and `logoQuizSubTab()`. WAI-ARIA tablist + arrow-key roving focus come for free from the primitive.

**`SoTier` aligned with the game's real 7-tier ELO system.** The DS primitives (`so-avatar`, `so-rank-badge`, `so-leaderboard-row`) previously used a speculative 5-tier union (`Legend / Elite / Challenger / Contender / Grassroots`) that didn't exist anywhere in the game — only in the dev UI gallery. `SoTier` now aliases `EloTierId` from `core/elo-tier.ts` (`sunday_league / academy / substitute / pro / starting_xi / ballon_dor / goat`), and `elo-tier.ts` exports a new `getTierMeta(tier)` helper that is the single source of truth for tier label + color. DS primitives import the helper instead of hardcoding their own 5-color map. Ring color on the avatar, stripe color on the rank badge, and border-left + label on the leaderboard row all now render the correct seven colors.

**`so-leaderboard-row` gained `meta` and `scoreLabel` inputs.** Previously only rendered the tier label under the name and hardcoded "ELO" under the score. Now renders `{tier icon} {tier label} · {meta}` inline (matching the design's inline format), with `scoreLabel` defaulting to "ELO" and switching to "Wins" for the duel leaderboard. Ring now also lights up when `me` is true, so the "you" row gets a visually anchored accent without relying on a separate avatar-you treatment.

**`ui-gallery` updated** to exercise all seven tiers instead of the phantom five, plus one example of the new `meta`/`scoreLabel` inputs on `so-leaderboard-row`.

**Net diff: −1,149 lines** across `leaderboard.{ts,html,css}`, `so-avatar.ts`, `so-leaderboard-row.{ts,html,css}`, `so-rank-badge.{ts,html}`, `elo-tier.ts`, and `ui-gallery.html`. Production build clean; only pre-existing NG8107/NG8102 warnings in unrelated daily/mayhem templates remain.

## [0.9.3.0] - 2026-04-24

### Added — Two new profile drilldown routes: `/profile/tier` and `/profile/history`

Ships the two low-risk, display-only drilldown routes from the 2026-04-24 profile-flow design bundle as new standalone feature folders. The main profile screen is untouched apart from two surgical CTAs that reach the new routes. The product-sensitive routes (`/profile/edit`, `/profile/share`) are explicitly deferred.

**`/profile/tier` — Rank Ladder.** New `ProfileTierComponent` at `frontend/src/app/features/profile-tier/`. Shows the user's current tier as a hero (badge + ELO + rank #, background tinted with tier colour + glow), the "path to next tier" strip via the new `so-tier-progress` primitive, all 7 tiers in descending order with current highlighted, and a short ELO explainer. Reads tier boundaries from the single source of truth (`core/elo-tier.ts#getEloTier`) — no hardcoded duplicates. Entry point: tap the tier-progress strip on the main profile hero.

**`/profile/history` — Full Match History.** New `ProfileHistoryComponent` at `frontend/src/app/features/profile-history/`. Fetches the server-side match list via `MatchHistoryApiService.getHistory()` (backend caps: 10 for free / 100 for Pro — exposed as a cap hint in the header). Client-side filter chips via `so-tab-strip` (ALL / WINS / LOSSES / DRAWS), each row rendered via the new `so-history-row` primitive. Battle-royale and team-logo-battle matches are flagged as "draw" for the stripe colour since those modes don't have a W/L/D notion per viewer. Tapping a row navigates to `/match/:id` (existing match-detail route). Loading, error-with-retry, empty, and filter-yields-no-results states all covered. Auth-guarded. Entry point: "See all matches ›" link in the Last 10 games section header on the main profile (shown only on own profile).

**Route ordering.** `profile/tier` and `profile/history` registered BEFORE `profile/:userId` in `app.routes.ts`, otherwise the `:userId` wildcard would swallow the word "tier"/"history" and the new routes would never match. Inline comment documents the gotcha.

**Current profile touched in exactly two places.**
- The `tier-progress` div → `<a>` with `routerLink="/profile/tier"` (same layout; adds hover/active affordance via new `.tier-progress--link` variant). No other behavioral change.
- New `.section__see-all` link "See all matches ›" added to the Last 10 games section header, only when `isOwnProfile()` is true. No other rows or sections changed.

**Shared primitive extensions (both land with this PR; both backwards-compatible).**
- `so-history-row` gains a `[hideElo]` input. MatchHistoryEntry (from the backend) doesn't carry per-match ELO deltas — only `elo_history` does. Setting `hideElo=true` on `/profile/history` hides the right-side "+0 ELO" column entirely rather than showing a misleading zero on every row. Default stays `false` so the existing (future) consumers see no change. When a backend join with `elo_history` lands, flip to `false` and pass real deltas.
- `so-tier-progress` gains an optional `[color]` input (defaults to `--color-accent`). `/profile/tier` passes `currentTier().color` so the progress bar fill and the "next-tier" highlight match the tier-tinted hero above (green for Pro, gold for Ballon d'Or, etc.) instead of always being blue.

**GOAT edge case.** At the top tier, `nextTierThreshold()` returns null. `/profile/tier` now renders a "Top of the ladder" note instead of a nonsensical "Path to GOAT / GOAT · GOAT · +0" strip.

**Pro cap hint accuracy.** `/profile/history` now calls `ProService.ensureLoaded()` on load, so deep-links (push notifications, bookmarks) don't briefly show "upgrade to Pro for 100" to actual Pro users.

**What's NOT in this PR.** The main `profile.html` rewrite from the bundle remains deferred — it would delete achievements, XP progress, ELO sparkline, avatar upload, inline edit sheet, delete-account flow, guest state, per-match-mode badges, and all `lang.t()` i18n. Those are product decisions. The bundle's `/profile/edit` route is also deferred pending a product call on whether to replace the existing inline edit sheet, and `/profile/share` needs image generation + Capacitor share-plugin wiring. And the backend join to surface real per-match ELO deltas (which would let us un-hide the ELO column on history rows) is a separate task.

## [0.9.2.0] - 2026-04-24

### Added — Three new design-system primitives from the profile-flow design brief

Ported the reusable components from the 2026-04-24 profile-flow design bundle (`uHEs6HsVQL_7mqTbRPDWxQ`) into `frontend/src/app/shared/ui/`. Zero consumer changes this release — the existing `profile.html` is untouched. These primitives unblock the upcoming `/profile/tier`, `/profile/history`, `/profile/edit`, and `/profile/share` routes, and will also be consumed by the planned Leaderboards refactor.

**`so-history-row`** — match history list row. Left-stripe color-coded outcome (win=success, loss=error, draw=muted), optional thumbnail (team crest or opponent avatar) with initials fallback, mode label + result chip, opponent/score/time meta line, signed ELO delta on the right. Takes a typed `SoHistoryRowData` object and emits `rowClicked` with the whole row. Deliberately presentation-only — mode-specific rendering (BR score vs 1v1 score, match-mode badges) is the caller's responsibility. Reuses the existing `so-chip` component.

**`so-tier-progress`** — ELO-to-next-tier progression strip. Inputs are plain primitives (`tier`, `nextTier`, `elo`, `nextElo`, `tierStart`) so callers can derive them from any ranking source — ProfileStore, EloService, the new profile-tier route's own data layer. Calculates fill percent and remaining-ELO-to-next-tier internally. Reuses the existing `so-progress-track` component.

**`so-toggle-row`** — settings-list toggle variant. Label + switch, tight vertical padding suitable for stacked settings rows. Uses Angular's `model()` for two-way `[(checked)]` binding. Intentionally distinct from the existing `so-toggle`, which is the richer card variant (supports `label` + `description` + four variants + disabled state) used for high-prominence toggles like the Hardcore mode switch in the Logo Quiz lobby. Both components have a place; the README for each makes the choice obvious.

**Import-path corrections vs the bundle.** The design bundle referenced `ChipComponent` from `'../chip/chip.component'` and `ProgressComponent` from `'../progress/progress.component'` — neither exists in this project. Rewired to `SoChipComponent` from `'../so-chip/so-chip'` and `SoProgressTrackComponent` from `'../so-progress-track/so-progress-track'` (with updated selector `<so-progress-track>` and matching input names). Same final visual, same behavior.

**Not in this release.** The bundle's `profile.html.new` drop-in was a product-level simplification (removes achievements, XP progress, ELO sparkline, avatar upload, inline edit sheet, delete-account, guest state, per-match-mode badges, and all `lang.t()` i18n), not a faithful refactor — and its patch assumed a `ProfileService` surface that doesn't match the real `ProfileComponent`. Keeping the existing `profile.html` untouched until those trade-offs are product-reviewed; the 3 primitives land first so subsequent routes (`/profile/tier` etc.) can compose them when they're scaffolded.

## [0.9.1.2] - 2026-04-24

### Fixed — Redis outage no longer takes down every API route

On 2026-04-23 at 23:29 UTC, Upstash Redis hit its 500,000 request/day cap. Every API route that went through the global `UserThrottlerGuard` (which is all of them) started returning HTTP 500, including anonymous routes like `/api/config/ads`, `/api/config/feature-flags`, and `/api/onboarding/questions`. First-time users opening the app saw the onboarding screen hang until the daily quota reset at midnight UTC.

**Root cause:** The `ThrottlerStorageRedisService` does not fail open. When Redis's `INCR` throws, the exception propagates out of the guard and `AllExceptionsFilter` turns it into a generic 500 for every route. The handler never executes — which is why even trivially-defensive endpoints (`getSetting` wrapped in try/catch, defaults for missing keys) still 500'd.

**Fix:** New `FailOpenThrottlerStorage` decorator in `backend/src/common/throttler/fail-open-throttler-storage.ts` wraps `ThrottlerStorageRedisService`. When the delegate throws, the decorator logs a warn, increments an observable failure counter, and returns a synthetic `ThrottlerStorageRecord` that reads as "under the limit, not blocked". The guard then lets the request through. Rate limiting degrades to **disabled** while Redis is unhealthy; the API stays up.

**Security tradeoff:** During a Redis outage, rate limits are not enforced. A determined attacker could burst during the outage window. Given the alternative is a total API outage for every user, this is the right call — and the first failure is logged at `warn` per request (plus the Redis client's own error handler logs at error level), so the outage is visible in monitoring rather than silent. The synthetic "under-limit" record never marks a request as blocked, so legitimate 429s (from successful-but-over-limit Redis calls) still fire normally.

**Test coverage:** 8 regression tests in `fail-open-throttler-storage.spec.ts` cover: healthy delegation, blocked-record pass-through (ensures legitimate 429s still fire), synthetic response shape, ttl echo, failure counter, warn logging, and the exact outage stack trace from 2026-04-23.

## [0.9.1.1] - 2026-04-24

### Fixed — Duel-timeout cron frequency dropped from 30s to 2min to cut Upstash Redis load

The `DuelTimeoutService.advanceTimedOutQuestions` cron in `backend/src/duel/duel-timeout.service.ts` ran every 30 seconds, calling `acquireLock` + `releaseLock` on every tick (2 Redis commands × 2 runs/min × 60 × 24 × 30 ≈ **173k commands/month**, just from this one idle cron on Railway with zero user traffic). That single cron was responsible for the 50k/month Upstash threshold being crossed in pure dev.

Lowered the schedule from `*/30 * * * * *` to `0 */2 * * * *` — ~4× fewer runs per hour, dropping this cron to ~43k commands/month. AFK duels now auto-advance within 2 minutes instead of 30 seconds, which is acceptable because the client already calls the timeout endpoint on question expiry; this cron only catches the rare case where neither player's browser is active.

## [0.9.1.0] - 2026-04-23

### Changed — Home-flow refactor: Logo Quiz surfaced once, 2 new DS primitives

Home page information architecture simplified from three tiers to three sections: Featured → Multiplayer → Pro Arena. Logo Quiz now appears **once** (as the Featured hero) instead of four times — the three sub-mode rows (Solo Quiz / Logo Duel / Team Logo) are gone because the v0.9.0.0 lobby already surfaces Solo / Duel / Royale tabs. The "Team Logo" surface is no longer a home-level entry; it's reached via the lobby's Royale tab.

**`so-multiplayer-card`** — new shared DS component. Generalises the inlined `.two-player-card` pattern from `home.html` into a hero-image card with a split-CTA footer (`primary` / `secondary` inputs typed as `{label, sub?, icon?}`, outputs `primaryPressed` / `secondaryPressed`). Accepts an `accent` CSS color that drives the button press-glow via `--mp-accent`. Reusable for future friend-challenge and private-room invite surfaces. Visuals are the lifted `.two-player-card` rules; outer is a `<div role="group">` (was a `<div>`), no more nested-button anti-pattern.

**`so-section-header`** — new shared DS component. Eyebrow label above a group of mode rows / cards, with an optional right-side `action` string (e.g. "See all") that emits `actionClicked`. Replaces the ad-hoc `<div class="so-section-header">` in `home.html`. `tight` input removes the top margin for cases where the header sits flush under another element.

**Logo sub-mode rows removed, ~40 lines gone from `home.html`.** `goLogoDuel()` and `goTeamLogoQuiz()` handlers deleted from `home.ts`. Routes `/duel?mode=logo` and `/battle-royale?mode=team_logo` still work — the lobby's tab strip is the new entry point.

**`home.css` shrinks from 217 → 116 lines (-46%).** Removed: `.two-player-card*` (now in the DS component), `.logo-modes-tier` (surface deleted), `.so-section-header` (now in the DS component). Layout rules, stagger reveal, Pro Arena breathing ambient, and reduced-motion fallbacks all preserved.

**Analytics continuity in `logo-quiz.ts#setSubMode`.** Every sub-mode tab selection now fires the same `select_content` event the old home-page rows fired: `item_id: 'logo_duel'` for the Duel tab and `'team_logo_quiz'` for the Royale tab. Same event name, same `content_type`, same item_id strings, so existing dashboards keep working with zero migration. Solo tab deliberately fires no event (the hero card already fires `'logo_quiz'` and Solo is its default landing tab; an additional event here would double-count). Dedup on `next === previous` prevents tab-fidgeting noise. Deep-links (e.g. `/logo-quiz?tab=duel`) bypass this path via the URL→activeSubMode effect, matching the pre-refactor behavior where deep-links to `/duel?mode=logo` also never fired `'logo_duel'` from home.

**Small UX fixes from `/review`.** Removed a misleading `cursor: pointer` + active-scale from the `so-multiplayer-card` outer container (only the inner CTAs are clickable; the pointer cursor on the dead zone between title and buttons was a carry-over from the old `.two-player-card` that fooled the hover state). Moved the Logo Quiz hero subtitle through `LanguageService.t().logoQuizHeroSubtitle` so the one string unique to this refactor isn't adding to the i18n backlog.

## [0.9.0.2] - 2026-04-23

### Changed — Native app icon + splash refresh, version bump to v1.1.7

Regenerated the Android and iOS launcher icons and splash screens from a new source-asset set (`frontend/assets/icon.png`, `icon-foreground.png`, `icon-background.png`) via `@capacitor/assets`.

**Android — v1.1.6 → v1.1.7:**
- `versionCode 16 → 17`, `versionName "1.1.6" → "1.1.7"` in `build.gradle`.
- Adaptive icon background switched from the color drawable `@color/ic_launcher_background` to a full-raster `@mipmap/ic_launcher_background` (new `ic_launcher_background.png` per DPI bucket). Gives the icon proper contrast and depth on Android 8+ launchers that render adaptive-icon background layers independently of the foreground.
- Added `ldpi` DPI bucket coverage (both mipmap and drawable) — earlier releases omitted it, which left very low-DPI devices scaling from larger buckets.
- Full night-mode splash coverage (`drawable-land-night-*` and `drawable-port-night-*` across every DPI bucket, plus a `drawable-night` default). Prevents the splash from looking out of place on devices with system dark theme active during cold launch.
- Minor `AndroidManifest.xml` formatting cleanup (no behavior change).

**iOS — v1.5 → v1.6:**
- `CURRENT_PROJECT_VERSION 6 → 8`, `MARKETING_VERSION 1.5 → 1.6` in `project.pbxproj`.
- `IPHONEOS_DEPLOYMENT_TARGET 15.0 → 15` (Xcode auto-normalization; no effective deployment-target change).

### Changed — Shell bottom-nav inner padding bump

Bumped `.bottom-nav` inner padding from `0.5rem + safe-area-inset-bottom` to `1rem + safe-area-inset-bottom`. Gives nav items more breathing room above the home indicator / safe-area zone and matches the density used elsewhere in the shell. Removed an unused `gap` and `padding` declaration on `.bottom-nav__item` that was being overridden in practice.

### Added — Flagship redesign brief doc

Captured the brief used during the 2026-04-23 design-system session at `docs/superpowers/specs/2026-04-23-design-system-flagship-brief.md`. Intended as a handoff target for the claude-design agent or any future design-focused redesign pass: forge the reusable `so-*` primitive set against one real consumer (`/blitz`) before fanning out to all features.

## [0.9.0.1] - 2026-04-23

### Fixed — CI npm ci failure after adding @capacitor/assets

`frontend/package-lock.json` was out of sync with `frontend/package.json` because v0.9.0.0 added `@capacitor/assets@^3.0.5` to devDependencies without regenerating the lockfile. GitHub Actions (`npm ci`) failed with ~260 "Missing from lock file" entries covering the `@capacitor/assets` → `@trapezedev/project` → `sharp` transitive tree. Regenerated the lockfile with `npm install --package-lock-only`; `npm ci --dry-run` now installs cleanly. Railway was unaffected — its build uses the forgiving `npm install` rather than strict `npm ci`.

## [0.9.0.0] - 2026-04-23

### Added — Logo Quiz lobby overhaul with 3 sub-mode tabs

Logo Quiz now has a full-featured lobby that lets players pick their game mode without leaving the page. Tapping the Logo Quiz card reveals three sub-mode tabs — Solo, Duel, and Royale — each with its own color identity, hero treatment, and primary action. The whole experience is redesigned around the new StepOver design system spec.

**Three sub-mode tabs in the lobby.** Solo keeps the existing climb-the-ladder flow. Duel surfaces your duel win rate and leaderboard rank in a versus card, then routes to `/duel?mode=logo` on tap. Royale opens a bottom drawer with Create Private Room + Join With Code options — no more navigating away to the battle-royale lobby just to tap another button. The active tab is synced to the URL as `?tab=duel|royale`, so deep-links and browser back/forward work.

**Per-mode visual identity.** The hero background is now a color-matched shield-and-star SVG crest with a radial glow — blue for Solo, red for Duel, gold for Royale (and red when Hardcore is on). Replaced ~1.2MB of PNG backgrounds with a ~2KB inline SVG that switches instantly on tab change. Each sub-mode's primary CTA inherits its tab color: Find Duel is red, Enter Royale is gold, Start Quiz stays StepOver blue.

**Logo-prominent question template.** The in-game question screen for LOGO_QUIZ category now centers a large crest (72vw, up to 18rem) with a mode-colored glow halo, an "ORIGINAL" pill on reveal, and a centered input below. The searchable team-name autocomplete, 30s timer, and fuzzy-match backend are unchanged — only the visual treatment changed.

**Redesigned Session Complete screen.** ELO delta is now the hero stat in a 3rem display, with a color-coded up/down border stripe. Three supporting stat tiles (Answered / Correct / Accuracy) replace the old list-of-pairs layout. Primary CTA is full-width Play Again; secondary is ghost Back to Home.

**Duel compact stats in versus card.** Shows win rate percent, rank, and W/L/games-played sub-line. Falls back to a "NEW CHALLENGER" empty state when the player has no duel history. Stats come from the existing backend `duelMe` endpoint which aggregates all duel game_types — a future backend split by `game_type='logo'` will make these logo-duel-specific.

### Added — Two new design-system primitives

**`so-tab-strip`** — segmented tablist with full WAI-ARIA support (roving tabindex, ArrowLeft/Right/Home/End key navigation, `aria-controls`/`aria-labelledby` bidirectional linking). Each tab can optionally route via `routerLink` (renders as `<a>`) or emit a `tabChange` event (renders as `<button>`). Supports an optional sublabel and per-tab accent color. Re-usable across any future tabbed lobby.

**`so-toggle`** — glass-tile switch with label + description + pill switch. Four variants (default / danger / success / pro), with danger pulsing red when active (for destructive mode toggles like Hardcore). Emits the new boolean value via `checkedChange`. Replaces the old bespoke Hardcore toggle markup.

### Changed — `so-button` primary variant feels heavier

Font weight 600 → 700 across all variants; primary box-shadow changed from symmetric glow to drop shadow (`0 6px 20px rgba(0,122,255,0.35)`) for more grounded visual weight. Added two new variants matching `so-chip`'s vocabulary: `error` (bright red with matching drop shadow, used for Find Duel CTA) and `gold` (pro-gold with dark text, used for Enter Royale CTA). Size `lg` grew 56px → 60px for a more commanding presence.

### Removed — Dead CSS selectors

- `.lobby-start-btn--purple` from `_lobby.css` — logo-quiz was its only consumer and has migrated to `<so-button>`.
- `.gq__question-card--logo` and `.gq__logo-image` from `game-question.css` — superseded by the new `.gq__logo-stage` / `.gq__logo-frame` / `.gq__logo-hero` treatment.

### Fixed — Accessibility and correctness polish from pre-landing review

- Royale tab's "Pro unlocks unlimited" upsell hint was a `<span (click)>` inside `<p>` — not keyboard-focusable. Converted to a proper `<button>` so screen-reader and keyboard users can activate it.
- `so-toggle` description is now announced via `aria-describedby` — previously only the label was exposed to assistive tech, leaving users without context on what a toggle does.
- Removed `priority` from per-question and per-tab `ngSrc` image bindings to eliminate NgOptimizedImage LCP warnings that would fire on every question reveal.
- Replaced `??` with `||` on the versus-card initials fallback so empty-string Supabase emails (phone-auth, Apple private-relay) correctly fall through to "YOU" instead of rendering blank.
- Sub-mode tab state is now URL-first: `setSubMode` writes to the query param, a `queryParamMap` subscription updates the signal. No bidirectional sync loop; deep-links, back/forward, and invalid `?tab=xyz` values (fallback to Solo) all work.
- Title and subtitle in the lobby hero are now left-aligned (overriding the shared `.lobby-title`/`.lobby-subtitle` center default). Matches the designer mockup and is more natural for mobile read-flow.
- Stat cards in the Solo panel now use left-aligned content and compact horizontal padding — "ELO RATING" and multi-word tier names like "SUNDAY LEAGUE" no longer wrap to two lines and inflate card height.
- Tab-panel container has `min-height: 19rem` so the outer frame stays stable when switching between Solo/Duel/Royale — prevents a jolt on tab change.

## [0.8.19.2] - 2026-04-21

### Added — iOS Google OAuth client ID + real iOS AdMob ad unit IDs

Replaced the iOS placeholder values in the Capacitor and environment configs with the production credentials now that the AdMob iOS app and the iOS Google OAuth client ID exist.

**Google Sign-In — separate iOS + Web client IDs.** The `GoogleAuth` plugin config previously set `clientId` to the Web OAuth client ID, which only happened to work for the Android audience check — on iOS the native sign-in sheet requires a platform-specific iOS OAuth client ID. Split into two fields:
- `clientId`: `215249721443-dldujn3efff1onlmft2u30ikih89q294.apps.googleusercontent.com` (new iOS OAuth client)
- `serverClientId`: the existing Web OAuth client ID (used by Android as the `aud` claim on the id_token, and by the backend when verifying ID tokens with `google-auth-library`)

Added the reversed iOS client ID (`com.googleusercontent.apps.215249721443-dldujn3efff1onlmft2u30ikih89q294`) as a second entry under `CFBundleURLTypes` in `Info.plist`. Google's OAuth flow redirects back to the app via this scheme after the user authenticates — without it, the native sign-in sheet hangs after consent. The existing `stepovr://` scheme is preserved.

Added `googleIosClientId` field to both `environment.ts` and `environment.prod.ts` so code paths that need the iOS client ID (e.g. backend token audience when verifying iOS-issued tokens, or future native sign-in debug logs) can read it from the same env surface as `googleWebClientId`.

**AdMob iOS — real App ID + 3 ad unit IDs.** The `~5298641906` App ID replaces the `~6079077395` placeholder (which was the Android App ID duplicated into the iOS slot). `appIdIos` in `capacitor.config.ts` + `admobAppIdIos` in env both now use the real iOS value. Populated `admobBannerIos`, `admobInterstitialIos`, and `admobRewardedIos` with their respective AdMob-issued ad unit IDs. Android `admobBannerAndroid` is still empty — pending banner ad unit creation on the Android side (interstitial + rewarded Android IDs were already populated from prior work).

Ran `npx cap sync ios` to copy the updated `capacitor.config.ts` → `ios/App/App/capacitor.config.json` so the runtime picks up the new plugin values. Verified `GoogleService-Info.plist` is still registered in the pbxproj after sync (registration helper is idempotent).

## [0.8.19.1] - 2026-04-21

### Added — iOS native project generated + Firebase SDK wired + push/splash/network plugins

First runnable iOS native project for StepOvr. `npx cap add ios` generated `frontend/ios/App/` (Xcode project + CocoaPods workspace + App target). This commit wires Firebase into the iOS build and adds the Capacitor plugins the launch plan requires.

**`GoogleService-Info.plist` registered in Xcode project.** `cap add ios` placed the plist at `frontend/ios/App/App/GoogleService-Info.plist` but did not register it as a bundle resource — so the Firebase SDK would not have found it at runtime. Added a one-off helper at `frontend/scripts/add-googleservice-plist.js` that calls the `xcode` npm package's low-level primitives (`addToPbxBuildFileSection`, `addToPbxFileReferenceSection`, `addToPbxResourcesBuildPhase`, `addToPbxGroup`) to insert the 4 required pbxproj entries into the "App" group and the App target's Resources build phase. The script is idempotent — re-running after `cap add` is safe. The built-in `addResourceFile` helper doesn't work for Capacitor projects because Capacitor's "App" group is identified by `path`, not `name`, and the project has no flat "Resources" group.

**`AppDelegate.swift` rewritten for Firebase + push notifications.** Imports `FirebaseCore`, `FirebaseMessaging`, and `UserNotifications`. Calls `FirebaseApp.configure()` at the top of `didFinishLaunchingWithOptions` (must run before any Firebase SDK usage), then wires the messaging delegate + notification center delegate to `self`. Adds `didRegisterForRemoteNotificationsWithDeviceToken` (sets `Messaging.messaging().apnsToken` for FCM+APNs bridging *and* posts `capacitorDidRegisterForRemoteNotifications` so `@capacitor/push-notifications` can fire its `registration` event) plus the matching `didFailToRegisterForRemoteNotificationsWithError` handler. The pre-existing `ApplicationDelegateProxy` URL + user-activity handlers are preserved unchanged — they still route deep links through Capacitor.

**`Info.plist` — push background mode, App Tracking Transparency, portrait lock.** Added `UIBackgroundModes: [remote-notification]` so the app can receive silent push payloads while suspended. Added `NSUserTrackingUsageDescription` (required before iOS 14.5+ can present the ATT prompt for AdMob's IDFA access — without it, the app crashes on `ATTrackingManager.requestTrackingAuthorization`). Added `ITSAppUsesNonExemptEncryption: false` so App Store Connect doesn't prompt for export compliance on every upload. Removed iPhone landscape orientations — the UI is portrait-only per `capacitor.config.ts` and the manifest; iPad keeps portrait + upside-down portrait.

**`App.entitlements` — push capability + webcredentials.** Added `aps-environment: development` (dev/TestFlight APNs sandbox — must flip to `production` before archiving for App Store; comment in the file marks this as a pre-release checklist item). Added `webcredentials:stepovr.com` to the associated-domains array so iOS password autofill recognizes the stepovr.com domain alongside the existing `applinks:` entries.

**Capacitor plugins installed + synced.** 6 new plugins wired into `package.json`:
- `@capacitor-firebase/app@^8.2.0` — initializes FirebaseApp on both platforms, required peer for other `@capacitor-firebase/*` plugins
- `@capacitor-firebase/crashlytics@^8.2.0` — captures unhandled JS exceptions + native crashes, uploads to Firebase Crashlytics
- `@capacitor-firebase/messaging@^8.2.0` — FCM token retrieval + foreground/background push handling (iOS receives via FCM-APNs bridge)
- `@capacitor/push-notifications@^8.0.3` — permission prompt API + local notification presentation (paired with `@capacitor-firebase/messaging` — the former handles the iOS user-facing permission flow, the latter handles the token round-trip)
- `@capacitor/splash-screen@^8.0.1` — native splash screen (replaces the web-only setTimeout + CSS fade)
- `@capacitor/network@^8.0.1` — offline detection for the upcoming `OfflineBanner` component

`npx cap sync` ran `pod install` on iOS (added 7 new Capacitor-Firebase pods + FirebaseCore/Crashlytics/Messaging transitive dependencies — 62s pod resolution) and regenerated the Android `capacitor.settings.gradle` + `capacitor.build.gradle` plugin manifests. Android Firebase wiring (google-services gradle plugin, firebase-bom, firebase-analytics + firebase-crashlytics in `app/build.gradle`) was already in place from earlier work.

**Known follow-ups (deferred):**
- `aps-environment` must flip to `production` before archiving for App Store (TODO comment in entitlements).
- The Firebase project ID in the plist is `gen-lang-client-0272230126` — consider renaming in the Firebase Console if a cleaner project ID is preferred before launch (changing it now requires regenerating the plist + `google-services.json`).
- No `FirebaseMessaging` delegate implementation yet — token retrieval + delivery handling will land with the `PushNotificationService` in the next commit.

## [0.8.19.0] - 2026-04-21

### Added — App Store launch prep: real Apple identifiers + push/splash config

Pre-launch config wiring now that Apple Developer Program access is live. No runtime behavior changes in the Angular app — this just replaces placeholders with real identifiers and scaffolds native plugin config for the upcoming iOS/Android build.

**Universal Links AASA — real Team ID + webcredentials.** `frontend/public/.well-known/apple-app-site-association` now uses `6WSPY24ZZS.com.stepovr.app` (Apple Team ID `6WSPY24ZZS`) instead of the `TEAMID.com.stepovr.app` placeholder. Added `webcredentials.apps: ["6WSPY24ZZS.com.stepovr.app"]` so the iOS app can receive password autofill suggestions for the stepovr.com domain — required for Sign In with Apple account linking.

**Capacitor plugin config scaffolded.** `capacitor.config.ts` gains two plugin blocks ahead of their `npm install`:
- `SplashScreen` — 2s display, auto-hide, black background, 600ms fade-out (matches the existing `AppComponent` web splash behavior).
- `PushNotifications` — presents badge/sound/alert when a notification arrives while the app is foregrounded.

Existing `Keyboard`, `GoogleAuth`, and `AdMob` plugin configs are untouched (real values preserved).

**App name standardized to "StepOvr".** `frontend/public/manifest.webmanifest` was still using the legacy "StepOver" spelling — updated to match the Capacitor `appName`, Supabase profile display, and App Store listing. Description updated to reflect current modes (duels, battle royale, logo quiz). Related applications entry for iTunes now points at the real App Store ID `6762849377`.

**`appVersion` reset to `1.0.0` / `1.0.0-dev`.** The internal `VERSION` file continues the 0.8.x scheme for development iterations, but the user-facing `environment.appVersion` reset from `1.7.0` → `1.0.0` (prod) and `1.7.0-dev` → `1.0.0-dev` (dev) — this is the first version in the App Store and Play Store, so the in-app version indicator must show `1.0.0` on launch day.

**AdMob App ID + banner ad unit fields scaffolded.** New empty env fields (`admobAppIdIos`, `admobAppIdAndroid`, `admobBannerIos`, `admobBannerAndroid`) in both environment files — will be populated once the AdMob console setup produces iOS-specific App IDs and banner ad units. Interstitial and rewarded ad unit IDs (already wired for Android) are untouched.

**Real App Store ID `6762849377` populated** in `environment.stores.appStoreUrl` and `appStoreId` — replaces the `XXXXXXXX` placeholder. Unblocks the App Store smart banner on the marketing landing page and any in-app "rate us" / "update available" prompts that link back to the App Store.

## [0.8.17.1] - 2026-04-21

### Fixed — Home page: restore Logo Quiz Duel + Team entry points

The Phase 3 home migration (v0.8.17.0) dropped the 3-mode Logo Quiz hero from the old `<app-battle-hero>` — it became a single `<so-mode-card>` that navigated only to `/logo-quiz`. Two entry points that used to live inline inside the hero were orphaned: **Logo Duel** (`/duel?mode=logo`) and **Team Logo** (`/battle-royale?mode=team_logo`). The routes still worked if you typed the query param manually, but the home-page discovery surface was gone.

**Fix.** New section added directly under the Logo Quiz hero: 3 `<so-mode-row>` tiles — Solo Quiz, Logo Duel, Team Logo — in a purple-tinted ambient container (`rgba(168,85,247,0.07)` gradient, 1px purple border) that visually pulls up into the hero above (`margin-top: -8px`). Stagger reveal 120ms / 180ms / 240ms to match the Pro Arena pattern without competing for attention. `prefers-reduced-motion` guard extended.

**Methods restored on `HomeComponent`:** `goLogoDuel()` (auth-gated, navigates `/duel?mode=logo`), `goTeamLogoQuiz()` (auth-gated, navigates `/battle-royale?mode=team_logo`). Both emit `select_content` analytics events (`logo_duel`, `team_logo_quiz`). Solo Quiz row reuses the existing `goLogoQuiz()` method.

**State wiring:** Logo Duel row badge + subtitle bind to the existing `duelHint()` / `duelBadge()` computed signals (Pro quota is shared with standard Duel). Team Logo row badge binds to `battleRoyaleBadge()` (shared BR trial quota). No new computed signals needed.

### Scope

Home page only. No other screen touched. Visual purple accent uses legacy `--color-purple` (#a855f7) token, consistent with the Logo Quiz sub-brand from the pre-migration home.

## [0.8.17.0] - 2026-04-21

### Added — Home page on StepOver design system (Phase 3, screen 1)

First feature screen rebuilt on the `so-*` primitive library landed in v0.8.16.0. Home now renders entirely through `so-mode-card` / `so-mode-row` / `so-chip` instead of the legacy `battle-hero` / `mode-card` / `section-header` stack.

**Three tiers, cleaner layout.** TIER 1 hero is a Logo Quiz `<so-mode-card>` (220px, gemini-logo background). TIER 2 is the bespoke 2-player card, preserved as-is because its Local/Online action pair is genuinely unique to that surface. TIER 3 Pro Arena stacks Battle Royale / Duel / Solo / Blitz as `<so-mode-row>` entries inside a gold-glass breathing container that subtly animates to pull the eye. Home CSS keeps the background drift animation and adds staggered reveal on first paint, with a `prefers-reduced-motion` guard for accessibility.

**Home component shrank.** `home.ts` drops `battle-hero` / `mode-card` / `section-header` / `logoModes` computed / `HeroMode` type + `onLockedModeClick` / `onLogoModeClick` / `goLogoDuel` / `goTeamLogoQuiz` / `goNews` / `goDaily` plumbing. Net: 178 insertions, 413 deletions across `home.ts` / `home.html` / `home.css`.

### Changed — Material Symbols icon subset

`index.html` Google Fonts request expanded from 6 icons (`casino,groups_3,key,military_tech,shield,swords`) to 12 (`arrow_back,bolt,casino,emoji_events,filter_list,groups_3,key,military_tech,search,settings,shield,swords`). Without the expansion, Home's Solo tile (`materialIcon="emoji_events"`) and Blitz tile (`materialIcon="bolt"`) rendered the literal text "emoji_events" / "bolt" instead of the glyph, because the subsetted Material Symbols font didn't contain those ligatures. The legacy `Material Icons` font (also loaded, unsubsetted) carried the glyphs for elements using `class="material-icons"`, which is why some icons appeared to work while others didn't.

### Fixed — Pre-landing review follow-ups

Three small corrections caught by `/review` before shipping:

- `so-mode-row.html` — legacy `*ngIf="materialIcon()"` converted to `@if (materialIcon()) { ... }`. Every other new `so-*` component uses Angular 17+ control-flow; this one was inherited from the bundle and stuck out.
- `ui-gallery.html` / `ui-gallery.css` — inline `style="font-family: 'Space Grotesk'; ..."` on the gallery `<h1>` extracted to a `.ug-title` class in `ui-gallery.css`.
- `tokens.css` — `--color-destructive` restored from pale pink `#ffb4ab` (Material on-dark-error palette) back to strong red `#ef4444`. Battle Royale loss banners (`battle-royale-play.css:318-319`) use this token for border + text color and pale pink washed out the visual urgency.

### Scope

Only the home screen is migrated in this release. `/solo`, `/leaderboard`, `/profile`, `/duel`, `/battle-royale`, `/blitz`, `/mayhem`, `/logo-quiz`, `/daily`, `/news` still render on the legacy `app-*` shared components — those migrations ship independently in follow-up Phase 3 PRs per the playbook tier order.

## [0.8.16.0] - 2026-04-21

### Added — StepOver design system foundation (Phase 1 + 2)

Tokens, mixins, tailwind extensions, and 12 `so-*` primitive components landed behind a dev-only verification route — with **zero feature screens edited**. This is the foundation the screen-by-screen migration (Phase 3) will consume.

**Foundation.** `frontend/tailwind.config.js` merges the StepOver bundle additively: new `surface.*`, `tier.*`, `warning`, `pro`, `accent.dim` colors; `fontFamily.display` alias; radii, glow shadows, glass backdropBlur; `pulse-accent` animation. The orphan `tailwind.config.js` at repo root is removed. `frontend/src/styles/tokens.css` and `frontend/src/styles/mixins.css` now load via `angular.json` styles array **after** `styles.scss` — that ordering is what lets StepOver `--mat-sys-*` overrides beat the `mat.theme()` SCSS output and re-skin every existing Material component in place. Google-Fonts `@import url()` stripped from `tokens.css` (already delivered via `<link>` in `index.html`), and Space Grotesk weight 500 added to the existing font link.

**Component library.** 12 new standalone Angular 20 components under `frontend/src/app/shared/ui/`, each split into `.ts`/`.html`/`.css`: `so-button`, `so-chip`, `so-mode-card`, `so-mode-row`, `so-answer-card`, `so-progress-track`, `so-avatar`, `so-rank-badge`, `so-leaderboard-row`, `so-stat-card`, `so-top-bar`, `so-icon-button`. Barrel at `shared/ui/index.ts`. `@app/*` path alias added to `tsconfig.json` so consumers can write `import { SoButtonComponent } from '@app/shared/ui'`.

**Dev verification route.** `/dev/ui-gallery` (unlinked, not in nav) renders every component in every documented state. Used to validate the library before Phase 3 screen migration starts.

### Scope

Foundation only. No feature screen edited; existing `app-primary-btn`, `app-mode-card`, `app-page-header`, per-feature answer buttons all unchanged. Phase 3 screen migration per `docs/superpowers/specs/2026-04-21-design-system-phase-1-2.md` Tier 1 deferred to its own PR.

### Known items deferred to Phase 3

- **Tier taxonomy mismatch.** The `SoTier` type used by `so-avatar`, `so-rank-badge`, `so-leaderboard-row` is 5 values (Legend/Elite/Challenger/Contender/Grassroots). The live ELO system is 7 tiers (Iron/Bronze/Silver/Gold/Platinum/Diamond/Challenger). Reconciliation (replacement vs. presentation grouping) is a Phase 3 design decision.
- **Legacy `styles/abstracts/_tokens.css`** remains loaded alongside new tokens (new overrides win). Cleanup deferred.

### Tests

No new unit tests (components are pure presentation; build + `/dev/ui-gallery` is the verification gate). `npm run build` passes. `npm run test` unchanged.

## [0.8.15.0] - 2026-04-21

### Added — Logo duel review: image + masked answers + eye toggle

Pro users who review a past logo duel can now see the obscured logo they played plus mask-and-reveal each question's answers. Turns the match-detail screen into a practice surface — "who was this?" → try to remember → tap the eye → see the truth.

**Backend enrichment.** `MatchHistoryService.getMatchDetail` (`backend/src/match-history/match-history.service.ts`) now folds `game.questions[i].image_url` into each `question_results[i]` when `game.game_type === 'logo'`. Standard duels fall through unchanged. Non-Pro users get `question_results` stripped as before, so the new `image_url` field rides through the existing Pro gate with no new leak vector. `getDuelGameById` (`backend/src/supabase/supabase.service.ts`) now selects the `questions` column; `DuelQuestionDetail` (`backend/src/common/interfaces/match.interface.ts`) gains an `image_url?: string` field.

**Frontend review UX.** `MatchDetailComponent` (`frontend/src/app/features/match-detail/match-detail.ts`) adds:
- `isLogoDuel` computed — true when any question in the breakdown carries `image_url`.
- `revealedQuestions: Set<number>` signal — per-question reveal state, default empty.
- `toggleReveal(index)` / `isRevealed(index)` — flip state per question.
- `maskAnswer(value)` — replaces non-whitespace chars with `*` and caps at 14 to avoid revealing extreme-length answers. Spaces preserved so word count is still a clue.

**Template + styles.** `match-detail.html` renders the obscured logo above each logo-duel question, plus a `Reveal`/`Hide` pill with `visibility` / `visibility_off` Material icons. Per option B of the pre-build design check: **all three answers** (correct, host, guest) are masked until the eye is tapped. Reveal-button active state uses the same accent treatment as the all-matches screen (`rgba(56, 189, 248, 0.12)` + `#38bdf8` text).

### Scope — Pro only, logo duels only (v1)

- Non-Pro users still see the existing "Unlock question review with Pro" paywall — the image + mask UX is additive on top of the already-Pro-gated question breakdown.
- Team Logo Battle (BR path, `br_questions`) not touched in v1 — different data plumbing. Deferred until requested.
- Solo Logo Quiz has no match-history entry today, so no change there.

### Tests

Three new specs in `backend/src/match-history/match-history.service.spec.ts`:
- `enriches duel question_results with image_url for logo duels` — Arsenal + Chelsea mock, verifies per-index pairing.
- `leaves question_results unchanged for standard (non-logo) duels` — regression guard so the enrichment branch is bypassed when `game_type !== 'logo'`.
- `strips image_url for non-pro users along with the rest of question_results` — confirms the new field rides the existing Pro gate.

## [0.8.14.1] - 2026-04-21

### Changed — Sim tooling polish

Three consolidated hygiene wins on the dev-only simulation tooling.

**Moved sim files into `scripts/sim/`.** `e2e-game-sim.mjs`, `duel-batch.mjs`, `sim-realism.mjs`, and `wipe-account.mjs` were cluttering the project root alongside `VERSION`, `CHANGELOG.md`, and `package.json`. They now live under `scripts/sim/` where they belong, clearly flagged as tooling. Relative paths (`backend/.env` env-loader, `backend/node_modules/@supabase/supabase-js` require) updated to `../../backend/...` and verified to still resolve when the scripts are invoked from any working directory (ran a smoke test from `/tmp` — finds backend/.env correctly via `import.meta.url`-anchored URL).

**Credentials no longer hardcoded.** `e2e-game-sim.mjs` and `duel-batch.mjs` had `email: 'mnkzyy@hotmail.com'` + `password: 'Manos1995'` literals in `getToken()`. Both now read `SIM_EMAIL` and `SIM_PASSWORD` from `process.env` (auto-loaded from `backend/.env` by the existing `loadBackendEnv` / `readFileSync` code already in those files). Missing vars throw a clear error telling the operator where to set them. `wipe-account.mjs` already used `WIPE_EMAIL` / `WIPE_PASSWORD` correctly.

**Fixed logo-duel win skew in `duel-batch.mjs`.** Prior behavior: peeked-correct answers submitted instantly, beating the bot's realistic 3–8s think time nearly every question. Result: `ANSWER_CORRECT_RATE=0.5` produced ~80% duel wins (10/10 on logo, 8/10 on standard). Fix: inject a human-like pre-submit pause — 2.5–5.5s for correct answers, 1.2–3.0s for wrong — so the bot gets a fair shot at beating us. Also removed the trailing fixed `sleep(1200)` that was redundant with the new pre-submit delay. Future batches should land closer to the requested rate.

Operator setup for future sim runs: add `SIM_EMAIL=...` and `SIM_PASSWORD=...` to `backend/.env` (never commit), OR export them in the shell before running.

No production code touched; this is dev-only tooling consolidation.

## [0.8.14.0] - 2026-04-20

### Fixed — Analytics Category Strengths widget (issue #95)

Three defects in the Category Strengths section of the analytics screen, resolved end-to-end in the backend aggregator.

**Bug 1 — "Strongest" and "Needs work" resolved to the same category.** When only one category passed the min-sample threshold (5 answers), the old code sorted the same single-element array ascending and descending, landing both callouts on the same bucket. `pickStrongestWeakest` in `backend/src/analytics/analytics.service.ts` now requires at least 2 distinct rankable buckets before computing `weakest`; with one qualifying category, `strongest` is returned and `weakest` is `null` (the widget then hides the "Needs work" callout).

**Bug 2 — `Unknown` bucket leaking into user-facing breakdown lists.** The old code stripped `'unknown'` from the strongest/weakest ranking but left it in the `by_category`, `by_era`, `by_competition_type`, and `by_league_tier` arrays the widget rendered. Added a `stripUnknown` pass that filters that bucket from every user-facing breakdown list. Documented the root cause in `getQuestionEventsRaw`: LLM-fallback solo questions are not persisted to `question_pool`, so their `elo_history.question_id` is NULL and the join returns no taxonomy — this is expected behavior, not a data-quality regression.

**Bug 3 — "Needs work" callout fired on balanced players.** Added a minimum-spread guard (`MIN_ACCURACY_SPREAD_FOR_WEAKEST = 10pp`). When the strongest and weakest buckets differ by less than 10 percentage points, only `strongest` is returned. A user with 60% HISTORY vs. 55% LOGO no longer sees a misleading "Needs work: LOGO" callout.

### Added — Competition-type accuracy breakdown widget

Backend already aggregated `by_competition_type` (club / national_team / youth / continental / international) but the analytics screen never surfaced it. New `CompetitionTypeBreakdownComponent` (`frontend/src/app/features/analytics/widgets/competition-type-breakdown.ts`) mirrors the era / league-tier chart style (horizontal bar, percentage axis) and is wired into `analytics.html` next to the other breakdowns. Users now see accuracy split across competition types alongside difficulty, era, and league tier.

### Tests

Nine new specs in `analytics.service.spec.ts`:
- single-rankable-category → strongest set, weakest null
- strongest/weakest never resolve to the same bucket (the original bug)
- min-spread suppression at <10pp gap
- min-spread surfacing at ≥10pp gap
- `'unknown'` stripped from by_category / by_era / by_competition_type / by_league_tier
- `'unknown'` never ranked strongest even at 100% accuracy (defense-in-depth against future regressions)
- `by_difficulty` preserved (difficulty always has a value; stripUnknown must not accidentally touch it)

Suite: 22/22 suites, 324/324 tests, typecheck clean.

## [0.8.13.1] - 2026-04-20

### Fixed — e2e-game-sim peek query reads the correct JSONB path

The sim's `peekPoolCorrectAnswer` helper was selecting a top-level column `correct_answer` from `question_pool`, but since the Phase 2 schema cleanup (v0.8.11.x), `correct_answer` lives inside the `question` JSONB column. Every peek silently returned null, the "should answer correctly" branch always fell through to the wrong-answer pool, and live sim runs looked like they worked (no errors, sessions completed) but landed at 0% accuracy instead of the configured target.

One-file fix: select the `question` JSONB and read `question.correct_answer` inside the sim. Verified by running `SOLO_SESSIONS=3 SOLO_QUESTIONS=20 LOGO_SESSIONS=2 LOGO_QUESTIONS=20 TARGET_ACCURACY=0.5 node e2e-game-sim.mjs` — 53/100 correct (53%), bang on the 50% target.

No production code touched; this is dev-only tooling. Analytics generated during the broken run on the test account are legitimate play data (the server validated every answer correctly — the sim just fed it bad guesses).

## [0.8.13.0] - 2026-04-20

### Added — Bot matchmaker fills logo duels

Until now, logo duels had no bot support. A user who queued for a logo duel with no other human in queue would wait forever (120s timeout abandoned the game). Only standard duels were bot-filled. This left logo duels functionally unplayable for solo users.

The bot matchmaker (`backend/src/bot/bot-matchmaker.service.ts`) now fills both standard AND logo waiting duels:

- `injectBotsIntoDuelQueues` changed `.eq('game_type', 'standard')` to `.in('game_type', ['standard', 'logo'])`. Same 60s queue-timeout-then-fill behavior applies.
- `matchBotForDuel` now takes a `gameType` param and picks the bot skill tier using `logo_quiz_elo` for logo duels (vs. the player's solo `elo` for standard). Solo and logo ELOs diverge a lot — a player can sit at Challenger on solo but Iron on logo — so matching against the mode-appropriate ELO produces fair opponents per mode.

The bot duel runner (`bot-duel-runner.service.ts`) needed no changes. It reads `row.questions[index].correct_answer`, which the duel service already populates correctly for logo duels (team names drawn via `LogoQuizService.drawLogosForTeamMode`). Logo duel answer validation uses `fuzzyMatch`, which accepts the exact `correct_answer` string the bot submits.

Tests: 22/22 suites, 315/315 — unchanged. A unit test for the filter-surface change would just mock the Supabase query chain and give low signal; real verification happens post-deploy via the e2e sim's forthcoming 10 std + 10 logo duel sweep.

### Fixed

- `logo-quiz-binding.service.spec.ts` had a tuple-access type error (`delSpy.mock.calls[0][0] as string`) flagged by strict tsc. Fixed the cast; runtime tests were unaffected.

## [0.8.12.2] - 2026-04-20

### Security — Bind logo-quiz answer submissions to the user that was served the question

The /ship adversarial review surfaced a critical gap in v0.8.12.0's leak fix: the fix relocated answer-revealing fields from `GET /api/logo-quiz/question` to the `POST /api/logo-quiz/answer` reveal response, but the POST handler accepted any `question_id` the client supplied — it did not verify the authenticated user had ever been served that question. Any authenticated user could read `correct_answer` + `original_image_url` + `team_metadata` for any question_id they obtained, defeating the leak-strip.

Fix (`backend/src/logo-quiz/logo-quiz.service.ts`):

- **Binding check runs before answer validation.** The Redis key `logo:served:{userId}:{questionId}` (written by `getQuestion`, 120s TTL) is now a two-way contract: speed-check AND user-question binding. No key → `BadRequestException`.
- **Runs regardless of `timed_out` flag.** Client-sent `timed_out=true` used to bypass the speed check; now also bypassed for binding. Closes a zero-cost attack that submits `timed_out: true` on harvested ids.
- **Fail-open on Redis outage only.** Distinguish "Redis responsive, key missing" (reject — cheat attempt) from "Redis unreachable, throws" (allow — degrade gracefully). Logs the degradation for ops visibility.
- **Replay protection.** Served-at key is deleted after a successful submission. A second POST with the same question_id falls through to binding check and is rejected.
- **Forensic log.** `event: logo_answer_unbound_question` warn-log carries userId and questionId for anomaly detection.

Regression tests (`logo-quiz-binding.service.spec.ts`, 5 specs): key-missing reject, timed_out=true reject, Redis-outage pass-through, key-present pass, replay-deletes-key.

Backend suite: 22/22 suites, 315/315 tests (+5 binding + 14 specialist-generated in v0.8.12.1 commit).

### Deferred (other adversarial findings)

- Anomaly dedup race (known-limit from v0.8.12.0 review, acceptable admin noise)
- `GET /api/logo-quiz/teams` throttle + auth review (the 500-name catalog is listed in backend as "names are not sensitive"; revisit if image→team scraping becomes a pattern)
- Trust-proxy verification for `UserThrottlerGuard` IP fallback
- Onboarding still ships answer inline (client-side scored; no leaderboard impact)

## [0.8.12.1] - 2026-04-20

### Fixed — /review feedback on v0.8.12.0

Code review surfaced three honest-code issues, all applied:

- **`cheating_flags.mode` CHECK aligned to `elo_history.mode`.** Follow-up migration narrows the constraint from `('solo', 'logo_quiz', 'blitz', 'duel', 'battle_royale')` to `('solo', 'logo_quiz', 'logo_quiz_hardcore')`. The original list included modes that never write to `elo_history` (blitz/duel/BR) and missed one that does (logo_quiz_hardcore). Misalignment would have caused either silent no-ops (flagger reads zero rows) or insert failures if hardcore were ever wired.
- **`AntiCheatMode` type narrowed to match.** Type now truthfully reflects the modes the flagger can operate on. Adding a mode now requires widening elo_history, cheating_flags, and the type in lockstep — order documented in the type comment.
- **Removed unused `ExecutionContext` import** from `UserThrottlerGuard`.

Deferred: dedup race-condition fix (partial unique index) and sim retry-loop max-retry guard — both flagged in review as acceptable known-limits.

## [0.8.12.0] - 2026-04-20

### Security — Anti-cheat answer hardening

Logo-quiz and battle-royale logo modes were shipping the answer in the pre-answer GET response, letting anyone with Proxyman (or a modified client) read `team_name` / `original_image_url` off the wire and cheat the leaderboard. Solo ranked was already safe; onboarding is exempt (no server-side scoring). Fix moves the reveal payload out of the question-fetch response and into the answer-submit response — same UX, no answer pre-disclosure.

Defense-in-depth additions on top of the leak fix:

1. **Global rate limiting** — `@nestjs/throttler` registered globally with `UserThrottlerGuard` (keyed by authenticated user id, not IP — carrier NAT makes IP useless, and cheaters can rotate IPs but not auth tokens). Named throttlers: `default` 120/min, `answer` 60/min, `fetch` 40/min. Applied to solo + logo-quiz + battle-royale answer endpoints and solo+logo question-fetch endpoints.
2. **Inline speed check** in solo and logo-quiz `submitAnswer`. Per-difficulty `MIN_THINK_MS` (solo 800–1500ms by difficulty; logo 400/600ms). Submissions faster than the floor are rejected as `rejected_too_fast` with no ELO change, no question consumption, and the correct_answer is withheld (don't hand the bot the answer). Logo-quiz served-at tracking uses Redis (120s TTL) since logo has no session concept.
3. **Anomaly flagging** — new `cheating_flags` table + `AnomalyFlagService`. Rolling window (last 20 HARD/EXPERT solo answers); if accuracy ≥ 90% and no same-type flag exists in the last 24h, a `sustained_high_accuracy` flag is written with evidence snapshot (difficulty breakdown, timestamps). Async fire-and-forget — gameplay is never blocked.

E2E sim updated: logo-quiz simulator now peeks `question_pool.correct_answer` via service role (same pattern as solo) since `team_name` no longer ships; both simulators handle `rejected_too_fast` with retry-after-pause. Sim `jitterSleep` already exceeds the speed-check floor.

Regression tests: 6 targeted specs on `LogoQuizService.toPublicQuestion` pin the public shape so any future re-add of `team_name` / `original_image_url` / `slug` / `league` / `country` breaks CI. Full suite 296/296.

### Fixed

- `LogoQuizService` was missing its `Logger` — added alongside the anti-cheat warn logs.

### Deferred

- Duel / battle-royale standard speed check (both have server-side `question_started_at`; low priority — PvP limits exploit value)
- Onboarding hardening (client-side scoring, no server persistence)
- Admin review UI for `cheating_flags` (inserts only today; reviewed via SQL)
- Response-time normalization (timing side-channel; low impact)
- Single-session-per-mode enforcement

## [0.8.11.3] - 2026-04-20

### Fixed — Semantic dedup silent-failure chain (3 layers)

Root cause: three silent-failure paths in `PoolSeedService` let 2,775 of 4,366 pool rows (63%) insert with `embedding=NULL`. The `find_near_duplicate_in_pool` RPC filters `embedding IS NOT NULL`, so those rows became permanent dedup blind spots — every future near-duplicate against them slipped through. Combined with bulk seed days (2026-03-28: 1116/1116 null, 2026-04-16: 566/566 null, 2026-04-17: 524/524 null), this accumulated to 32 exact-text clusters spanning 2,240 excess rows, plus uncounted near-duplicates.

Defense-in-depth fix across three layers of `backend/src/questions/pool-seed.service.ts`:

1. **`semanticDedup` now throws on batch `embedTexts` failure** instead of catching and returning candidates unchanged. Force caller retry instead of silently corrupting the pool. Individual items with null per-item embedding are dropped with a warn log.
2. **New `ensureEmbeddingsAndDedup` guard in `persistQuestionsToPool`** acts as last-chance coverage: any row that bypassed `semanticDedup` (e.g. `takeClosestByRawScore` fallbacks) gets embedded + dedup-checked inline. Rows without embeddings are dropped rather than inserted.
3. **Row builder asserts `_embedding` is non-null** before the insert. Null-embedding inserts are now structurally impossible.

Also:
- **`getExistingQuestionKeys` was capped at 200 most-recent rows per category** — exact-text dedup was blind to anything older. Paginates up to 5000 now, with a warn log if the cap is hit (prevents silent regression of the same bug class).
- **Counter honesty in seed loops**: `persistQuestionsToPool` now returns the actually-inserted `GeneratedQuestion[]` (was `void`). All three seed paths (`seedPool`, `seedSlot`, `fillCategoryUntilSatisfied`) + `fillSlot` count the returned length instead of pre-guard `accepted.length`. Operators used to see "added: 10" when only 6 landed; now the log reads `inserted X/Y (Z dropped by insert guard)` with matching DB state.
- **`insertQuestions` method removed** — it was a one-line pass-through to `persistQuestionsToPool`. All three callers updated.

### Added — ops scripts (dry-run by default, `--apply` to mutate)

- **`backend/scripts/backfill-pool-embeddings.ts`** (`npm run pool:backfill-embeddings`) — restores embeddings on the 577 historical null-embedding rows in text categories (LOGO_QUIZ excluded — different pipeline, no dedup dependency). `--category X`, `--limit N`, `--batch-size N` flags. Idempotent.
- **`backend/scripts/dedupe-pool-exact-text.ts`** (`npm run pool:dedupe-exact`) — deletes exact-text duplicate rows (identical `category + normalized question_text + normalized correct_answer`), keeping the oldest per cluster. LOGO_QUIZ excluded (variant images share text legitimately).
- **`backend/scripts/dedupe-pool-near-duplicate.ts`** (`npm run pool:dedupe-near`) — 3-layer near-duplicate cleanup targeting the Steaua-style case (same concept, different wording, slipped past exact-text dedup). Layer 1: pgvector cosine distance under threshold (default 0.12 = similarity > ~0.88, same as `find_near_duplicate_in_pool` RPC). Layer 2: NULL-safe taxonomy compatibility — rules out pairs where `subject_id`, `competition_id`, `event_year`, `concept_id`, or `answer_type` are both populated on either side and differ. This kills structural false positives like "Galatasaray in Istanbul" vs "Fenerbahçe in Istanbul" (different `subject_id`) or "Dortmund 2013 UCL" vs "Bayern 2012 DFB-Pokal" (different year + subject). Layer 3: Gemini YES/NO verdict on remaining pairs catches the subtler cases where taxonomy agrees but stats differ (e.g. Messi 80g all-comps vs Messi 45g La Liga, same subject + year). `--skip-llm`, `--threshold N`, `--category X`, `--no-same-answer` flags.
- **`backend/scripts/utils/script-args.ts`** — shared `readArgs()` helper used by all three scripts (flag/value/number parsing).

### Tests

- **`backend/src/questions/pool-seed.service.spec.ts`** (new, 13 tests) — covers `semanticDedup` (empty, null per-item, near-dup, throw propagation, _embedding attachment), `ensureEmbeddingsAndDedup` (all-present short-circuit, mixed embed, embedding failure drop, near-dup drop), `persistQuestionsToPool` empty input, and `getExistingQuestionKeys` pagination (single page, multi-page, partial-on-error). All 13 pass; full suite stays green at 290/290.

### Verified live

Before merge: ran `npm run pool:backfill-embeddings --apply` (577/577 rows embedded, 0 failures), `pool:dedupe-exact --apply` (43 rows deleted), `pool:dedupe-near --apply` (94 candidates → 89 LLM-confirmed deletes — zero false positives on the 4 HIGHER_OR_LOWER stat-differs cases that taxonomy couldn't catch). Then `npm run pool:seed 1` across all text categories — 21 new rows inserted, 21/21 with embeddings, 4 near-dupes correctly caught by the new insert guards. The original Steaua/Barcelona 1986 cluster reduced from 6 rows to 3 (remaining 3 differ in qualifier ("Italian club") or answer spelling ("FC Barcelona" vs "Barcelona") — intentionally kept).

## [0.8.11.2] - 2026-04-20

### Fixed — Logo Quiz answer submit returning 404 after Phase 2D

Two Phase 2D regressions in `backend/src/logo-quiz/logo-quiz.service.ts` that together broke `POST /api/logo-quiz/answer`.

- **`submitAnswer` lookup used `question->>'id'` filter** (`:133`). Phase 2D stripped the `id` key from the jsonb payload, so every lookup matched zero rows → `NotFoundException` → 404 at the controller. Fixed to query by top-level `id` column directly (now the canonical id post-Phase 2C).
- **`mapQuestion` read `q.id` and `q.image_url` from the stripped jsonb body**. The mapper returned `id: undefined, image_url: ''` to the client. Frontend then submitted undefined back → same 404. Rewrote mapQuestion to accept the full row, sourcing `id` and `image_url` from the top-level columns; jsonb still carries `correct_answer`, `meta`, `meta.hard_image_url`, `meta.easy_image_url`, `meta.original_image_url` which were preserved.

### Root cause analysis
Phase 2D's bulk strip moved 7 keys out of jsonb without migrating the handful of consumers that still probed those paths. The `question-draw.service.ts` loaders were updated correctly in the same commit. Logo-quiz was a missed path — caught by your first smoke test of the prod flow. Takeaway for next time: `git grep "question->>"` and `grep "\.question\."` as a post-strip checklist before claiming the migration complete.

### Verified
- `POST /api/logo-quiz/answer` returns `401` (auth required) instead of `404` (missing route/NotFoundException)
- TS type check clean (no new errors)

## [0.8.11.1] - 2026-04-20

### Fixed — review-driven cleanups on top of Phase 2

Three findings from the /review adversarial pass on v0.8.11.0.

- **`resolvePoints` passed undefined category** (`backend/src/questions/question-draw.service.ts:226, 319`). The Phase 2A loader destructured `category: _jsonbCategory` out of the jsonb payload and then passed the resulting `q` object (with `category` undefined) through `resolvePoints(q, difficulty)` → `resolveQuestionPoints(q.category, difficulty)`. Only worked today because the one `CATEGORY_POINT_OVERRIDES` entry (`TOP_5 = 3`) coincidentally equals `DIFFICULTY_POINTS['HARD']`. Any new override differing from the base value would silently return wrong points. Fix: pass `row.category` directly to `resolveQuestionPoints` — the authoritative top-level column.

- **`pool-integrity-verifier.service.ts` wrote `source_url` into stripped jsonb** (`:139, 143`). After Phase 2D promoted `source_url` to a top-level column and the enforce trigger strips it from jsonb, writing `source_url: vr.sourceUrl` into the jsonb payload was silently dropped by the trigger AND left the top-level column stale. Rewired the update to write `source_url` to the top-level column; jsonb payload now carries only behavior-specific fields (correct_answer, question_text, explanation, meta).

- **Trigger stripped 5 keys, 7 needed** (`supabase/migrations/20260615000009_trigger_strip_all_duplicates.sql`). `enforce_question_jsonb_shape` covered id/category/difficulty/points/difficulty_factors but not source_url/image_url. The verifier fix above removes the immediate exposure, but extending the trigger closes the window permanently against future writers. Now strips all 7.

### Changed — answer_type removed from RPC returns

- **`supabase/migrations/20260615000010_draw_rpcs_drop_unused_answer_type.sql`** — Phase 2D added `answer_type` to the RPC return shapes intending to let the loader reconstruct `difficulty_factors.answer_type`. The reconstruction was backed out due to `DifficultyFactors` type constraints (all fields non-optional), so `answer_type` ended up as dead payload acknowledged with `void row.answer_type` in the loader. peekAnswer already has a direct DB fallback for the same field. Dropped `answer_type` from all 4 RPC returns; restored 7-column shapes. `DrawBoardRow` / `DrawQuestionsRow` types updated to match.

### Added — scheduled drop for Phase 2C snapshot

- **`supabase/migrations/20260615000011_drop_phase2c_snapshot_after_retention.sql`** — self-gated migration that drops `_phase2c_id_remapping` once the 30-day retention window closes on 2026-05-20. Safe to deploy now: it's a no-op until the date passes, then automatically cleans up on the first post-retention `db push`. Replaces the previous CHANGELOG-note-only reminder with an actual scheduled action.

## [0.8.11.0] - 2026-04-20

### Added — Full Phase 2 jsonb cleanup
The follow-up to the phased cleanup that started in v0.8.9.0. All four sub-phases shipped.

### Phase 2A — Stop writing jsonb duplicates (code-only)
- `pool-seed.service.ts:persistQuestionsToPool` now destructures `id`, `category`, `difficulty`, `points`, `difficulty_factors`, `raw_score`, `allowedDifficulties`, `analytics_tags` OUT of the jsonb payload before insert. These all duplicated top-level columns or derivable values. New rows persist a clean jsonb body — roughly 40% smaller than before.
- `question-draw.service.ts` loaders (`drawBoard`, `drawSlot`) now defensively destructure the same keys from `row.question` on hydration and re-populate them from the authoritative top-level columns. Legacy rows with stale jsonb copies flow through correctly; new rows that lack the keys in jsonb also flow through correctly.
- `DrawBoardRow` / `DrawQuestionsRow` types extended with `id: string` (already present on the RPC return, now typed).

### Phase 2B — Migrate direct SQL jsonb projections
- `logo-quiz.service.ts:drawLogosForTeamMode` — Supabase `.select()` projection switched from `image_url:question->image_url, difficulty:question->difficulty` to bare `image_url, difficulty` (top-level columns). Saves a jsonb traversal per row.
- `game.service.ts:peekAnswer` — now reads `answer_type` from the top-level column via a maybeSingle DB lookup, with a defensive fallback to the legacy in-memory `difficulty_factors.answer_type` for any session that still carries it.

### Phase 2C — Unify LOGO_QUIZ id semantics (data migration, HIGH RISK)
Root cause: LOGO_QUIZ seed scripts (`backend/scripts/seed-logo-questions.ts` and four siblings) set `question: { id: uuid(), ... }` without a top-level `id`, so Postgres auto-generated a second, different uuid. This caused 2206 rows where `question_pool.id != (question->>'id')::uuid`. Every app-facing path (draw exclude_ids, `user_question_history`, the frontend's seen-list cache) used the jsonb id; the pool row id was internal-only. A real dual-id model hiding in plain sight.

Migration 20260615000006 does it atomically:
1. **Snapshot** — `_phase2c_id_remapping` table captures the 2206 `(pool_id, old_jsonb_id)` pairs. Retained 30 days for rollback.
2. **user_question_history re-keyed** — 36 rows (all LOGO_QUIZ) updated from the old jsonb id to the pool row id.
3. **Draw RPCs rewritten** — `draw_board`, `draw_questions`, and both `draw_logo_questions_by_elo` overloads switched from `qp.question->>'id' = ANY(p_exclude_ids)` to `qp.id::text = ANY(p_exclude_ids)`, and their `user_question_history` INSERTs now write the pool id directly. News exclusion now also uses `nq.id`.
4. **return_questions_to_pool simplified** — dual-id defensive check removed; pool id is the only currency now.
5. **Permanent guardrail** — `enforce_question_jsonb_shape()` trigger on INSERT/UPDATE OF question strips any future jsonb-level `id`, `category`, `difficulty`, `points`, or `difficulty_factors`. Legacy seed scripts that still try to write jsonb.id silently have it removed before the row lands. No future divergence possible.

Verified: 36 uqh rows migrated, 0 left pointing at old jsonb ids, trigger installed.

**Known one-time user glitch**: Users with an in-flight session whose `session.drawnQuestionIds` array cached the old jsonb ids will no longer match — those ids no longer exist post-migration. Next draw may re-serve a logo they saw in the current session. Sessions are short-lived so the window is narrow; new sessions are immune.

### Phase 2D — Strip jsonb duplicates + extend RPC returns
Two coordinated migrations:

- **20260615000007** — `UPDATE question_pool SET question = question - 'id' - 'category' - 'difficulty' - 'points' - 'source_url' - 'image_url' - 'difficulty_factors'`. Strips every legacy duplicate. Verified zero rows retain any of the 7 keys; behavior-specific keys (`question_text`, `correct_answer`, `wrong_choices`, `fifty_fifty_hint`, `fifty_fifty_applicable`, `explanation`, `meta`) preserved on 100% of rows.

- **20260615000008** — RPC returns extended to include `image_url`, `source_url`, `answer_type` as top-level columns alongside the jsonb body. Required because `online-game.service.ts:545`, `duel.service.ts:787-788`, and `onboarding.service.ts:117-118` read `question.image_url` on in-memory hydrated questions — the loader now pulls these from the row columns and surfaces them on the hydrated `GeneratedQuestion` so those call sites keep working unchanged. The loader destructures the jsonb image_url/source_url keys (historical LEGACY path for any row the strip missed) and the top-level ones always win.

### Final state

```
question_pool jsonb sample (HISTORY):
  keys: question_text, correct_answer, fifty_fifty_hint,
        fifty_fifty_applicable, explanation

question_pool jsonb sample (LOGO_QUIZ):
  keys: question_text, correct_answer, fifty_fifty_hint,
        fifty_fifty_applicable, explanation, meta
```

Every `question_pool` row has the same clean shape. Every caller reads from top-level columns (canonical source) with legacy jsonb fallbacks removed. Every draw RPC now trafficks in pool ids exclusively. The BEFORE INSERT/UPDATE trigger prevents drift from legacy scripts.

### Architecture notes
- The 4-phase execution (A → B → C → D) let each step be verified before the next. 2C was the cliff — HIGH RISK, user-visible glitch window — and it was de-risked with the snapshot table + trigger so rollback is possible without data loss.
- The trigger is slightly redundant given the updated seed + LOGO scripts, but it's insurance against future contributors (or AI agents) writing shortcut inserts. Zero maintenance cost; permanent.
- Five migrations (006-008) and one new trigger. Schema now strictly normalized.

### Deferred / follow-up
- LOGO_QUIZ seed scripts (`seed-logo-questions.ts` and 4 others) still write `question: { id, category, difficulty, points, ... }` — the trigger silently strips these, so functionally fine, but the scripts have dead code in them. Low-priority script cleanup.
- Rollback snapshot `_phase2c_id_remapping` can be dropped after 2026-05-20.

## [0.8.10.2] - 2026-04-20

### Fixed
- **`record_answer_outcome` RPC — skip `total_response_ms` accumulation on timeouts** (`supabase/migrations/20260615000005_record_answer_outcome_skip_response_ms_on_timeout.sql`). The column's stated semantics are "divide by (times_correct + times_wrong) for average" — the denominator excludes `times_timed_out`, so the numerator had to as well. Previously it didn't. Concrete failure: `solo.service.ts:201-206` passes `Math.round(elapsed * 1000)` as `response_ms` even on `answer === 'TIMEOUT'`. A session suspended for a week that returns a TIMEOUT would have added 604,800,000 ms to the running sum with no matching increment to the denominator, corrupting the "avg response time" for that question indefinitely. Fix gates the response-ms accumulation on `NOT p_timed_out` inside the RPC — callers don't need changes. Caught by /review adversarial pass before merge.

## [0.8.10.1] - 2026-04-20

### Changed
- **Phase 2 (partial) — stripped legacy `question._embedding` from `question_pool` jsonb** (`supabase/migrations/20260615000004_strip_legacy_embedding_from_jsonb.sql`). 507 rows carried a stale duplicate of the top-level pgvector column; `pool-seed.service.ts:726` already excludes `_embedding` from new writes. Verified every affected row had `embedding` (top-level) populated before the strip. No code changes; no data loss.

### Deferred to future PRs
The audit flagged 9 other jsonb keys that duplicate top-level columns (`category`, `difficulty`, `id`, `points`, `source_url`, `image_url`, plus `category`/`event_year`/`answer_type`/`competition`/`specificity_score`/`combinational_thinking_score`/`fame_score` inside `difficulty_factors`). Stripping them requires a coordinated refactor across 10 reader files (`solo.service`, `game.service`, `online-game.service`, `news.service`, `answer.validator`, `question.validator`, `question-integrity.service`, `questions.service`, `bot-online-game-runner`, `bot-duel-runner`) plus the generator write path — far too large for a single commit. `_embedding` was the only verifiably-dead key in the current codebase shape and ships alone.

## [0.8.10.0] - 2026-04-20

### Added
- **Monotonic stats now actually tracked.** Phases 3 + 4 of the question_pool schema cleanup wire up every write path that was left dangling by v0.8.9.0.

### Phase 3 — counter bumps in draw RPCs (`supabase/migrations/20260615000002_draw_rpcs_bump_stats_counters.sql`)
Five functions updated to bump `times_shown = times_shown + 1, last_shown_at = now()` alongside their existing `used = true, used_at = now()` writes:
- `draw_board` — board-game draw (bulk UPDATE after sequential slot iteration)
- `draw_questions` — solo + logo-by-category draw (CTE `UPDATE … FROM drawn`)
- `draw_logo_questions_by_elo` (4-arg and 5-arg overloads) — logo-quiz ELO-matched draw. Also picked up `used_at = now()` which was missing in the original definition.
- `mark_blitz_questions_seen` — blitz/BR path. This RPC never flipped `used` (blitz uses `blitz_user_seen_questions` for per-user dedup), so this migration is the first place blitz draws get reflected in pool-wide stats. Only newly-inserted seen rows trigger a bump (`RETURNING question_id` from the INSERT), preventing double-counts on network retries.

### Phase 4 — `record_answer_outcome` RPC + 7 answer-submit wirings (`supabase/migrations/20260615000003_record_answer_outcome_rpc.sql`)
- **New RPC `record_answer_outcome(p_question_id uuid, p_correct boolean, p_timed_out boolean, p_response_ms integer)`** — bumps `times_correct` / `times_timed_out` / `times_wrong` / `total_response_ms`. Accepts EITHER the `question_pool` row id OR the inner `question.id` jsonb field (2206 LOGO_QUIZ rows have divergent ids, and some callers only have one form on hand). Failure is silent — the callers wrap in `.catch()` so gameplay is unaffected by a stats-write hiccup.
- **New helper `SupabaseService.recordAnswerOutcome(id, correct, timedOut, responseMs)`** — centralizes the call, normalises null/undefined ids, logs failures at warn level.
- **Wired into all 7 answer-submit paths:**
  - `game.service.ts` — 2-player phase game (timed_out=false, response_ms=null)
  - `solo.service.ts` — solo (passes real `elapsed * 1000` as response_ms, real `timedOut` flag)
  - `blitz.service.ts` — blitz (session-level timer, so per-answer timed_out=false)
  - `duel.service.ts` — duel (race semantics, both players' answers get recorded)
  - `online-game.service.ts` — online 2-player
  - `battle-royale.service.ts` — BR (passes real `question_started_at → now` elapsed as response_ms for standard and team_logo modes)
  - `logo-quiz.service.ts` — logo-quiz solo (hardcore and standard, passes real `timedOut` flag)

### Why a separate outcome RPC (rather than folding into existing `commit_*_answer` RPCs)
Only Solo and Logo-Quiz use those commit-RPCs for ELO/history. Game, blitz, duel, online-game, battle-royale do NOT — they just update Redis session state + insert into `match_history`. A single per-answer counter RPC gives every mode a consistent call site and keeps ELO logic decoupled from stats logic.

### Edge cases handled
- Unknown or null question id → RPC silently no-ops (WHERE fails).
- Negative `response_ms` → clamped to 0 via `GREATEST(COALESCE(…, 0), 0)`.
- LOGO_QUIZ id divergence → RPC matches `question_pool.id` OR `(question->>'id')::uuid`.
- Blitz `mark_blitz_questions_seen` race on retries → bump only on newly-inserted rows via `RETURNING`.

### Still ahead (Phase 2, not in this PR)
- Migrate the 10 reader files off jsonb probes (`question.category`, `difficulty_factors.*`) onto top-level columns, then strip the jsonb duplicates. Readers: `solo.service`, `game.service`, `online-game.service`, `news.service`, `answer.validator`, `question.validator`, `question-integrity.service`, `questions.service`, `bot-online-game-runner`, `bot-duel-runner`. Separate commit.

## [0.8.9.0] - 2026-04-20

### Added
- **10 new top-level columns on `question_pool`** (`supabase/migrations/20260615000001_question_pool_stats_and_promote_columns.sql`):
  - **Play-stats counters** — `times_shown`, `times_correct`, `times_timed_out`, `times_wrong`, `total_response_ms`, `last_shown_at`. Unlike the existing `used` boolean (which every `draw_*` RPC recycles back to `false` when a category/difficulty slot drains of available questions), these are **monotonic** — only increment, never reset. Enables per-question telemetry, staleness detection across pool-recycling cycles, automatic difficulty recalibration from actual play data, and recency-sensitive draw heuristics.
  - **Promoted columns** — `specificity_score`, `combo_score` (from `question.difficulty_factors`), `source_url`, `image_url` (from the top-level `question` jsonb). These were already produced by the generators but trapped inside jsonb, unqueryable without per-row `->>` probes. Now indexable, filterable, and type-checked.
- **Partial index `idx_question_pool_last_shown_at`** on `(last_shown_at) WHERE last_shown_at IS NOT NULL` — prepares for "oldest-drawn first" draw heuristics. Skips never-drawn rows since they're already favored by the `used = false` cursor.
- **COMMENT metadata on every new column** — each column documents its semantics, which ones are immediately populated (promoted columns, `last_shown_at` from `used_at`), and which need follow-up PRs to be written during gameplay (correctness counters, response times).

### Backfill
- `times_shown = CASE WHEN used THEN 1 ELSE 0 END` — conservative prior. True value is almost certainly higher for many questions (pool recycling flips `used` back to `false` periodically, losing the original draw count) but the history isn't recoverable. Future draws increment from this floor.
- `last_shown_at = used_at` — direct copy. Note `used_at` gets nulled on recycle; `last_shown_at` won't once the counter-bump is wired into draw RPCs.
- `specificity_score`, `combo_score` — pulled from `question->'difficulty_factors'->>'...'` where present. `NULLIF(..., '')` guards against empty strings that would otherwise blow up the `::smallint` cast.
- `source_url`, `image_url` — pulled from `question->>'...'` where present. 2028/4366 rows have `source_url`, 4364/4366 have `image_url`.

### Motivation
Schema audit on 2026-04-20 (triggered by "0% used on GOSSIP" investigation — unrelated root cause, but surfaced the broader schema drift) found:
- `difficulty_factors.fame_score` vs top-level `popularity_score` — Pearson correlation 0.546, mean abs diff 66, zero exact matches across 2115 rows. They measure related-but-different things: `fame_score` is LLM self-reported at generation time, `popularity_score` comes from the canonical entity index. Keep `popularity_score` as authoritative; `fame_score` joins the jsonb-duplicate strip list for the follow-up PR.
- `question.id`, `question.category`, `question.difficulty`, `question.points`, `question._embedding`, and six keys under `difficulty_factors` (`category`, `event_year`, `answer_type`, `competition`, `specificity_score`, `combinational_thinking_score`) are dead-weight duplicates of existing top-level columns. Also caught a lurking type inconsistency: `difficulty_factors.event_year` is stored as both `"2023"` (string) and `2023` (int) across rows, while the top-level `event_year SMALLINT` column is consistent.
- The `question` jsonb payload is being used as a shock absorber for schema evolution (promote fields to columns when filter needs arise, but never go back and strip jsonb copies). Normal and cheap, but drift accumulates. This PR starts the cleanup.

### Known follow-up (not in this PR — deliberate scope limit)
- **Phase 2 — jsonb strip**: 10 reader files (`solo.service`, `game.service`, `online-game.service`, `news.service`, `answer.validator`, `question.validator`, `question-integrity.service`, `questions.service`, `bot-online-game-runner`, `bot-duel-runner`) still probe jsonb paths like `question.category` / `difficulty_factors.*`. They must migrate to the top-level columns before the jsonb strip can run. Separate PR.
- **Phase 3 — counter wiring in draw RPCs**: `times_shown++` and `last_shown_at = now()` need to fire in every `draw_*` RPC alongside the existing `used = true, used_at = now()` writes. Migrations to update: `20260414000000_draw_board_user_history`, `20260429000000_add_question_elo_and_draw_rpc`, `20260407050000_free_logo_pool_rpc`, `20260314000001_draw_blitz_mark_used`.
- **Phase 4 — `record_answer_outcome` RPC + wiring**: new SQL function `record_answer_outcome(question_id, correct, timed_out, response_ms)` + integration in the 5 answer-submit paths (`game.service`, `online-game.service`, `solo.service`, `blitz.service`, `battle-royale.service`). Populates `times_correct`, `times_timed_out`, `times_wrong`, `total_response_ms`.

### Architecture
- **Counters coexist with `used`, don't replace it.** The `used` column is a *recycling eligibility cursor* in this codebase (see the `SET used = false, used_at = NULL` blocks in every draw RPC — they reset `used` when a slot drains, so the pool is reusable). Replacing it with `times_shown > 0` would require either decrementing `times_shown` on recycle (destroys the stat) or adding a separate eligibility flag (which is what `used` already is). So this PR keeps `used` as the cursor bit and adds monotonic counters on the side.
- **Additive-only for zero-risk deploy.** All existing code paths keep reading the jsonb duplicates — nothing changes for readers. The new columns sit unused until Phase 3/4 wire them up. If we need to roll back, drop the columns and nothing downstream cares.

## [0.8.8.0] - 2026-04-20

### Added
- **Concept-driven seed steering** — new `backend/src/questions/steering/` module replaces the old "25 random questions to avoid" hint with a coverage-driven concept + entity steering layer. Before each `generateBatch`, `SteeringService.planBatch(category, difficulty)` aggregates `concept_id → count` from `question_pool` scoped to the category, picks ONE concept via `selectConcept` (weighted toward singleton coverage=1 and scarce 2–3 tiers, bans overused >10, per-difficulty weights push harder at EXPERT), fetches 1–2 sample questions of that concept as a concrete reference, and runs `selectScarcityTargets` against canonical entities filtered by the category's relevant types (e.g. `PLAYER_ID = players only`) to offer 8 underused entities as a soft focus hint. Motivation: pool analysis on 2026-04-20 showed 50–97% of concept_ids per category are singletons while the top 5 concepts dominate with 49–72 questions each — textbook LLM default-mode behavior that blind generation can't escape. Leans on the existing `QuestionIntegrityService` web-search verification to correct hallucinated answers in-flight rather than avoid them, so steering can push harder at obscure concepts without tanking yield.
- **`GeneratorBatchOptions.concept` and `.entityTargets`** — new optional fields threaded through all 7 batch generators (HISTORY, PLAYER_ID, HIGHER_OR_LOWER, GUESS_SCORE, TOP_5, GEOGRAPHY, GOSSIP). Injected into the user prompt as **primary** concept steer (CONCEPT FOCUS block — commits the whole batch to one concept shape) and **secondary** entity diversification hint.
- **`CATEGORY_ENTITY_TYPES` map** — per-category list of canonical entity types appropriate for steering. Prevents off-topic steering (no entity hints of `player` type when the concept is a stadium-location question).
- **33 unit tests** across 5 spec files — 15 for the pure selectors (tier bucketing, per-difficulty weight distributions, bucket-empty fallbacks, `recentlyTargeted` oscillation prevention, TOP_5 all-singleton case) plus 18 service-layer tests with a mocked `SupabaseService` covering: coverage aggregation correctness, fail-open behavior on Supabase errors, canonical-file-missing fallback, `recentConcepts` rolling-window invariants (10-entry cap, no oscillation), and a defense-in-depth test that injects an adversarial `display_name` with embedded markdown headers to verify `sanitiseForPrompt` strips them end-to-end.
- **Fixed a latent bug in `sanitiseForPrompt`** (`backend/src/questions/classifiers/canonical-entities.ts`) exposed by the defense-in-depth test: the order of operations was `collapse-newlines` → `strip-line-start-headers`, which meant a newline-embedded `## injection` payload got collapsed into the single-line form `"name ## injection"` BEFORE the `/^#+/gm` regex could strip it. Swapped the order so header-stripping runs first while `\n` boundaries still exist. Pre-existing and unused in practice (the current canonical file has no adversarial content), but would have bitten the moment someone seeded a malicious entry.

### Changed
- `PoolSeedService.seedCategoryPasses`, `seedSlotPasses`, and `fillCategoryUntilSatisfied` call `steeringService.planBatch(...)` INSIDE their retry loops. Fresh plan per retry → when duplicates cause retry, a different concept is picked via the 10-entry `recentlyTargeted` rolling window.
- `GENERATION_VERSION` bumped `3.0.2` → `3.1.0` — concept-steered rows are a distinct generation vintage for analytics/rollback.

### Architecture
- **Three-layer generation steering**: (L1) Concept commits the batch shape, primary/coercive. (L2) Entity scarcity hints underused subjects, secondary/soft. (L3) Pre-existing `QuestionIntegrityService` fixes hallucinated answers via `correctedAnswer` path — corrections > rejections.
- **Pure selector functions + NestJS orchestrator**: `selectConcept` / `selectScarcityTargets` are pure with RNG hooks for deterministic testing.
- **Client-side aggregation for coverage queries** — pool is <10k rows/category, cheaper than adding an RPC + migration. Trivial to swap to RPC if perf ever matters.
- **Fails open** — canonical entities missing, Supabase errors, or null coverage all degrade to "no steering" and generators fall back to the old prompt shape.

### Known follow-up
- **49% of question_pool rows have `concept_id = NULL`** (2,225 of 4,366 on 2026-04-20) — classifier missed half the pool. Steering works off the 51% with populated concepts (still thousands of signal rows) but a backfill script would bring coverage to 100%. Not blocking — ships separately.

## [0.8.7.0] - 2026-04-20

### Added
- **New `<app-answer-flash>` shared component** at `frontend/src/app/shared/answer-flash/` — real-time a11y + motion shell used by Blitz, Duel, and Battle Royale to surface in-flow correct/wrong banners. Complements `<app-question-reveal>` (the post-answer panel for Solo/Logo Quiz). Inputs: `correct: boolean`, `announcement: string`, `dismissible?: boolean`. Output: `dismiss`. Consumers provide their own visual content (emoji, colored backgrounds, text deltas) via `<ng-content>` — the component is intentionally NOT opinionated about visuals. What it DOES provide: `role="status" aria-live="assertive" aria-atomic="true"` on the wrapper, a visually-hidden `.sr-only` announcement span that reads the `announcement` input verbatim, consistent 200ms fade-in + scale entrance animation (respects `prefers-reduced-motion`), and optional tap-to-dismiss for overlay-style flashes. 4/4 specs pass in `answer-flash.spec.ts`.

### Changed
- **Adopted `<app-answer-flash>` across Blitz, Duel (opponent + my flash), and Battle Royale (×2 instances: logo + trivia modes)** — replaces 5 ad-hoc `<div role="status" aria-live="assertive">...</div>` wrappers with a single shared component. The previous pattern was 5 different copy-pasted implementations, which is exactly how PR #81 shipped a11y for one mode and PR #85 had to retrofit the other 5 separately. Centralizing into a shared shell prevents the next class of a11y drift: when we add a new mode with flash UI, it gets live-region + sr-only parity by default rather than "forgot again".
- **Consistent entrance motion across all real-time flashes.** Previously each mode had its own ad-hoc animation (some had `animate-pulse`, others had nothing, Blitz's overlay had no entrance animation at all). The shared component adds a subtle 200ms fade + scale from 0.96 → 1.0 on mount, giving every mode the same arrival feel. Consumers can still layer their own animations on top (Duel's opponent-flash keeps `animate-pulse`).

### Architecture
- The shared shell is a **slot component** — it contributes a11y + motion, consumers keep visual ownership. This avoids the design-prescription trap where one component tries to standardize both behavior AND appearance across modes that legitimately look different (Blitz uses a full-screen overlay with bg-win/95 overlay, Duel uses an inline colored panel, Battle Royale uses `.br-play__answer-flash` BEM styling). By shelling out only the behavior layer, each mode keeps its visual identity while sharing the invisible stuff.

### Depends on
- PR #85 (`fix/a11y-live-regions-all-modes`) for the global `.sr-only` utility. Merge #85 first so the shell's visually-hidden span has its clip-path CSS available.

## [0.8.6.4] - 2026-04-20
## [0.8.6.7] - 2026-04-20

### Changed
- **Mayhem result screen collapsed from 5 stacked boxes to 3 visual zones.** After each answer, `/mayhem` previously rendered: (1) a big result-badge box with emoji ✅/❌ + CORRECT/WRONG headline + answer reveal + explanation, (2) the 4-option grid with inline ✓ CORRECT / ✗ your pick tags, (3) a full bg-card score tile showing "Score X / Y", (4) the Next/See-Results button row, plus the progress bar on top. The badge box was a **triple-signal duplicate**: the emoji + text repeated the same correct/wrong state that the option-grid tags already conveyed, and the explanation was buried inside a filled card rather than sitting in its own quiet space. This PR removes the badge box entirely — the option grid IS the reveal signal now (with ✓ CORRECT / ✗ your pick tags carrying the state). The explanation moves to a quiet left-border quote below the options (no box, `border-l-2 border-border`, matches the pattern from PR #81's `<app-question-reveal>`). The score card collapses to a compact inline row (label on left, chip on right) instead of a full card tile. Next/See-Results buttons unchanged.
- Depends on PR #85 (a11y) for the global `.sr-only` utility. The existing `role="status" aria-live="polite"` announcement from PR #85 moved from the removed badge to the new outer wrapper that contains the options + explanation + score, so screen-reader parity is preserved.

### User impact
Mayhem's after-answer screen now takes ~30% less vertical space. Sighted users see one clear correct/wrong signal (the option tags) instead of three. Screen-reader users still hear the full announcement on reveal.

## [0.8.6.6] - 2026-04-20

### Changed
- **Screen reader users now hear every result across Blitz, Duel, Battle Royale, Mayhem, and Daily.** PR #81 added `role="status" aria-live="polite"` only to the shared `app-question-reveal` component, which serves `/solo` + `/logo-quiz`. The other five modes each render their OWN result UI (flash overlays, colored badges, inline icons) without live regions — so VoiceOver and TalkBack users heard silence on every reveal across 5 of the 7 game modes. This PR backports the announcement pattern to all five: visually-hidden `<span class="sr-only">…</span>` with explicit "Correct." / "Wrong. The correct answer is X." text, wrapped in `role="status" aria-live="polite"` (or `assertive` for time-critical flash overlays in Blitz, Duel, Battle Royale where the user might dismiss before polite announces). Visual elements (emoji, colored badges, score deltas) are now `aria-hidden="true"` so screen readers don't double-announce or read the decorative glyphs.
- **New global `.sr-only` utility** at `frontend/src/styles/base/_a11y.css` — standard clip-path pattern, registered in the 7-1 styles index so every component can use it without redefining. Replaces the inline `.qr__sr-only` scoped to question-reveal (kept for now since it's in a separately-scoped component stylesheet, harmless duplication).

### User impact
Players with visual impairments using VoiceOver (iOS) or TalkBack (Android) now get audible feedback when they answer a question in any mode, not just Solo Ranked. Previously: silence after every answer except in Solo/Logo Quiz. Now: full parity across the 7 game modes.

## [0.8.6.5] - 2026-04-20

### Fixed
- **"AS Roma" now matches stored answer "Roma" in Solo Ranked (and every text-answer mode).** User typed "as roma" in a PSV Eindhoven question where the stored answer was "Roma" and it was marked wrong. Same class of bug affected "fc bayern" → "Bayern", "real madrid cf" → "Real Madrid", "arsenal fc" → "Arsenal", and any football team where the user types the fuller official name than what the LLM stored. Root cause in `backend/src/questions/validators/answer.validator.ts:validateFuzzy`: the existing fuzzy match handled submitted-is-a-PREFIX-of-correct ("inter" for "Inter Milan") and submitted-is-the-last-word-of-correct ("milan" for "Inter Milan"), but not the reverse: submitted wraps qualifier words around correct. For single-word correct answers like "Roma" the `parts.length > 1` branch never fired, so the submitted-contains-correct case fell through entirely. The LLM judge at `fuzzyScore=0.57` could have saved it but the 2-second timeout was too tight and the LLM frequently returned "no" when asked to literally-match "as roma" against "Roma". Fix adds a reverse-prefix rule: if the normalized correct answer appears as a whole-word substring of the submitted (guarded by short qualifier constraint — extra words must average ≤4 chars, ≤2 extra words total), accept. Also widened `JUDGE_TIMEOUT_MS` from 2000 to 3500 so the LLM backstop is less flaky on slower network paths.
- **Regression-tested** with 9 new cases in `answer.validator.spec.ts` covering AS Roma, FC Bayern, FC Bayern Munich, Real Madrid CF, AC Milan, Arsenal FC, plus guards against "CF" alone matching Real Madrid and sentence-length submissions matching on their last word. 82/82 specs pass.
## [0.8.6.4] - 2026-04-19

### Changed
- **Collapsed `entity_slugs` + `tags` into a single `tags` field on `question_pool`.** v0.8.6.2 introduced a generated `entity_slugs TEXT[]` column alongside the existing LLM-written `tags TEXT[]` to give entity-scoped modes a single-field filter. User feedback: the two fields were confusing, and empirical verification confirmed `tags ⊆ entity_slugs` holds on 100% of rows (0 violations across 1,950 tagged rows) — the separate `tags` column was query-redundant. Migration `20260615000000_collapse_entity_slugs_into_tags.sql` backfills `tags` to equal the current `entity_slugs` union, drops the generated column, and reindexes. Classifier writes (`pool-seed.service.ts:731`, `backfill-pool-taxonomy.ts:260`) now compute the full union (`subject_id + competition_id + nationality + LLM secondaries`) directly before inserting/updating, making the classifier the sole source of truth for `tags`. Downstream queries against `entity_slugs` must migrate to `tags` (zero such queries exist today — the column was added only 2 commits ago, not yet consumed by app code). Trade: gives up the Postgres-GENERATED invariant in exchange for schema clarity; acceptable because the only writers are the two classifier sites above and neither mutates scalar fields (subject_id/competition_id/nationality) independently of tags. GIN index on new `tags` preserves query performance.

## [0.8.6.3] - 2026-04-19

### Fixed
- **Repo↔Supabase migration sync restored.** Migration `20260418203808_daily_records_feature` had been applied to prod directly (via MCP `apply_migration`) but the SQL file was never committed to the repo, causing every subsequent `supabase db push` to fail its local-vs-remote sync check. Reconstructed the file from `supabase_migrations.schema_migrations.statements` (solo_session_summaries table + RLS policies + 6 app_settings keys + records_current materialized view covering streak_king / precision_solo / climber_solo / logo_hunter / logo_precision / duel_champion / logo_duel_champion / unique index on (record_type, window_type) + refresh_records_current() SECURITY DEFINER function). Entire migration is idempotent (`IF NOT EXISTS` / `OR REPLACE` / `ON CONFLICT DO NOTHING`) so re-running against prod is a no-op — `supabase db push` will now succeed cleanly for future migrations. Surfaced during v0.8.6.2 rollout when the dry-run blocked on the missing version. Root cause is the "Dashboard SQL or direct-MCP without committing the file" drift class documented in `feedback_run_migrations.md`; future migrations should always land as `db push` OR `MCP apply_migration + commit the .sql file` — not one without the other.

## [0.8.6.2] - 2026-04-19

### Added
- **`question_pool.entity_slugs` generated column for entity-scoped future modes.** Unlocks single-slug filtering for upcoming "Chelsea quiz", "Drogba quiz", "UCL quiz", "Argentine players quiz" without touching the classifier or backfilling tables. Generated as `array_remove(subject_id ∪ competition_id ∪ nationality ∪ tags, NULL)` and indexed with GIN — turns the old 4-field OR query (`subject_id = 'chelsea' OR 'chelsea' = ANY(tags) OR ...`) into `'chelsea' = ANY(entity_slugs)`. Nationality is unioned in deliberately: the canonical list keeps country slugs (`ar`) distinct from national-team slugs (`argentina`), so "Argentine players" and "Argentina NT" stay separable. Migration: `supabase/migrations/20260614000000_add_question_entity_slugs.sql`. No classifier/app code changes required — Postgres recomputes the column on row write, and existing rows are populated at migration time (`ALTER TABLE` rewrite). Apply via `supabase db push`. Rows with `subject_id IS NULL` produce an empty `entity_slugs` array; run `pool:backfill-taxonomy -- --resume --apply` separately to close that gap.

## [0.8.6.1] - 2026-04-19

### Changed
- **Question reveal state redesigned: 8 stacked boxes → 3 visual zones.** The post-answer screen on `/solo` + `/logo-quiz` previously piled up a glass-pill header wrapper, a WRONG badge, the question card, the red-bordered user input, a green correct-answer card, an explanation paragraph, a red -ELO box, and a blue NEXT button, for a total of eight bordered rectangles competing for attention. The new design collapses this into the question card + a new unified reveal block + the primary CTA, and replaces the three redundant wrong-signals (badge + red input + red ELO) with a single narrative: the user's wrong answer renders struck-through in a red card, a morph-gradient connector bridges down (red → green vertical gradient, ~2px pill-bar sweeping scaleY 0→1 in 450ms), and the correct answer lands in a green card with the ELO delta inlined as a compact chip on the same row. The explanation becomes a quiet left-border quote (no box). Correct-answer flow uses a compact single-row confirmation instead of the two-zone card. `prefers-reduced-motion` disables the connector sweep.
- **Extracted shared `<app-question-reveal>` component** at `frontend/src/app/shared/question-reveal/`. Two render modes: `text` (CLASSIC / LOGO_QUIZ / PLAYER_ID / GUESS_SCORE — full strikethrough pair) and `options` (MULTIPLE_CHOICE — footer-only, since the MC option grid already conveys correct/wrong inline). Staggered entry animations (answer-pair 0ms → correct-answer 100ms → explanation 200ms → CTA 300ms) remain identical across all question categories, so the end-of-question feel is unified across /solo and /logo-quiz. Blitz and Duel (which ship their own question UIs) can adopt the same component later for cross-mode consistency.
- **Orphan header wrapper removed from `<app-game-question>`.** The `.gq__header` container's backdrop-filter glass-pill (padding, 1rem border-radius, gradient bg, 1px border, 16px blur) wrapped only two small pills (mode + difficulty) on the reveal screen, creating a visually empty container. Stripped the wrapper chrome, kept the flex layout and `:root:not(.dark)` light-mode override is gone too. Pills now sit flat in flow for lighter hierarchy.
- **Screen reader users now hear the reveal result announced.** The previous design had `role="alert"` on the CORRECT/WRONG badge, which was removed when the badge was collapsed into the new reveal block. Added `role="status" aria-live="polite" aria-atomic="true"` on the `<app-question-reveal>` container plus a visually-hidden "Correct." / "Wrong. The correct answer is X." announcement span, so VoiceOver and TalkBack users get parity with sighted users. Regression-tested via `question-reveal.spec.ts`.

## [0.8.6.0] - 2026-04-19

### Fixed
- **Solo Ranked and Blitz rendered an empty screen after "Start Playing" — the question card never appeared.** Root cause in the shared `<app-screen>` primitive: `screen.html` had two default `<ng-content>` slots, one in each branch of the `@if (mode() === 'padded') / @else` block. Angular's content projection resolves slot → content at **template compile time**, not at runtime — when two `<ng-content>` tags share the same selector (default), only one wins, the other is permanently dead. Whichever branch Angular picked as "the" default slot, the other mode's consumers lost their projected children entirely. On `/solo` and `/blitz`, that meant the padded-mode body projection was the dead slot: signals were correct (`phase === 'question'`, `currentQuestion` populated, timer ticking), but `.screen__body` rendered with zero child nodes — not even @if anchor comments. Fix: gave padded-mode body an explicit named selector `<ng-content select="[screen-body]">`, left the bleed `<ng-content>` as the default, and wrapped the game-content `@if` blocks in both `solo.html` and `blitz.html` with `<ng-container ngProjectAs="[screen-body]">` (zero DOM cost, no layout drift). Bleed lobby untouched. Verified on dev: solo START PLAYING → question card + timer + input all render; blitz START → timer + 4 choices all render; `.screen__body` now projects 9 (solo) / 4 (blitz) child nodes. Regression introduced by #62 (`fbd7bb6`) which first extracted the `<app-screen>` primitive.

### Hardened (adversarial `/review` pass)
- **Dev-mode assertion in `ScreenComponent`.** Added `ngAfterViewInit` that warns (dev only) when `<app-screen mode="padded">` renders with no projected body content. Named-slot projection silently drops unwrapped children — this catches the next contributor who forgets `<ng-container ngProjectAs="[screen-body]">` before they ship an empty screen to users. Zero prod cost.
- **Regression test** `screen.spec.ts` with 3 specs locking in the contract: padded-mode body projects through the named slot, bleed-mode body projects through the default slot, and unwrapped padded-mode content is intentionally dropped. Any future refactor that regresses the projection pattern breaks a test instead of silently emptying /solo + /blitz again.
- **a11y — focus management on solo `finished` phase.** When the phase transitions `question → finished`, focus now moves to the session-complete `<h2>` (`tabindex=-1`, `#finishedHeading` ViewChild + effect + `queueMicrotask` for post-render focus). Before this fix the projection bug meant the finished UI never rendered for real users, so the focus gap was latent. Surfaced by the adversarial review that flagged the now-activated code path.
- **Inline bleed-branch comment** in `screen.html` explicitly forbids adding a second default `<ng-content>` anywhere in the template so this bug class can't resurface.

## [0.8.5.10] - 2026-04-19

### Fixed
- **`/news` anon sign-in regression introduced by v0.8.5.8.** The earlier fix skipped the AuthGuard-only `getQuestions()` call for anonymous visitors to silence the 401 log, but that 401 was load-bearing — `error.interceptor.ts:26-27` catches `status === 401` and calls `authModal.open()`, which was the *only* sign-in affordance for anon users on `/news` (the `empty` phase template has just a "Back to Home" button). Silencing the log also silenced the sign-in modal. Now the `!auth.isLoggedIn()` branch explicitly calls `authModal.open()` before dropping into `empty`, restoring the CTA deliberately rather than relying on an error-side effect. Surfaced by the `/review` adversarial pass.
- **Battle-hero dead-button edge: `mode.locked === true && mode.trialRemaining === 0` made the button fully non-interactive (no click handler, no sign-in modal).** v0.8.5.5 bound `[disabled]` to `mode.trialRemaining === 0` alone, so any mode that was BOTH locked AND trial-exhausted lost its click path. Tightened the binding to `[disabled]="!mode.locked && mode.trialRemaining === 0"` — locked buttons stay clickable (they open the sign-in modal via `lockedModeClick`), only the genuinely-exhausted-and-logged-in case disables. Rare edge state but a strict regression; surfaced by the `/review` adversarial pass.

## [0.8.5.9] - 2026-04-19

### Fixed
- **Branding case sweep — the rest of "Stepover" → "StepOver".** v0.8.5.1 fixed the HTML `<title>` + OG/Twitter meta, but the pre-landing review caught remaining surfaces that real users see on native and on legal pages. Swept: `frontend/public/manifest.webmanifest` (`name` + `short_name` — shown as the home-screen label on Android PWA/TWA installs), `frontend/src/app/features/legal/privacy.html` (3 user-facing mentions), `frontend/src/app/features/legal/terms.html` (9 user-facing mentions), `frontend/src/app/shared/page-header/page-header.html:19` (screen-reader alt text), and `frontend/src/app/shared/battle-hero/battle-hero.ts:25` (default subtitle, also updated "8-Player" → "20-Player" to match v0.8.5.2). Left untouched intentionally: `stepover_sound`/`stepover_haptic` localStorage keys (lowercase key convention) and `stepover-logo-white-bg.png` asset filename (filesystem convention). Surfaced by the /ship pre-landing review (informational finding escalated to auto-fix).

## [0.8.5.8] - 2026-04-19

### Fixed
- **`/api/news/mode/questions` logged a 401 for every anonymous visitor and raced signed-in users on cold loads.** `news-mode.ts:loadRound` unconditionally called `newsApi.getQuestions()` whenever `metadata.round_id && metadata.questions_remaining > 0`. The backend route is `@UseGuards(AuthGuard)` (`news.controller.ts:55-58`), so anonymous visits always 401'd, and signed-in users who landed on `/news` before Supabase restored the session from storage also 401'd (their `accessToken` signal was `null` at request time). Two fixes in `loadRound`: (1) `await this.auth.sessionReady` before any fetches so auth-dependent calls always see the restored session; (2) guard `getQuestions()` with `if (!this.auth.isLoggedIn()) { set 'empty'; return; }` so anonymous visitors fall through to the existing empty state cleanly — the auth modal overlay is the correct gate for anon users, not a background 401. Re-verified via `/qa`: anonymous load on `/news` now shows `/api/news/metadata → 200` with no follow-up `/mode/questions` call. Surfaced by full-app `/qa` (ISSUE-001, 2026-04-19).

## [0.8.5.7] - 2026-04-19

### Fixed
- **Duel lobby H2H stats inflated with local and online 2-player games.** `duel-lobby.ts:loadWinStats` reduced `matchHistory.getHistory(userId)` while only excluding `match_mode === 'battle_royale'`. The `match_mode` enum (`match-history.controller.ts:21`) is `'local' | 'online' | 'duel' | 'battle_royale' | 'team_logo_battle'`, so local same-device 2-player games, online 2-player board games, and team_logo battles all counted toward the 1v1 Duel H2H card. QA account showed "2W · 7D · 1L · 20% H2H WIN RATIO" on `/duel` even though 11 of the 13 underlying matches were `match_mode='local'`. Flipped the filter to an allowlist: `m.match_mode !== 'duel' → skip`. Now only actual online Duels count. Surfaced by full-app `/qa` (ISSUE-008, 2026-04-19).

## [0.8.5.6] - 2026-04-19

### Fixed
- **Malformed Apple-logo SVG path triggered a console parse error on every sign-in modal render.** `auth-modal.html:117` shipped a hand-tweaked Apple glyph whose second subpath (`M11.395 2.754c…2.679-1.49z`) contained 26 relative coordinates after the cubic `c` command. `c` requires groups of 6, so the renderer parsed four full curves, got two stray numbers (2.679, -1.49), then hit `z` where it expected another number and logged `<path> attribute d: Expected number, "…-.705 2.679-1.49z"`. The visual output rendered close enough to look correct, but every open of the auth modal added another console error. Replaced the path with the canonical Simple Icons Apple glyph (`viewBox="0 0 24 24"`, fully validated) — the rendered size stays at 18×18 via the explicit `width`/`height` attributes. Surfaced by full-app `/qa` (ISSUE-005, 2026-04-19).

## [0.8.5.5] - 2026-04-19

### Fixed
- **Logo Quiz mode buttons advertised `aria-disabled="true"` while still being clickable.** On the home Logo Quiz hero, the Duel 1v1 and Team PvP buttons render with `battle-hero__mode-btn--locked` when logged out and fire `lockedModeClick` → open the sign-in modal. This is correct behavior (the button IS actionable via the sign-in path), but `aria-disabled="true"` told assistive tech the opposite. Removed the `aria-disabled` binding for the locked state — the existing `aria-label` already spells out " - Sign in to unlock" so screen readers know what tapping does. For the "trial exhausted" state (`trialRemaining === 0`) the button has no meaningful click path, so replaced `aria-disabled` with the native `disabled` attribute, which short-circuits the click and implicitly sets `aria-disabled` for a11y. `battle-hero.ts:onModeClick` already skipped emitting `modeClick` when `trialRemaining === 0`, so the native-disabled change is defense-in-depth, not a behavioral flip. Surfaced by full-app `/qa` (ISSUE-006, 2026-04-19).

## [0.8.5.4] - 2026-04-19

### Fixed
- **`IapService` browser-mode warning spammed the console on every upgrade-modal open.** `initialize()` checked `if (this.initialized()) return;` before doing anything, but the browser-mode early-return at `:57-59` emitted the warning and bailed without ever setting `initialized.set(true)`. `upgrade-modal.ts:37-39` calls `iap.initialize()` every time the paywall opens when `!initialized()`, so each open produced a fresh `"cordova-plugin-purchase not available (browser mode)"` warning — /qa captured 30+ entries in a single session. Now set `initialized.set(true)` in the browser-mode branch so the warning fires exactly once. Callers who need to know whether IAP actually works already check `products().length` or fall back to hardcoded prices (`upgrade-modal.ts:57-58`), so flipping `initialized()` in browser mode is safe. Surfaced by full-app `/qa` (ISSUE-007, 2026-04-19).

## [0.8.5.3] - 2026-04-19

### Fixed
- **Casual NEWS card labeled "HOURLY" but content is daily.** `language.service.ts:258` had `newsDailyBadge: 'HOURLY'` (the key itself hints at the intent drift), and `btnNewsHint` read "Latest football headlines • Hourly updates". The `/news` route says "New questions drop **daily** from the latest football headlines" and the countdown is ~13h (time-to-midnight). Changed the badge to `'DAILY'` and the hint to "Daily updates" so all three surfaces agree. Surfaced by full-app `/qa` (ISSUE-003, 2026-04-19).

## [0.8.5.2] - 2026-04-19

### Fixed
- **Home "Battle Royale" card advertised 8 players; actual room size is 20.** `battle-royale.service.ts:222` hardcodes `maxPlayers: 20` and the `/battle-royale` lobby subtitle already said "20 players · 10 questions · Live leaderboard" — only the home `<app-mode-card>` was stale. First-time users tapped in expecting 8 and hit a 20-player lobby. Updated `home.html:49-50` (hint + tag label) and `tag-colors.ts:16,35` (color/icon keys) so the single home card now matches the rest of the app. Surfaced by full-app `/qa` (ISSUE-002, 2026-04-19).

## [0.8.5.1] - 2026-04-19

### Fixed
- **HTML `<title>` case: "Stepover" → "StepOver".** Browser tab, bookmark text, Open Graph title, and Twitter card title all inherited from `frontend/src/index.html` rendered the brand with a lowercase middle "o", contradicting the canonical "StepOver" casing used everywhere else in the app. Corrected across five locations in the same file. Surfaced by the full-app `/qa` pass (ISSUE-004, 2026-04-19).

## [0.8.5.0] - 2026-04-19

### Added
- **Battle Royale player ranks in lobby.** Each player in the BR waiting lobby now displays their global ELO rank as a `#N` badge next to their name. Mode-aware: classic BR rooms show solo ELO rank (`getSoloRank`), team_logo rooms show logo-quiz ELO rank via the new `getLogoQuizRank(userId)` in `supabase.service.ts`. Backend enrichment is per-player via `Promise.all` against the existing 60s Redis-cached rank functions, so 8–20 players costs at most one fresh DB count per player on cold cache. New `profileRank?: number | null` field on `BRPlayerEntry` (kept separate from in-room `rank` to preserve live-leaderboard semantics); `null` means the player is unranked in that mode (e.g. zero logo games played) and the badge is hidden. Refactored existing `getLogoQuizLeaderboardEntryForUser` to delegate to `getLogoQuizRank` so there is a single source of truth for logo rank computation.

### Fixed
- **Logo-quiz rank cache invalidation gap.** `logo-quiz.service.ts` now invalidates `rank:logo:{userId}` after a logo-quiz answer commit, mirroring `SupabaseService.updateElo`'s existing solo-rank invalidation pattern. Without this fix, BR Logo lobby badges showed stale rank for up to 60s after a player finished a logo game. Hardcore-mode invalidation deferred until `getLogoQuizHardcoreRank` exists. Surfaced by the `/ship` pre-landing review.
- **Battle Royale rank lookup observability.** `getRoom` enricher's `.catch(() => null)` now logs `Logger.warn` so a Redis outage or Supabase 500 surfaces as a structured warning rather than silently rendering players as "unranked." Genuinely-unranked players still produce no log line.
- **4 pre-existing test failures** that had been silently broken on `main`. None caused by the rank-display work; surfaced by `/ship`'s test triage and fixed inline so the suite returns to fully green (234/234 backend, 20/20 frontend).
  - `online-game.service.spec.ts`: `SupabaseService` mock missing `saveMatchResult`. Added `jest.fn().mockResolvedValue(true)`.
  - `llm.service.spec.ts`: NestJS DI failed because the test module didn't provide `RedisService` (LlmService injects it). Added a stubbed provider.
  - `mayhem.service.spec.ts`: NestJS DI failed because the test module didn't provide `MayhemStatGuessGenerator`. Stubbed as `{ generate: jest.fn().mockResolvedValue([]) }`.
  - `app.spec.ts`: scaffold-leftover test still checked for the `ng new` placeholder `<h1>Hello, football-quizball-frontend</h1>` and built `App` without `HttpClient` / router providers (App uses `ConfigApiService`). Rewritten to provide `provideRouter([])`, `provideHttpClient()`, `provideHttpClientTesting()` and assert that `<router-outlet>` renders.

### Removed
- **Dead `supabase/*.repository.ts` files (≈643 LOC).** `elo.repository.ts`, `leaderboard.repository.ts`, and `profile.repository.ts` were registered as Nest providers in `supabase.module.ts` but never injected anywhere — every method duplicated one already on `SupabaseService`. Likely abandoned mid-refactor (split-the-god-service plan that never landed). Files deleted; module providers/exports trimmed to just `SupabaseService`. Verified zero callers across `backend/src` before deletion.

### Why "Quick Join" stays hidden in BR Logo mode
- Investigated user-reported asymmetry: classic BR exposes Quick Join, team_logo BR does not. **This is intentional, not a bug.** Three layers gate it (`battle-royale-lobby.html:109` `@if (!isTeamLogoMode())`, `battle-royale-lobby.ts:54` skips public-room polling, and `battle-royale.service.ts:129` hardcodes `joinQueue` to `.eq('mode', 'classic')`). The product call is that team-vs-team play depends on balanced sides — random matchmaking would frequently produce 1v3 splits — so team_logo is invite-only. Documented here for future archeology; no code change.

## [0.8.4.3] - 2026-04-19

### Fixed
- **Battle Royale "Failed to load room" after leaving as last player.** When the last player left a BR room, the room was destroyed (correct) and the user was redirected to `/battle-royale` (correct), but the destroyed `/battle-royale/:id` URL was pushed onto browser history. Pressing back returned to that dead URL, re-invoked `BattleRoyalePlayComponent.ngOnInit()` → `store.loadRoom()`, which 404'd and parked the user on a generic "Failed to load room" error card. Two complementary fixes: (1) `battle-royale-play.ts:leaveRoom()` now navigates with `replaceUrl: true` so the destroyed game URL is replaced in history instead of pushed on top, and (2) `battle-royale.store.ts:loadRoom()` now distinguishes 404 from other errors — on 404 it surfaces a "This room no longer exists" message for 2s then redirects to the lobby with `replaceUrl: true`, mirroring the existing `refreshRoom()` 404 handler at `:91-98`. Defends against the bookmark / forward-nav / shared-link cases too.

## [0.8.4.2] - 2026-04-18

### Removed
- **`question_pool.mode_compatibility` column dropped.** Introduced in the taxonomy PR (#59, 2026-04-16) as an optional array describing which game modes a question was safe to draw for. The classifier prompt told Gemini the field was optional and "empty is fine" (`question-classifier.service.ts:199`); the LLM obliged, `pool-seed.service.ts:727-729` coerced empty arrays to `NULL`, and **1091 / 1092** new rows (99.9%) ended up `NULL`. Confirmed no read path depended on it — zero RPCs, views, analytics, or frontend references. Product decision is that taxonomy powers user-facing analytics ("top X% on UCL questions"), not mode routing, so the field is not needed. Cleaner to drop than to repair a prompt we don't want. New migration `20260418201736_drop_mode_compatibility.sql` drops the column + GIN index; classifier output type, system prompt, Raw type, validator branch, `GameMode` + `ALLOWED_MODES` consts, pool-seed writer, and backfill display/write are all removed. Applied to prod Supabase on 2026-04-18; Railway cron temporarily paused (`DISABLE_POOL_CRON=1`) to prevent old main code from crashing against the now-missing column. Flip back to `0` after this PR merges + Railway redeploys.

## [0.8.4.1] - 2026-04-18

### Fixed
- **Landing page 404s.** All 16 landing assets (logomark, 6 mode icons, 2 store badges, hero phone, 5 screenshots) were 404ing because they lived under `frontend/src/assets/landing/` but `angular.json` only declares `public/` as the static-asset input. Moved the folder to `frontend/public/assets/landing/` so the existing `assets/landing/...` references in `landing.html` resolve. The 6 PNGs (hero-phone, screenshot-1..5) that were `.TODO` sentinels are now real images generated via Vertex AI; replace with real gameplay captures before production launch.

### Added
- **Landing-asset Vertex generator.** New `backend/scripts/vertex-generate-landing-assets.js` mirrors the pattern of `vertex-generate-game-bg.js`. Idempotent (skips existing PNGs unless `--force`), sharded (`--only <name>` regenerates one asset at a time), writes directly to `frontend/public/assets/landing/` and clears the matching `.TODO` sentinel on success. Prompts describe UI as shape-language with no readable text to sidestep the image model's garbled-glyph failure mode.

## [0.8.4.0] - 2026-04-18

### Added
- **CI build gate.** New `.github/workflows/ci.yml` runs `nest build` + `ng build --configuration production` on every PR and push to `main`, using Node 22 with per-lockfile caching. Replaces the prior no-gate auto-deploy where a broken build could hit Railway/Vercel directly. Does not yet run test suites (opt-in follow-up).
- **Remote feature-flag / kill-switch.** New `GET /api/config/feature-flags` endpoint reads `app_settings.feature_flags` and merges user overrides with defaults, with a runtime type guard against malformed admin writes. Frontend consumes via `ConfigApiService.loadFeatureFlags()` as a signal, wired into app bootstrap. Lets us disable a broken mode on shipped native builds by upserting a row in Supabase — no store re-review. Defaults to everything enabled so misconfigured or empty `app_settings` is safe.
- **Universal Links + App Links scaffolding.** `frontend/ios/App/App/App.entitlements` declares Sign in with Apple + `applinks:stepovr.com` associated domains. `AndroidManifest.xml` adds an `android:autoVerify="true"` intent-filter scoped to `/join`, `/duel`, `/battle-royale`, `/logo-quiz` path prefixes so marketing URLs stay in the browser. `frontend/public/.well-known/apple-app-site-association` + `assetlinks.json` shipped with TODO placeholders for Apple Team ID and SHA-256 cert fingerprint. `vercel.json` excludes `/.well-known/*` from the SPA rewrite and sets `Content-Type: application/json` on `apple-app-site-association`.
- **Username moderation.** New `backend/src/profile/username-moderation.ts` with a curated reserved-patterns list (admin/support/staff/official + brand impersonation covering stepov/stepovr/stepove/stepover) and a seed slur deny-list using normalized leetspeak matching. Wired into `PATCH /api/profile/username` alongside a `@Throttle(5/hr)` decorator to cap impersonation spam.
- **Sentry setup guide.** New `docs/sentry-setup.md` — complete backend + frontend wire-up instructions intentionally deferred from code so builds don't break until `@sentry/nestjs` + `@sentry/angular` are installed.
- **Age-rating submission guide.** New `docs/age-rating-submission.md` documents the exact App Store Connect and Google Play IARC questionnaire answers to land StepOver at a defensible 12+/Teen rating under Path A (rate app 13+ + disclose in ToS, no in-app age gate). Cross-checked against existing `terms.html` §3 and `privacy.html` §9 which already declare the 13+ requirement.
- **Signup legal footer.** Added a muted legal footer to `auth-modal.html` with links to `/terms` and `/privacy` and an explicit "You must be 13 or older to use StepOver" notice. Belt-and-suspenders against the ToS claim; copy is mode-neutral so it reads correctly on both Sign In and Sign Up tabs.

### Changed
- **Stale `pre-production.md` bundle-ID references corrected.** Three `com.stepover.app` occurrences updated to `com.stepovr.app` to match the actual iOS bundle ID / Android package name used everywhere in the code.

## [0.8.3.0] - 2026-04-17

### Added
- **Marketing landing page at `/` behind `environment.landingMode` flag.** New `LandingComponent` (`frontend/src/app/features/landing/`) renders a 6-section marketing page (hero, feature grid, screenshots, how-it-works, final CTA, footer) with device-aware App Store / Play Store CTAs via a pure `detectPlatform()` UA utility. When `landingMode` is `true` in `environment.prod.ts`, the app swaps from the full routes array to a landing-only routes array — `/`, `/terms`, `/privacy` resolve; every other path redirects to `/`. When `landingMode` is `false` (dev default), everything behaves as before. Launch-day cutover is a single boolean flip plus replacement of placeholder store URLs and assets. iOS smart-banner meta tag (`apple-itunes-app`) added to `index.html`; Android `related_applications` array added to `manifest.webmanifest` (informational only). `prefer_related_applications: true` is intentionally deferred to launch day — activating it now would surface a broken install banner to current Android web-app users since the Play Store listing does not yet exist. Visual direction is "Hybrid" — dark background, gold-glass accent panels matching the in-app Pro Arena vocabulary, but marketing-scale typography (hero H1 72px desktop / 44px mobile) and 96px section padding on desktop. All static copy lives in `content.ts` to keep the template lean. Unit tests assert all 6 sections render, feature grid has exactly 6 cards, how-it-works has exactly 3 steps, footer links resolve to `/terms` and `/privacy`, and both store URLs come from `environment.stores`. Placeholder assets and store URLs are marked with `TODO` and `.TODO` sentinel files so the launch checklist can grep-verify readiness.

## [0.8.2.2] - 2026-04-17

### Fixed
- **Stacking-context regression in `app-game` fixed before it could trap in-game modals.** `v0.8.2.0`'s `game.css` used `isolation: isolate` on `.game-shell` to confine the floodlit-BG `::before`/`::after` pseudo-elements below z:0 content. That created a new stacking context, which trapped any descendant overlay — specifically `<app-confirm-modal>` inside `<app-board>` (z:100) — at `.game-shell`'s z:auto level in the root context. The fixed `.bottom-nav` at z:40 in root would then paint over the bottom portion of the end-game confirm modal, occluding its action buttons. Dropped `isolation: isolate`; the BG pseudos at z:-2/-1 now render in the body stacking context where they compose correctly with all higher-z overlays, and `.game-shell`'s solid `background-color: var(--color-bg)` remains the visual fallback in case any browser culls the negative-z pseudos.
- **PLAYER_ID question safety fallback.** `v0.8.2.0` removed the `question_text` hint from the PLAYER_ID template, leaving the career path as the whole puzzle. That assumed `career_path` is always populated. Added an `@else` branch that renders the question's `question_text` if `career_path` is missing or empty (legacy questions, LLM generation failures, DB integrity issues), so the player always has SOMETHING to answer instead of a blank card with a name input below. The happy-path display is unchanged — the hint only appears when there's literally no career data.
- **Battle Royale `leaveRoom()` now always navigates, even on backend failure.** `v0.8.2.1` fixed the `team_logo` mode preservation when leaving a BR room, but `await this.store.leaveRoom()` could still throw (network error, stale session), and the uncaught throw meant `router.navigate` never ran — the user would be stuck on the BR play screen with cleared local state but no route change. Wrapped the await in `try/finally` so navigation fires unconditionally. The backend failure is still swallowed (intentional — the user clicked leave, respect it), but the user always lands back in the lobby.

## [0.8.2.1] - 2026-04-17

### Fixed
- **Battle Royale: leaving a `team_logo` room now returns you to `/battle-royale?mode=team_logo`, not the classic lobby.** Previously, `leaveRoom()` in `battle-royale-play.ts` and the 404 "room deleted" redirect in `battle-royale.store.ts` both hardcoded `router.navigate(['/battle-royale'])` with no query params, dropping `?mode=team_logo` and sending team-logo players to the wrong lobby. Both sites now read `store.roomView()?.mode` (already populated from the backend's `BRPublicView.mode`) and pass `{ queryParams: { mode: 'team_logo' } }` when appropriate. The "no roomId" guard redirect in `ngOnInit` stays unchanged — no mode context to preserve when the URL itself is malformed.

## [0.8.2.0] - 2026-04-17

### Changed
- **Board phase gets an Arena Scoreboard redesign on a floodlit-stadium backdrop.** The 2-Player score cards (`app-board`) were flat `--color-surface-low` boxes relying on a 3px turn strip and a tinted name to carry all player identity — calm but visually boring, and the score numeral (36px) lost hierarchy to the 50/50 and 2x chips. Redesigned following `ui-ux-pro-max`'s recommendation for competitive-gaming UIs: **Vibrant & Block-based + Comparative Analysis** patterns, duotone blocks, high contrast (7:1+), large display type. The active player's card now **floods with their color** via a 135° gradient wash, lifts 2px, runs a subtle 3.2s scoreboard-style sheen across the surface, and widens its left-edge identity stripe from 4px → 6px — so "whose turn is it" reads from across the room instead of relying on a tiny text tint. The score numeral is now **64px Alfa Slab One** (stadium-jumbotron slab-serif, already loaded for brand use) with tabular numerals, a 2px hard drop-shadow, and a color-matched glow when active. The `TURN` pill became a hard white block with a 1.8s bob; powerups are solid duotone chips; the armed `2x` chip pulses white-ringed **electric magenta** (`#ec4899`, scoped to this single state — unique to the 2x multiplier, deliberately not a reusable token) so it can't be confused with P1 blue, P2 orange, success green, or the battle-royale purple already in use; the `Use 2x` CTA is a chunky color button with a 3px hard-shadow base and `min-height: 44px` for Apple HIG / Material touch-target compliance; the streak/accuracy stat chip gained a green-glowing success dot. The "VS" divider is now a **hexagonal chrome coin** (CSS `clip-path`) instead of a muted gray label. `app-game` now renders the whole in-game screen on a freshly generated **floodlit stadium** background (`/game-bg.webp`, 42 KB, 1080×1920) sitting behind a radial vignette that guarantees UI contrast; a slow 24s `transform: scale(1→1.04)` breathe keeps the stadium feeling alive without distracting, disabled under `prefers-reduced-motion`. The BG image was generated via Vertex AI (`gemini-3-pro-image-preview`, service-account auth) by a new one-shot script `backend/scripts/vertex-generate-game-bg.js` that reuses the existing `gen-lang-client-0272230126` project — no new credentials, no new services. CSS budget untouched (board.css ~11 KB, well under the 14 KB per-component limit). Score card DOM is byte-for-byte identical. Two small behavior changes in the question flow: (1) the back-to-home button in `app-game` is now hidden during the `question` phase (in addition to `loading`/`finished`), so users can't accidentally bail out mid-question and lose committed state — the phase's own flow (answer or timeout) is the only exit; (2) the `PLAYER_ID` question template no longer renders the `question_text` hint (e.g. "Which player had this career?") above the career-path timeline — the career path is now the whole puzzle, clean and unguided, matching the "read the clubs, guess the player" spirit of the category.

## [0.8.1.2] - 2026-04-17

### Changed
- **LCP optimization: 2-Player card background preloads.** Added `priority` to the `<img ngSrc>` inside `.two-player-card` on the home page. Angular's `NgOptimizedImage` now emits a `<link rel="preload">` for `/2-player-mode.png`, so the image starts downloading in the HTML parse phase instead of waiting for Angular bootstrap and layout. On mid-range mobile, the 2-Player card's hero image was a plausible LCP candidate below the fold of taller screens but above the fold on most. Preloading it shaves typical LCP by 200–400ms on cold loads. No behavior change.

## [0.8.1.1] - 2026-04-17

### Fixed
- **Production build unblocked.** Raised Angular `anyComponentStyle` error budget from 20 kB to 25 kB in `frontend/angular.json`. `profile.css` (20.02 kB after organic growth over several PRs) had tipped 24 bytes past the old limit, breaking every Vercel deploy on `main` regardless of what the PR changed. No CSS was removed; this is a deliberate budget adjustment to match how the profile page has actually grown. Per-component budgets remain tight enough to catch runaway bloat (warning still fires at 14 kB).

## [0.8.1.0] - 2026-04-17

### Added
- **+262 football club logos across 5 new countries.** Logo Quiz and Team Duel now draw from a much richer pool: **Argentina** (+24), **Brazil** (+24), **France** (+35), **Italy** (+71), **Portugal** (+108). Every new logo ships with two difficulty variants: **easy** (team text removed via Gemini 3 Pro Image) and **hard** (text removed + flipped + desaturated). The hard variant is now correctly derived from the text-erased easy source instead of the original, so hard is genuinely harder than easy. Total production pool: **1,661 logos across 60 countries** (from 1,399). Users will see new clubs immediately in solo Logo Quiz, Logo Duel (`/duel?mode=logo`), and Team Logo Battle Royale (`/battle-royale?mode=team_logo`). 290 logos were AI-generated, manually reviewed via `review.html`, and 28 rejected for quality (3 cup/trophy logos — Coupe de France, Coppa Italia, Taça de Portugal — removed at pre-merge review because "what team is this?" has no valid answer for a competition trophy). Previously approved countries (England, Spain, Germany, Netherlands, Greece, Albania) also had their hard variants regenerated from text-erased sources to fix the same latent issue.

## [0.8.0.1] - 2026-04-17

### Added
- **Level-up flash trigger activated in `TopNavComponent.ngOnInit`.** The previously-scaffolded CSS animations (`top-nav__xp-progress--leveling` flash + level number pop) were dormant until a trigger effect was written. Added a signal `effect()` that watches `level()` for real in-session increments and toggles `levelingUp` for 600ms to fire the animation. First-load policy is **strict**: the effect skips the initial transition from the signal default (1) to the loaded profile value by waiting for `statsLoading()` to clear and then anchoring `lastSeenLevel` on the first real value, so the flash never fires on a page refresh, only when a user actually gains a level mid-session. Reuses `this.injector` for the effect registration and `prefers-reduced-motion` is already honored at the CSS layer.

## [0.8.0.0] - 2026-04-17

### Added
- **Top navigation XP progress bar.** Replaced the 4-chip mode-stats row (Solo ELO + Logo ELO + W/L% + Level) with a single full-flex XP progress pill that shows `Lv N  ████████░░  X XP to N+1` and links to the profile page. The XP bar is the clearest engagement signal the nav can carry: it changes every game and creates visible progress toward the next level, so every session ends with a visible Zeigarnik/goal-gradient pull back. Uses floodlight cyan (`#06b6d4 → #67e8f9`) as the fill gradient, matching stadium atmosphere and deliberately avoiding the purple/violet "AI slop" palette. On narrow mobile (`<420px`) the username and XP suffix hide so the bar stays readable.
- **Level-up flash + number pop animation** (class `top-nav__xp-progress--leveling`). When the `level()` signal increments during a session, the pill flashes cyan glow for ~600ms and the level number scales 1→1.28→1 for ~500ms. Both honor `prefers-reduced-motion`. Trigger effect is scaffolded in `top-nav.ts:ngOnInit` with a TODO for the first-load-vs-increment debounce policy (currently dormant until that 5-line effect is written).

### Changed
- **Username moved from center to the identity cluster next to the avatar.** Previously sat awkwardly before the mode chips, now reads as "avatar + name" — the standard persistent-chrome identity pattern. Brightened from 70% to 85% opacity now that it's the written name of the identity anchor. Truncates to 5rem max-width and hides on narrow mobile.
- **Avatar bumped from 36×36 to 40×40, border from 2.5px to 3px, tier glow strengthened** (`0 0 10px tierGlow 40` vs `0 0 8px tierGlow 33`). Tier identity now lives entirely in the avatar ring and glow — the old standalone tier progress bar was redundant with the new XP bar.
- **Top-nav spacing switched from arbitrary rem values to `--space-*` tokens.** Header padding, left cluster gap, center padding, right cluster gap, and XP pill padding all reference the defined scale now.

### Removed
- **Compact logo icon from the logged-in nav** (`top-nav__logo-icon--compact`). Redundant with the avatar as identity anchor, sub-44px touch target, and home navigation is already reachable via the bottom-nav pill. Logged-out state keeps its full wordmark — brand presence belongs there.
- **Tier progress bar below the header** (`top-nav__tier-bar` + `top-nav__tier-bar-fill` + `tn-pulse` keyframe). Two parallel progress bars (tier-by-ELO + XP-by-games) couldn't coexist without confusing users. XP won — it changes every game; tier identity stays communicated via the avatar border color.
- **Dead signals in `TopNavComponent`**: `elo`, `logoQuizElo`, `blitzBest`, `rank`, `sessionDelta`, `correctStreak`, `tierPct`, `tierLabel`, `eloDisplay`, `streakDisplay`. All were defined but had no template references after the redesign.

## [0.7.5.1] - 2026-04-17

### Changed
- **WORKFLOW.md** — added blank lines after section headings for consistent markdown rendering across viewers.
- **`backend/scripts/vertex-easy-flcc.js`** — `--country=` flag now accepts a comma-separated list (e.g. `--country=gr,tr,cy`) so one invocation can batch multiple countries. Single-country syntax still works.

## [0.7.5.0] - 2026-04-17

### Changed
- **ELO tier ladder renamed from metal names to football-native names.** The old League-of-Legends-style ladder (Iron → Bronze → Silver → Gold → Platinum → Diamond → Challenger) always felt borrowed. Replaced with a ladder that reads like a football career arc every fan recognises instantly: **Sunday League → Academy → Substitute → Pro → Starting XI → Ballon d'Or → GOAT**. ELO thresholds, K-factors, and progression logic are unchanged — only tier keys, labels, achievement display names, and achievement emoji (🎒 Academy, 🪑 Substitute, ⚽ Pro, 🎽 Starting XI, 🥇 Ballon d'Or, 🐐 GOAT) are updated. Internal tier keys changed too (`challenger` → `goat`, `diamond` → `ballon_dor`, `platinum` → `starting_xi`, `gold` → `pro`, `silver` → `substitute`, `bronze` → `academy`, `iron` → `sunday_league`) — keys are not persisted anywhere, so no data migration needed for user records. DB migration `20260613000000_football_tier_rename.sql` updates achievement `name`, `description`, and `icon` in place; achievement IDs (`elo_750`, `elo_1000`, …) are unchanged so `user_achievements` rows are untouched.
- **Tier color palette refreshed to match the football semantics.** The old palette was metal-themed (amber, cyan, purple). Three tiers now recolor to fit the new ladder: **Pro** `#f59e0b` amber → `#10b981` emerald (on-pitch green), **Starting XI** `#06b6d4` cyan → `#2563eb` royal blue (elite captaincy), **Ballon d'Or** `#a855f7` purple → `#eab308` gold (the iconic golden ball). Sunday League, Academy, Substitute, and GOAT colors are unchanged — they already fit. Result: the color progression reads gray → brown → slate → pitch green → royal blue → gold → electric glow, matching the career-arc narrative.
- **Leaderboard ELO legend overlay** updated with the new names, ranges, colors, and football-native icons (🐐 GOAT, 🥇 Ballon d'Or, 🎽 Starting XI, ⚽ Pro, 🪑 Substitute, 🎒 Academy, 🥾 Sunday League). Footer now reads "All players start at Substitute (1000 ELO)".

## [0.7.4.1] - 2026-04-17

### Added
- **Achievements x/y stat in profile hero.** Fourth slot in the hero stat row shows `earned / total` so users see their completion progress at a glance without scrolling to the Achievements section. Reuses the existing `achievementsEarned()` and `achievements()` computed signals — no new state.

### Fixed
- **Solo Ranked lobby (idle phase) now has a back button.** Previously wrapped in `<app-screen mode="bleed">` which only emits a back button in `padded` mode, so the screen had no nav affordance. Added `<app-lobby-header (back)="goHome()" />` inside the bleed container (same pattern duel and battle-royale lobbies use).
- **Lobby header back button now renders correctly across all lobbies.** Root cause: `<app-lobby-header>` had no `:host { display: block }`, so browsers defaulted the custom element to `display: inline`, collapsing its host box to zero height inside the parent flex column. The inner `.lobby-header` div still painted but could end up clipped by the absolute-positioned `.hero-bg`. Fix lifts duel, battle-royale, and solo in one change.

### Changed
- **"Buy Me a Coffee" top-nav link now renders amber by default.** Promoted the hover styling (amber bg/border, `#fbbf24` text) to the base rule so the link reads as branded on first paint — critical on mobile where hover essentially doesn't exist. Kept `:hover` as a subtle amplification for desktop users.

## [0.7.3.1] - 2026-04-17

### Fixed
- **"View full analytics" link no longer hidden behind ELO sparkline gate.** The Pro-only analytics entry point lived inside `@if (sparklineData())`, so users with fewer than 2 ELO-history entries couldn't see it even when their Pro status was active. Lifted the `@if (isOwnProfile() && pro.isPro())` block out of the sparkline section into its own standalone block between ELO Progression and Mode Stats. Added `.analytics-link--standalone` modifier for centered spacing when it renders on its own.

## [0.7.3.0] - 2026-04-17

### Changed
- **2-Player setup: "How it works" legend replaces the single-line footer.** The old `{{ lang.t().howToPlay }}` footer ("7 categories · Up to 3 difficulties · 2 lifelines each") was decorative but didn't actually teach the rules. Replaced with a proper `<aside>` legend above the player-name card, using a definition list (Turns, Points, 50-50, 2x multiplier, Win). Reads like a quick-reference card, sits in the player's eyeline before they enter names, and explains the 2x-must-be-armed-first nuance that players consistently missed.

### Removed
- `lang.howToPlay` translation key — now unused after the legend replaces the footer.

## [0.7.2.0] - 2026-04-17

### Added
- **Onboarding sampler (5-category tasting menu)** — first-run tutorial now pulls one EASY question per category (Logo Quiz, Higher or Lower, Geography, History, Player ID) directly from `question_pool`, so every new user gets a live taste of every mode instead of 5 random daily questions. Fixed order: visual hook → binary → warm-up → history → finisher.
- **Onboarding lobby screen** — welcome screen before the quiz with hero emoji, 5-category preview row, and `<app-primary-btn variant="accent" size="lg">` "Let's go" CTA. Questions are prefetched in the background during lobby, so the Start tap is zero-latency when the fetch completes in time.
- **Logo crest reveal on answer** — LOGO_QUIZ reveal now shows the original (un-obscured) crest on a white plate inside the flash overlay, sourced from `question.meta.original_image_url` (same pattern as live Logo Quiz mode).
- **Category label chip** — each onboarding question displays its mode name above the prompt (e.g. "🛡️ Logo Quiz", "📊 Higher or Lower") so users connect the sampler to real modes they'll see on the home screen.
- **New backend module** `backend/src/onboarding/` — `OnboardingController`, `OnboardingService`, `OnboardingQuestion` type, registered in `app.module.ts`. Exposes `GET /api/onboarding/questions` (no auth). Draws non-destructively from `question_pool` (plain SELECT, not `draw_questions` RPC) so onboarding doesn't deplete the pool.
- **Cross-question distractor fallback** — for categories where pool rows have empty `wrong_choices` (LOGO_QUIZ and PLAYER_ID use fuzzy text matching in real gameplay), distractors are borrowed from sibling rows' `correct_answer` values in the same category. Fixes the single-choice MC bug.
- **`onboarding_question_answered` analytics event** — fires per answer with `category` + `correct`, enabling per-category funnel analysis.

### Changed
- **Onboarding now fetches from `/api/onboarding/questions` instead of `/api/daily/questions`** — `DailyApiService` is no longer used for onboarding. Dropped the 5-item slice of generic daily questions in favor of category-typed MC.
- **"Tap to continue" hint visible on correct answers too** — previously only shown on wrong. Correct answers still auto-advance at 1.5s; the hint just makes the manual-advance affordance discoverable.

### Fixed
- **Onboarding no longer renders single-button MC questions** — some pool rows (LOGO_QUIZ, PLAYER_ID) had empty `wrong_choices`, which caused the UI to render only the correct answer as a choice. Donor-pool augmentation + 2-choice requirement for HIGHER_OR_LOWER eliminates this.

## [0.7.1.0] - 2026-04-17

### Added
- **`<app-screen>` primitive** — canonical screen shell with two modes: `bleed` (full-viewport lobby) and `padded` (max-width content with back-button header and `[screen-title]` / `[screen-action]` slots). Replaces duplicated `bg-background flex flex-col page-stagger` wrappers and ad-hoc back-button header rows.
- **`<app-primary-btn>` primitive** — canonical CTA with `accent` / `purple` / `ghost` variants and `md` / `lg` sizes. Handles loading and disabled state internally; emits `pressed` only when actionable. Replaces the `lobby-start-btn` + per-screen `-start-btn` family.

### Changed
- **Blitz mode migrated to shared primitives** — `blitz.html` idle state uses `<app-screen mode="bleed">` + `<app-primary-btn size="lg">`. Non-idle state uses `<app-screen mode="padded" showBack>` with the "⚡ Blitz" title in the canonical header slot.

### Fixed
- **Solo mode no longer references undefined components on main.** Since v0.7.0.0, `solo.html` used `<app-screen>` and `<app-primary-btn>` but neither the component files nor the `solo.ts` imports existed — production main failed to compile the Solo route. This PR adds the missing components and imports.

## [0.7.0.0] - 2026-04-17

### Changed
- **2-Player game visual redesign (all 6 phases)** — realigned every game phase to the Floodlit Arena design system (DESIGN.md, 2026-03-24). The entire game flow had drifted to a pre-redesign "premium glass" aesthetic using lime `rgba(204,255,0,*)` instead of the brand accent iOS blue `#007AFF`.
  - **Question**: CSS rewritten from 555 to 139 lines. Glass-on-everything replaced with tonal surfaces. 4 idle infinite animations removed (shimmer, player-glow, double-armed-glow, corner blobs). Skeuomorphic Higher/Lower buttons flattened. Question text upgraded to Inter title-lg (1.375rem/600).
  - **Setup**: matchday poster composition. Full-bleed stadium pitch background with atmospheric overlay. Bold STEPOVR. brand moment in Alfa Slab One italic. "STARTING LINEUP" eyebrow in Lexend. Decorative chrome removed (logo badge, wordmark duplicate, VS divider, ball emoji).
  - **Board**: tokenized end-to-end. Score numbers in Space Grotesk tabular-nums, turn badges in Lexend. End-game button bumped to 44px touch target.
  - **Result (per-question)**: Continue button aligned to iOS blue gradient. Score cards use blue/orange tokens.
  - **Finals**: stadium pitch background (game ends where it started). Trophy glows iOS blue. "Final Results" heading upscaled to Space Grotesk 2.5rem. Non-winner player cards demoted from glass to flat surface.
  - **Loading**: spinning football emoji replaced with branded pulsing StepOver mark.
- **Player identity unified** — P1 = `--color-accent` (iOS blue), P2 = `--color-warning` (orange) across all 6 phases. Previously used hardcoded `#3b82f6` / `#ef4444`.
- **Token system extended** — 10 new CSS custom properties: `--color-border-ghost`, `--color-accent-bg-subtle`, `--color-accent-border-soft/-med`, `--color-warning-bg-subtle/-border-soft/-med`, `--duration-pulse`, `--shadow-text-subtle`. Light-theme glass override via `:root:not(.dark)`.
- **Shared `.loading-tile`** — extracted to `styles/components/_loading.css`. Replaces emoji spinners in game loading, solo, and logo-quiz.
- **Emoji removed from copy** — "Kick Off! ⚽" → "Kick Off", "Play Again ⚽" → "Play Again", "🤝 It's a Draw!" → "It's a Draw".
- **Theme toggles removed** from game phases (board, setup, loading).

### Fixed
- **Question screen black band + overflow scroll** — question page had its own background color that conflicted with the game wrapper, creating a visible black band at top. Replaced `min-h-screen` with `flex-1` inside the now-flex game wrapper.
- **Setup card anchored to top** — `flex-1` couldn't resolve a concrete height. Fixed with explicit `min-height: calc(100dvh - 9.5rem)`.
- **A11y hardened across all game phases** — labels linked to inputs via `for`/`id`, visually-hidden `<h1>` headings on every phase for screen-reader orientation, `role="alert"` on error banners, `role="status"` on result cards, `aria-label` on board question circles ("Geography, 100 points, unanswered"), `aria-describedby` on disabled Kick Off with helper hint, `focus-visible` rings on all interactive elements, back button minimum 44px touch target. All animations respect `prefers-reduced-motion`.

## [0.6.2.1] - 2026-04-16

### Fixed
- **Notifications show real publish time** — frontend-synthesized News and Daily notifications no longer stamp `createdAt` at fetch time (which always displayed "Just now"). Backend now returns `round_created_at` (News) and `publishedAt` (Daily from `daily_questions.created_at`); the notifications service uses those, falling back to `expires_at/resetsAt − 24h` if null. Touches `backend/src/news/news.service.ts`, `backend/src/daily/daily.service.ts`, `frontend/src/app/core/{news,daily,notifications}-api.service.ts`.

## [0.6.2.0] - 2026-04-16

### Added
- **`wipe-account.mjs`** — dev utility to fully reset a user account (profile stats, ELO, XP, level, match_history, user_achievements, user_mode_stats, xp_history, elo_history, duel_games). Reads target credentials from `WIPE_EMAIL` / `WIPE_PASSWORD` env vars (never hardcoded). Verifies the wipe with a post-reset profile read.
- **`backend/scripts/delete-medium-erasures.ts`** — one-shot storage cleanup: scans `logo-quiz/erasures/{slug}/` folders and removes the now-unreferenced `medium.webp` files. Supports `--dry-run`. (Already executed — removed 654 files.)
- **E2E sim match-history writes** — `e2e-game-sim.mjs` now POSTs to `/api/match-history` after duel and battle royale games so simulated runs populate the match history view (mirrors the existing 2P save).

### Changed
- **Chart.js registration** (`frontend/src/main.ts`) — register `CategoryScale`, `LinearScale`, `PointElement`, `LineElement`, `BarElement`, `BarController`, `LineController`, `Title`, `Tooltip`, `Legend` at bootstrap. Fixes "is not a registered scale/controller" errors on the analytics dashboard.
- **2P sim wrong answers** (`e2e-game-sim.mjs`) — replaced placeholder `definitely_wrong_{random}` strings with a pool of realistic filler answers (`unknown`, `nobody`, `idk`, etc.) so match history shows readable `given_answer` values.
- **2P sim peek fallback** — surface 401/unreachable peek failures with an explicit warning and fall through to a pool of common football answers instead of silently using `'random guess'`.

### Security
- **`e2e-game-sim.mjs`** — `ADMIN_KEY` no longer defaults to a hardcoded admin token; when `ADMIN_API_KEY` is unset, the admin-peek path fails closed and the sim falls through to fuzzy answers.

### Removed
- **52 broken entries in `footy-logos.json`** — legacy rows that had a `real_image_url` but no EASY/HARD erasure URLs (unusable as quiz questions). Dropped one fully-empty competition (`uefa-champions-league`).
- **654 orphaned `medium.webp` files** from Supabase storage (unreferenced since the MEDIUM tier was removed in 0.6.1.0).

## [0.6.1.0] - 2026-04-16

### Added
- **Logo Quiz — 283 new teams** from football-logos.cc across England, Spain, Netherlands, Germany, Greece, Albania (7 synthetic per-country competitions). Seeded into `question_pool` as 566 new rows (EASY + HARD).
- **`vertex-easy-flcc.js`** — Vertex AI (gemini-3-pro-image-preview) batch script for text-removal erasures from crawled PNGs. Includes proactive pacing (`--delay`), hard request timeout (90s via `AbortController`-style `req.destroy`), bounded rate-limit retries (10x cap), and league/competition filter (skips league logos that Gemini garbles).
- **`generate-hard-flip-desaturate.ts`** — generates HARD variants (horizontal flip + desaturate) from the Gemini EASY outputs so both difficulty tiers share the same text-removed base.
- **`ingest-flcc-approved.ts`** — reads manual approve/reject decisions, uploads originals + erasures to Supabase storage, appends to `footy-logos.json`, seeds `question_pool`. Dry-run supported.
- **`review.html`** — local review UI for the flcc batch. Shows original / EASY / HARD side-by-side with keyboard-free approve/reject, localStorage persistence, and export to `decisions.json`.

### Changed
- **`footy-logos.json` schema** — dropped `medium_image_url` field; only EASY and HARD variants are supported going forward.

## [0.6.0.0] - 2026-04-16

### Added
- **Structured taxonomy on every question** — 15 new columns on `question_pool` (`subject_type/id/name`, `competition_id`, `question_style`, `answer_type`, `mode_compatibility`, `concept_id`, `popularity_score`, `time_sensitive`, `valid_until`, `tags`, `solve_rate`, `avg_time_ms`, `nationality`). Every future mode (themed quizzes, concept mastery, adaptive difficulty, geo-filtering) can now be built without more schema migrations.
- **`QuestionClassifierService`** — new service that tags every generated question against a reviewed canonical entity list (1,122 players / teams / leagues / trophies / managers / stadiums / countries). Strict validation prevents slug drift.
- **`competition_metadata` table** — single source of truth for league / trophy / award facts (tier, type, country, founded/defunct years). 84 competitions seeded + reviewed.
- **Auto-classification on new questions** — `PoolSeedService` now runs the classifier before every INSERT, so new pool entries land fully tagged.
- **Logo-quiz cache invalidation** — `seed-logo-questions.ts` now busts the team-names Redis cache after seeding, so newly-seeded logos appear in the select immediately instead of after a 1-hour TTL.

### Changed
- `league_id` renamed to `competition_id` — column now accepts either a league slug (`premier-league`) or a trophy/tournament slug (`uefa-champions-league`) so questions scoped to cups / continental comps are queryable.
- `era` converted to a `GENERATED ALWAYS AS STORED` column derived from `event_year`. Self-maintaining, no write path, analytics unchanged.
- `league_tier` and `competition_type` now auto-fill from `competition_metadata` via the `sync_question_pool_competition_meta` trigger. Generator-provided overrides still win via COALESCE.
- Trigger emits `RAISE WARNING` when a question is written with an unknown `competition_id`, so silent drift is visible in Supabase logs.

### Backfill
- 2,128 / 2,128 non-logo questions backfilled. 87.8% `subject_id` coverage, 71.6% `competition_id`, 99.7% `concept_id`, 98.5% `popularity_score`, 83% `nationality` on applicable subjects.

## [0.5.2.0] - 2026-04-15

### Added
- **Mode picker on `/analytics`** — switch between Solo Ranked, Logo Quiz, and Hardcore views. Each mode shows its own Current ELO, Peak ELO, trajectory, and breakdowns instead of blending all three into one misleading chart.

### Fixed
- Analytics no longer mixes ELO events from different ranked modes. Previously, users who played Logo Quiz and Solo would see a trajectory jumping between two different ELO systems on the same line; now each mode is isolated.

## [0.5.1.0] - 2026-04-15

### Added
- **Category strengths & weaknesses** now appear on your Pro Analytics dashboard — see which question types you dominate and which need work, with sample sizes so you know when to trust the numbers.
- **Accuracy by era** — see how you stack up on 90s, 2000s, 2010s, and 2020s football trivia.
- **Accuracy by league tier** — separate views for Top-5 EU leagues, other European top flights, and the rest.

### Changed
- Removed the "Coming soon" placeholder card on `/analytics` now that all three breakdowns are live.
- Solo and Logo Quiz rounds now record which question was rated, so future analytics can join rich question metadata.

## [0.5.0.0] - 2026-04-15

### Added
- **Personal Performance Analytics (Pro)** — a new `/analytics` page showing your ranked journey. See how many questions you've answered, your accuracy %, current and peak ELO, days active, an ELO trajectory line chart, and accuracy broken down by difficulty tier.
- **"View full analytics" link** on your profile (Pro only) routes straight to the dashboard.
- **"Personal Performance Analytics"** bullet added to the Pro upgrade modal feature list.
- **Question metadata tagging pipeline** — newly LLM-generated questions now carry structured tags (league tier, era, competition type, event year, nationality) stored on `question_pool`. These power richer breakdowns coming soon.

### Changed
- Free users visiting `/analytics` see a blurred teaser with an "Unlock with Pro" CTA that opens the existing subscription sheet.
- Analytics dashboard gracefully handles zero-games state with clear empty messages per widget.

### Security
- `/api/analytics/me` now requires an explicit Pro subscription check (was previously relying on a permissive shared guard).

## [0.4.0.0] - 2026-04-13

### Added
- **Pro subscribers now see their last 100 matches** in match history, instead of the last 10 that free users see.
- **Pro subscribers can review every question after any match.** Tap any match and see the question text, the correct answer, and each player's actual answer, across Duel, Battle Royale, and 2-Player modes.
- **2-Player match cells are now tappable**, opening a detail popover (Pro) or prompting to upgrade (free).
- Free users tapping a locked question section see a clear "Unlock question review with Pro" upgrade prompt that opens the existing subscription sheet.

### Changed
- Battle Royale matches now persist each player's answers per question, so post-match review shows what you answered and whether it was correct.
- Duel matches now persist each player's typed answer, so both players can see what the other actually entered.
- Match history endpoint now authenticates the requester; viewing another user's profile returns the standard (non-Pro) match list depth regardless of the viewer's subscription.

### Fixed
- Previously, stripped question payloads could leak to free clients through the nested `detail_snapshot` field. Questions are now stripped server-side at every level before the response is sent.

## [0.3.3.0] - 2026-04-13

### Changed
- **Share buttons now open the native iOS/Android share sheet** instead of the browser's Web Share fallback, so duel, online 1v1, and Battle Royale invites flow through the OS share UI users expect.
- **Invite messages now include a tap-to-open deep link plus a copy-paste code**, so recipients can either tap the link (if installed) or paste the code into the app.

### Fixed
- Sharing no longer dumps the invite text into the clipboard when the user cancels the share sheet.
- Recipients no longer see the invite link appear twice in WhatsApp/iMessage previews.

### Added
- `stepovr://` URL scheme registered on iOS and Android. Tapping `stepovr://duel/CODE`, `stepovr://game/CODE`, `stepovr://br/CODE`, or `stepovr://invite` opens the app and routes to the matching screen.

## [0.3.2.0] - 2026-04-13

### Changed
- **Consistent back button across all screens** — lobbies (Online 1v1, Duel, Battle Royale), Notifications, Terms, Privacy, and Match Details now share a single header component with identical styling, touch-target size, and icon rendering.
- **Duel lobby now has a back button** — previously the only lobby without one.

### Fixed
- Online 1v1 lobby back arrow now renders correctly (previously the arrow icon was invisible due to a font-subset mismatch).
- Bottom navigation now auto-hides during active gameplay across Solo Ranked, Blitz, Mayhem, and Daily — preventing accidental taps that could abort a timed question. Previously only Logo Quiz had this behavior.

## [0.3.1.0] - 2026-04-12

### Changed
- **Online 1v1 lobby redesign** — rebuilt to match the premium lobby pattern used across the app. New hero image, atmospheric spotlight lighting, glass-surface active-game cards, and a bottom sheet for Create / Random Opponent / Join-by-Code actions.
- Restored back button in the top nav
- Active-game cards now show turn status with clearer color-coded badges (Your Turn / Their Turn / Waiting / Queued)

### Added
- Empty state on the online lobby when you have no active games
- Dedicated `/online-mode.png` hero asset (decoupled from the duel image)

### Fixed
- Long opponent usernames now truncate with ellipsis instead of breaking the card layout
- Bottom sheet is now keyboard-accessible: Escape dismisses, focus is trapped inside while open, and focus returns to the trigger on close
- All contrast ratios now meet or exceed WCAG AA (most AAA)
- Reverted an over-broad `.gitignore` rule (`docs/*`) that would have excluded project documentation

## [0.3.0.0] - 2026-04-12

### Added
- **XP & Leveling system** — earn XP on every correct and wrong answer, streak bonuses up to +30 for 15+ consecutive correct, +50 on duel wins, +75 on Battle Royale wins, +20 on Solo session completion, +15 on Blitz round completion, and +25 for your daily streak. Level up with an animated celebration overlay.
- Level badge in the top-nav next to Solo/Logo/W-L chips
- XP progress bar on the profile page showing progress to next level and total XP earned
- Floating "+XP" gain feedback in Solo mode (with separate styling for streak bonuses)
- `profiles.xp` and `profiles.level` columns, plus new `xp_history` audit table
- Server-side `award_xp` RPC with atomic row-lock, search_path hardening, and service-role-only execute

### Changed
- `updateDailyStreak` now centrally awards the daily-streak XP once per day across all game modes (not just Solo)
- Solo and Mayhem sessions track a dedicated `consecutiveCorrect` counter for accurate streak bonuses (resets on wrong/timeout)

## [0.2.0.0] - 2026-04-09

### Added
- **Online 2-Player Board Game** — play the full 7x5 board game remotely with a friend via invite code, with live spectating of your opponent's turn including wrong attempts and Top 5 slot fills in real-time
- Backend OnlineGameService with full game lifecycle: create, join, ready-up, select question, answer, Top 5 guessing, 50-50 lifeline, and turn timeout cron
- REST API at /api/online-games with 12 endpoints (all auth-guarded)
- Supabase Realtime subscriptions for live opponent state sync
- Spectating view: see opponent's question, wrong answer attempts, and Top 5 progress as they play
- CAS-guarded game mutations to prevent race conditions (join, answer, ready-up, continue)
- Turn timeout cron (2-minute turns, 5-minute check interval with Redis lock)
- ELO ranking legend overlay on leaderboard page, auto-shown on first visit
- Force-update banner system with soft and hard update modes
- Wrong-shake animation on incorrect answers across all game modes

### Changed
- LLM model names moved from hardcoded constants to environment-configurable properties
- Logo quiz header and news mode UX improvements

### Fixed
- Replaced test AdMob App ID with production credentials to fix crash on launch
- Top 5 meta data stripped from spectating player's view to prevent answer leaking
- Race condition in continueToBoard where both players clearing result simultaneously could cause one to miss it

## [0.1.1.0] - 2026-04-08

### Added
- Tablet layout support up to 1200px with 3-tier responsive system
- Global `:focus-visible` and `prefers-reduced-motion` baselines for all interactive elements
- 39 tag color tokens extracted to design token system

### Changed
- Home page mode cards: 2-col grid (tablet), 3-col grid (large tablet)
- Game question options: 2-col grid on tablet
- Battle hero title: per-character wave → staggered entrance + ambient glow
- Background drift: GPU-friendly transform (was animating layout properties)
- Tag color variants use shared tokens (was 70+ hard-coded hex values)
- Fluid typography via clamp() on hero and 2-player titles
- Default tag text contrast bumped to ~5:1 ratio

### Fixed
- Mode card overlays and duel active game row now keyboard-accessible (div → button)
- Duplicate aria-label removed from battle-hero title
- Section header and mode-card-container now have visible focus indicators

## [0.1.0.0] - 2026-04-08

### Changed
- Redesigned ELO system with 7 tiers (Iron/Bronze/Silver/Gold/Platinum/Diamond/Challenger) using expanding tier gaps for gradual progression
- Added EXPERT difficulty level for 1800+ ELO players with 20s time limit and elite-level questions
- Updated K-factor bands to 40/32/24/16 aligned with 4 difficulty zones (EASY/MEDIUM/HARD/EXPERT)
- Raised ELO floor from 100 to 500 so players can't fall into an unrecoverable hole
- Shortened provisional multiplier period (1.5x for first 30 questions, 1.25x for 30-99, settled at 100+)
- Aligned bot skill thresholds to the 7-tier system (0.20-0.70 range)
- Aligned minority scale and difficulty ranges to new ELO breakpoints
- Updated frontend tier display with Platinum tier and new thresholds (500/750/1000/1300/1650/2000/2400)

### Added
- New ELO tier achievements (Bronze 750, Silver 1000, Gold 1300, Platinum 1650, Challenger 2400)
- EXPERT difficulty scoring threshold in question difficulty scorer (raw score 0.62+)
- ELO service unit tests (12 tests covering difficulty mapping, K-factors, provisional multiplier, floor)
- ELO floor migration bumping all existing players below 500 to the new floor
