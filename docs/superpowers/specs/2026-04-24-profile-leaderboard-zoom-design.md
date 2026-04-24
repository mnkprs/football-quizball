# Profile refactor + leaderboard cap + pinch-zoom + duel/logo-duel stat separation

**Date:** 2026-04-24
**Branch:** `feat/profile-leaderboard-zoom`
**Status:** Design

---

## Summary

Four connected UI/UX changes plus one backend correctness fix, all landing on one feature branch because the profile screen is the shared surface.

1. **Profile tier-progress swap** — replace the inline `tier-progress--link` strip with the DS primitive `so-tier-progress`.
2. **Ratings card** — new section directly below the hero showing every ELO/rating the user has (Solo, Logo Quiz, Logo Quiz Hardcore, Duel, Logo Duel), with the XP card stuck to its bottom edge.
3. **Achievements → `/profile/achievements`** — lift the bulky categorized grid off the profile screen onto its own route; profile page keeps a compact preview of the 5 most-recently-earned.
4. **Pinch-zoom everywhere** — unblock zoom across all three layers (viewport meta, iOS WKWebView, Android WebView).
5. **Leaderboard top-10 cap** — cap each leaderboard list at 10 rows (3 podium + 7 list) with a pinned "me" row below the separator for anyone outside the top 10.
6. **Duel / Logo Duel stat separation (backend)** — stop conflating standard duels and logo duels in `profiles.duel_wins`, the achievement pipeline, and expose logo duels as a separate sub-tab on the Duel leaderboard.

All changes are additive except the achievements-on-profile grid (removed in favor of the `/profile/achievements` route). No data migrations beyond one additive column.

---

## 1. Profile tier-progress → `so-tier-progress`

### Current state

`frontend/src/app/features/profile/profile.html:109-121` renders a hand-rolled `.tier-progress--link` block that wraps the rank label pair + a flat progress bar inside an `<a routerLink="/profile/tier">`. Styles live at `profile.css:261-301`. The DS already has `so-tier-progress` at `frontend/src/app/shared/ui/so-tier-progress/so-tier-progress.ts` (adopted by `/profile/tier` itself).

### Change

Replace the custom markup with `<a routerLink="/profile/tier">` wrapping a `<so-tier-progress>`. Bind:

| Input       | Source                                                   |
|-------------|----------------------------------------------------------|
| `tier`      | `rankTier().label`                                       |
| `nextTier`  | `nextTierLabel()`                                        |
| `elo`       | `profile()?.elo ?? 1000`                                 |
| `nextElo`   | `nextTierThreshold(profile()?.elo ?? 1000) ?? elo`       |
| `tierStart` | needs a new `currentTierStart` computed (copy from `ProfileTierComponent.currentTierStart`) |
| `color`     | `rankTier().color` — tier-tinted fill                    |

Drop the `@if (nextTierLabel())` guard outcome: if user is at GOAT (no next tier), hide the strip entirely — `so-tier-progress` expects a `nextTier`, we shouldn't render it at all when `nextTierLabel() === null`.

### Delete

- `profile.css:261-301` — the `.tier-progress*` ruleset (all five selectors).
- From `profile.html`: lines 109-121.

---

## 2. Ratings card — multiple ELOs, XP stuck below

### Decision

Answer b from brainstorm: XP card is its own surface directly below the hero, no gap. But the new Ratings card sits **between** hero and XP, showing every rating the user has.

### Layout

```
┌─ Hero (unchanged — avatar, name, tier chip, so-tier-progress) ─┐
├────────────────────────────────────────────────────────────────┤
│  Ratings                                                       │
│  ┌──────────────┬──────────────┬──────────────┐               │
│  │ Solo Ranked  │ Logo Quiz    │ Logo Hardcore│               │
│  │ 1420 ELO     │ 980 ELO      │ 850 ELO      │               │
│  │ Pro tier     │ Substitute   │ Academy      │               │
│  ├──────────────┼──────────────┴──────────────┤               │
│  │ Duel         │ Logo Duel                   │               │
│  │ 12W — 8L     │ 3W — 5L                     │               │
│  └──────────────┴─────────────────────────────┘               │
│                                                                │
│  Level 7 · 2,340 XP        [progress bar]                     │
│  640 XP to Level 8                                            │
└────────────────────────────────────────────────────────────────┘
```

