# Changelog

All notable changes to Stepover will be documented in this file.

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
