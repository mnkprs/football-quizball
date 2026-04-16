# Changelog

All notable changes to Stepover will be documented in this file.

## [0.6.3.1] - 2026-04-16

### Fixed
- **Question screen black band + overflow scroll** — post-redesign polish caught in live play: `.question-page` had its own `background: var(--color-bg)` (#131313 dark grey) which contrasted with the outer `game.html` wrapper's `bg-background` (#000 in dark), rendering a visible "black box" band above the back button. Removed the explicit bg so the page inherits the wrapper. Also replaced `min-h-screen` on the inner page with `flex-1` inside the now-flex game wrapper — fixes the overflow scroll that was hiding the "Report a problem" button below the viewport (previous stack was double `min-h-screen` + shell-main's reserved 88px bottom-nav space).

## [0.6.3.0] - 2026-04-16

### Changed
- **Question screen redesign** — realigned `app-question` component to the Floodlit Arena design system (DESIGN.md, 2026-03-24). The component had drifted back to a pre-redesign "premium glass" aesthetic using lime `rgba(204,255,0,*)` instead of the brand accent iOS blue `#007AFF`. Audit identified 15 findings; fixed via two atomic commits: a CSS rewrite (555 → 139 lines) that replaces glass-on-everything with tonal surface steps, removes 4 idle infinite animations (shimmer, player-glow, double-armed-glow, corner-blob gradients), flattens the skeuomorphic Higher/Lower buttons, and restores the iOS blue accent throughout; and a template pass that tightens `rounded-2xl` (16px) → `rounded-xl` (12px) on primary cards per DESIGN.md radius hierarchy, upgrades the question text to Inter title-lg (1.375rem/600), adds keyboard-visible focus rings to 50-50 + lifeline + HOL + submit + report buttons, and drops the HOL icon stroke-width from 3 to 2. Full audit at `~/.gstack/projects/mnkprs-football-quizball/designs/design-audit-20260416-question-component/`.

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