### Ratings card component

New shared component: `frontend/src/app/shared/ui/so-rating-card/so-rating-card.ts` (singular — a single tile), composed into a grid on profile.

**Two variants via `type` input:**

- `type="elo"` — shows label + ELO value + tier pill. Takes `tier: EloTier` for the pill color.
- `type="record"` — shows label + "W — L" value + optional win-rate subtitle. Used for Duel / Logo Duel.

Props:

```typescript
interface SoRatingCardProps {
  label: string;           // "Solo Ranked" / "Duel"
  type: 'elo' | 'record';
  value: number;           // ELO or wins
  secondaryValue?: number; // losses, for type='record'
  tier?: EloTier;          // for type='elo', drives pill color
  icon?: string;           // Material icon name
  routerLink?: string;     // optional — tap opens drilldown
}
```

### Profile changes

- Remove "This Season" 4-stat grid (`profile.html:139-156`) — Peak ELO is already captured in Solo Ranked card; Accuracy, Questions, Achievements counts move to `/profile/achievements` and mode detail screens.
- New section below hero, before ELO Progression:

```html
<section class="section ratings">
  <so-section-header label="Ratings" />
  <div class="ratings-grid">
    <so-rating-card label="Solo Ranked" type="elo" [value]="profile()?.elo ?? 1000" [tier]="rankTier()" icon="military_tech" routerLink="/profile/tier" />
    <so-rating-card label="Logo Quiz" type="elo" [value]="profile()?.logo_quiz_elo ?? 1000" [tier]="logoQuizTier()" icon="extension" />
    <so-rating-card label="Logo Hardcore" type="elo" [value]="profile()?.logo_quiz_hardcore_elo ?? 1000" [tier]="logoHardcoreTier()" icon="local_fire_department" />
    <so-rating-card label="Duel" type="record" [value]="duelRecord().wins" [secondaryValue]="duelRecord().losses" icon="sports_mma" />
    <so-rating-card label="Logo Duel" type="record" [value]="logoDuelRecord().wins" [secondaryValue]="logoDuelRecord().losses" icon="swords" />
  </div>
</section>

<section class="section xp-stuck">
  <so-xp-card [level]="level()" [xp]="xp()" [pct]="xpPct()" [remaining]="xpRemaining()" />
</section>
```

CSS: `.ratings-grid` uses CSS Grid `grid-template-columns: repeat(2, 1fr); gap: 0.625rem;` — 3 ELO tiles on row 1 (one spans 2 columns on 2-col grid — actually better as `repeat(2, 1fr)` with 5 tiles; see visual above). Need to decide final grid based on pixel rendering; default plan is a 2-column grid so the 5 cards flow as 2/2/1 with the last tile full-width.

### New `so-xp-card` component

Factor current inline `.xp-card` markup into `frontend/src/app/shared/ui/so-xp-card/so-xp-card.ts`. Four inputs (`level`, `xp`, `pct`, `remaining`). Internal layout uses `so-progress-track`. Styles migrate from `profile.css:304-342`.

"Stuck below" = the `<section>` wrapping `so-xp-card` uses `margin-top: 0` (cancel the default `.section` vertical rhythm) and the card itself has a subtle top-border transition with the Ratings card above it, OR the Ratings card's bottom radius is flattened and the XP card's top radius is flattened so they visually snap together. Final pick lands during implementation — simplest viable option wins.

### Backend profile endpoint

`SoloApiService.getProfile(userId)` already returns `LeaderboardEntry` with `elo`, `logo_quiz_elo`, `logo_quiz_hardcore_elo`, `xp`, `level`. Need to add:

- `duel_wins`, `duel_losses` (from `get_duel_user_stats` RPC — `game_type = 'standard'`)
- `logo_duel_wins`, `logo_duel_losses` (from new `get_logo_duel_user_stats` RPC — `game_type = 'logo'`)

Extend `GET /api/solo/profile/:userId` response to include these two extra records, sourced via the existing RPC path (no new endpoint).

---

## 3. Achievements → `/profile/achievements`

### New route

`frontend/src/app/features/profile-achievements/profile-achievements.ts|.html|.css` — follows the exact pattern of `frontend/src/app/features/profile-tier/`:

- Loads via `AchievementsApiService.getForUser(userId)`.
- Renders the categorized grid verbatim from the current profile screen (`profile.html:254-298`).
- Header with back button, total earned pill.
- Achievement detail popup stays here (moved from profile).
- ChangeDetection.OnPush.

Route registration in `frontend/src/app/app.routes.ts`: insert before `profile/:userId` like the existing tier/history routes:

```typescript
{ path: 'profile/achievements', loadComponent: () => import('./features/profile-achievements/profile-achievements').then(m => m.ProfileAchievementsComponent) },
```

### Profile page compact section

Replace the full grid with a short preview block:

```html
<section class="section">
  <so-section-header [label]="lang.t().achievements" />
  <div class="section__head-extras">
    <span class="achievements-counter">{{ achievementsEarned() }} / {{ achievements().length }}</span>
    @if (isOwnProfile()) {
      <a class="section__see-all" routerLink="/profile/achievements">View all ›</a>
    }
  </div>
  <div class="achievements-preview">
    @for (a of recentAchievements(); track a.id) {
      <span class="achievement-tile-small">{{ a.icon }}</span>
    }
  </div>
</section>
```

`recentAchievements` computed: `this.achievements().filter(a => a.earned_at).sort((a, b) => b.earned_at!.localeCompare(a.earned_at!)).slice(0, 5)`.

Empty state: when `achievementsEarned() === 0`, show a minimal "No achievements yet — View all ›" CTA to keep the section functional.

### Profile CSS cleanup

Drop from `profile.css`:
- `.achievements-group*` (all four selectors)
- `.achievements-grid`
- `.achievement-tile*` (all six selectors)
- `.achv-popup*` (all popup selectors — it moves to the achievements route)

From `profile.ts`:
- Remove `selectedAchievement` signal + popup template + `categorizedAchievements` computed + `categoryMeta` + `progressPercent` — all move to `ProfileAchievementsComponent`.
- Keep `achievements` signal (still needed for the counter + recent preview).
- Add `recentAchievements` computed.

---

## 4. Pinch-zoom everywhere

### Three-layer unblock

**Layer 1 — viewport meta** (`frontend/src/index.html:7`):

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover">
```

Default iOS WKWebView behavior is already to respect `user-scalable=yes`. Add `maximum-scale=5` to cap zoom at a sane 5x. Android WebView ignores `user-scalable` by default unless zoom is explicitly enabled in `WebSettings`.

**Layer 2 — iOS** — no code change needed. The viewport meta change covers it.

**Layer 3 — Android** — override `onCreate` in `frontend/android/app/src/main/java/com/stepovr/app/MainActivity.java`:

```java
@Override
public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    bridge.getWebView().getSettings().setSupportZoom(true);
    bridge.getWebView().getSettings().setBuiltInZoomControls(true);
    bridge.getWebView().getSettings().setDisplayZoomControls(false);
}
```

`setDisplayZoomControls(false)` hides the legacy on-screen +/- overlay; pinch-gesture zoom still works.

### Known caveats

- Double-tap-to-zoom may conflict with tap-heavy game screens. Accepting this trade-off per user decision (answer **a**: everywhere, always).
- Capacitor's `@capacitor/keyboard` plugin (already configured with `resize: 'none'`) and zoom should coexist — needs QA check on a real device.
- iOS Safari layouts sometimes jitter on zoom with `viewport-fit=cover`. If it misbehaves, fallback is to drop `viewport-fit=cover` and use safe-area-inset CSS per-screen.

---

## 5. Leaderboard top-10 cap

### Current

`frontend/src/app/features/leaderboard/lb-section/lb-section.ts:31-34`:

```typescript
listRows = computed(() => {
  const rows = this.rows();
  return rows.length >= 3 ? rows.slice(3) : rows;
});
```

Returns every row after the podium — potentially thousands on the solo leaderboard. `lb-list__link` has per-row fade-in animations which keep firing infinitely as the scroll reveals them.

### Change

Cap to 10 total visible rows (3 podium + 7 list):

```typescript
listRows = computed(() => {
  const rows = this.rows();
  return rows.length >= 3 ? rows.slice(3, 10) : rows.slice(0, 10);
});
```

The fallback (`rows.length < 3`, no podium) already caps at 10 so tiny leaderboards aren't affected weirdly.

### "Me below" separator

`showMeBelow` already evaluates correctly — it checks whether `meRow.id` is in `this.rows()`. But `this.rows()` is the raw input, which contains everything the backend returned. The separator should only show "me below" when the user is outside the **visible** top 10, not outside the returned payload.

Fix:

```typescript
showMeBelow = computed(() => {
  const me = this.meRow();
  if (!me) return false;
  const visibleIds = new Set(this.rows().slice(0, 10).map(r => r.id));
  return !visibleIds.has(me.id);
});
```

### Backend limit

`backend/src/leaderboard/leaderboard.controller.ts`: verify the `LIMIT` constant. If it's currently 100, bump down to a 10 payload plus a separate "me" entry — which is already wired via `getMyLeaderboardEntries`. That existing plumbing is exactly what we need; just make the main list 10.

Leaderboard caching (`LEADERBOARD_TTL`) is per-limit-key — changing limit invalidates the old cache naturally.

---

## 6. Duel / Logo Duel stat separation (backend)

### The contamination

Every finished duel — standard or logo — increments the same `profiles.duel_wins` column via `SupabaseService.incrementDuelWins()` (`backend/src/supabase/supabase.service.ts:791`), which is called unconditionally in `DuelService.submitAnswer()` (`backend/src/duel/duel.service.ts:493`). Two downstream effects:

- **Achievements** (`backend/src/achievements/achievements.service.ts:237-239`): `duel_5_wins`, `duel_50_wins`, `duel_100_wins` unlock from any combined duel-win count — so a player who only plays logo duels still unlocks "Duel veteran" achievements intended for standard duel mastery.
- **`profiles.duel_wins` display**: anywhere the raw column is shown (currently nowhere — but spec §2 adds it to the profile Ratings card) would conflate the two modes.

Leaderboard RPCs (`supabase/migrations/20260330000000_duel_leaderboard_rpcs.sql`) already filter `game_type = 'standard'` so they're clean. Similarly `getDuelWinCount`, `getDuelGameCount` (in `supabase.service.ts:637-656`) read `duel_games` directly — but they don't filter by `game_type`, so achievement-trigger logic is also reading the conflated number.

### Schema change

New migration `supabase/migrations/YYYYMMDDHHMMSS_profiles_logo_duel_wins.sql`:

```sql
ALTER TABLE profiles ADD COLUMN logo_duel_wins int NOT NULL DEFAULT 0;

-- Backfill existing logo-duel wins from the source of truth.
UPDATE profiles p SET logo_duel_wins = (
  SELECT COUNT(*)
  FROM duel_games g
  WHERE g.status = 'finished'
    AND g.game_type = 'logo'
    AND g.scores IS NOT NULL
    AND (
      (g.host_id = p.id AND (g.scores->>'host')::int > (g.scores->>'guest')::int)
      OR
      (g.guest_id = p.id AND (g.scores->>'guest')::int > (g.scores->>'host')::int)
    )
);

-- Also correct existing duel_wins to be standard-only. Currently conflated.
UPDATE profiles p SET duel_wins = (
  SELECT COUNT(*)
  FROM duel_games g
  WHERE g.status = 'finished'
    AND g.game_type = 'standard'
    AND g.scores IS NOT NULL
    AND (
      (g.host_id = p.id AND (g.scores->>'host')::int > (g.scores->>'guest')::int)
      OR
      (g.guest_id = p.id AND (g.scores->>'guest')::int > (g.scores->>'host')::int)
    )
);
```

Both updates are idempotent (recomputed from `duel_games`) so re-running is safe.

### Code changes

**`SupabaseService`** (`backend/src/supabase/supabase.service.ts`):

- `incrementDuelWins(userId, gameType: 'standard' | 'logo')` — switch on `gameType` to update either `duel_wins` or `logo_duel_wins`.
- `getDuelWinCount(userId, gameType?: 'standard' | 'logo')` — add `.eq('game_type', gameType)` when provided. When omitted, preserves the existing total-across-all behavior (still useful for some UI aggregates).
- `getDuelGameCount(userId, gameType?: 'standard' | 'logo')` — same pattern.
- New: `getLogoDuelLeaderboard`, `getLogoDuelLeaderboardEntryForUser` — identical wiring to `getDuelLeaderboard` but hitting new RPCs.
- Update `getProfile` select list to include `logo_duel_wins`.

**`DuelService.submitAnswer`** (`backend/src/duel/duel.service.ts:493`): pass `row.game_type` into `incrementDuelWins`.

**`AchievementsService`** (`backend/src/achievements/achievements.service.ts`):
- Pass `duelGameType: 'standard'` filter when reading `duelWins` for existing `duel_5/50/100_wins` achievements (so they only count standard duels).
- Defer logo-duel achievements to a follow-up (YAGNI for v1).

**New RPCs** (`supabase/migrations/YYYYMMDDHHMMSS_logo_duel_leaderboard_rpcs.sql`):

Exact copy of `get_duel_leaderboard`, `get_duel_rank`, `get_duel_user_stats` with `game_type = 'logo'` substituted. Name prefix: `get_logo_duel_*`.

**Leaderboard controller** (`backend/src/leaderboard/leaderboard.controller.ts`):
- Return value gets a new `logoDuel` field alongside existing `duel`.
- `getMyLeaderboardEntries` gets a new `logoDuelMe` field.

### Frontend

**Leaderboard tabs** (`frontend/src/app/features/leaderboard/leaderboard.ts`):
- Add Logo Duel as a mode tab option (mirrors how Logo Normal/Hardcore are sub-tabs of Logo). Alternatives considered:
  - **(a)** Duel has a sub-tab strip like Logo (Normal / Logo). **Preferred** — keeps the top-level tab count (3) stable.
  - **(b)** Add a 4th top-level tab "Logo Duel". Rejected — top-level clutter, inconsistent with the Logo Normal/Hardcore pattern.

Going with (a). New `DuelSubTab = 'standard' | 'logo'`, mirror the `LOGO_SUB_TABS` wiring.

**`LeaderboardApiService`**: add `DuelLeaderboardEntry` variant + `logoDuel` / `logoDuelMe` keys matching backend.

**Match history mode label**: already differentiates 'Logo Duel' vs 'Duel' (checked in exploration). No change.

---

## Architecture map

### Files touched — frontend

**New:**
- `frontend/src/app/shared/ui/so-rating-card/so-rating-card.ts` — ELO/record tile
- `frontend/src/app/shared/ui/so-xp-card/so-xp-card.ts` — factored from profile
- `frontend/src/app/features/profile-achievements/profile-achievements.{ts,html,css}`

**Modified:**
- `frontend/src/app/features/profile/profile.{ts,html,css}` — tier-progress swap, ratings card, xp card lift, achievements compact preview
- `frontend/src/app/features/leaderboard/leaderboard.{ts,html,css}` — duel sub-tab
- `frontend/src/app/features/leaderboard/lb-section/lb-section.ts` — top-10 cap + showMeBelow fix
- `frontend/src/app/core/leaderboard-api.service.ts` — logoDuel types
- `frontend/src/app/core/solo-api.service.ts` — profile response extension
- `frontend/src/app/app.routes.ts` — `/profile/achievements` registration
- `frontend/src/index.html` — viewport meta
- `frontend/android/app/src/main/java/com/stepovr/app/MainActivity.java` — zoom settings
- `frontend/src/app/shared/ui/index.ts` — export new components

### Files touched — backend

**New migrations:**
- `supabase/migrations/YYYYMMDDHHMMSS_profiles_logo_duel_wins.sql`
- `supabase/migrations/YYYYMMDDHHMMSS_logo_duel_leaderboard_rpcs.sql`

**Modified:**
- `backend/src/supabase/supabase.service.ts` — split increments, new getters, updated selects
- `backend/src/duel/duel.service.ts` — pass game_type into increment
- `backend/src/achievements/achievements.service.ts` — filter duel wins to standard only
- `backend/src/leaderboard/leaderboard.controller.ts` — add logoDuel channel
- `backend/src/solo/solo.service.ts` — include duel/logo-duel records in profile response
- `backend/src/common/interfaces/profile.interface.ts` — `logo_duel_wins: number`

---

## Testing strategy

- **Unit**: `lb-section.listRows` + `showMeBelow` (capped behavior + me-below trigger at rank 11+).
- **Backend unit**: `SupabaseService.incrementDuelWins(userId, 'standard')` vs `'logo'` updates the correct column.
- **Integration**: `GET /api/leaderboard` response includes `logoDuel[]`; standard-duel achievement trigger only counts standard.
- **E2E (manual on real device)**: pinch-zoom works on iOS and Android on all route families (hero/list/game/modal). Double-tap behavior verified on game screens. Zoom persists reasonably across navigation — expected fallback: reset scale on route change if persistence is visually broken.
- **Visual**: profile Ratings grid renders for users with no logo-duel history (shows 0W — 0L).

---

## Migration risk

- **Backfill accuracy**: the SQL backfill is deterministic and idempotent; worst case a re-run just recomputes the same values.
- **Achievement re-trigger**: users whose conflated `duel_wins` crossed thresholds only because of logo duels will see those achievements **stay earned** (`user_achievements` rows aren't removed). Net effect: no user loses an achievement; new unlocks are now gated correctly. This is an intentional one-way trip — acceptable per YAGNI.
- **Android MainActivity.java** may not exist yet as a custom override. If Capacitor generated `MainActivity.java` as a stub delegating to `BridgeActivity`, we just add the `onCreate` override. Need to verify at implementation time.

---

## Out of scope (follow-ups)

- **Logo-duel specific achievements** (`logo_duel_5/50/100_wins`).
- **Logo duel ELO** — neither duel mode has ELO today; no change to that.
- **Duel mode detail screen** (like `/profile/tier`) — not needed for v1, routerLink on rating card is optional.
- **Route-level zoom scoping** — if pinch-zoom everywhere causes problems in gameplay, revisit with a route-toggle approach later.
- **App Store / Play Store version bumps** (the 3 unstaged native-version files) — separate release PR.

---

## Version & changelog

- Bump `VERSION` → `0.10.0.0` (minor feature + breaking-ish backend change in how stats are split).
- Add a `## [0.10.0.0] — 2026-04-24` CHANGELOG entry summarizing the six changes above.

---

## Validation self-review

- ✅ No placeholders / TBDs — all user-TBDs were answered in brainstorm.
- ✅ No contradictions — Ratings card (§2) uses same `game_type`-filtered duel wins that backend (§6) produces.
- ✅ Scope is single-PR-sized — 6 items, but all converge on the profile screen + one backend column split.
- ✅ Ambiguity: the Ratings grid layout (5 cards, 2-col grid) will finalize at CSS time. Flagged explicitly.
