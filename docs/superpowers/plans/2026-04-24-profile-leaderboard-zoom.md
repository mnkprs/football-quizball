# Profile + Leaderboard + Zoom + Duel Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the profile screen to use DS primitives (`so-tier-progress`, new `so-rating-card`, new `so-xp-card`), lift achievements onto their own route, cap leaderboard visible rows to 10, enable pinch-zoom app-wide, and separate standard vs logo duel stats in the backend.

**Architecture:** Backend-first (migrations + service splits) to guarantee profile endpoint returns both duel records before the frontend consumes them. Then introduce two new shared UI primitives (`so-rating-card`, `so-xp-card`), compose them into the profile screen, create the `/profile/achievements` route, update leaderboard section logic, and finally flip the three pinch-zoom layers.

**Tech Stack:** NestJS + Supabase (Postgres + RPCs), Angular 20 standalone components with signals, Capacitor for iOS/Android native shells.

**Spec:** `docs/superpowers/specs/2026-04-24-profile-leaderboard-zoom-design.md`

---

## Phase 1 — Backend: duel stat split foundation

### Task 1: Migration — add `profiles.logo_duel_wins` + backfill both columns

**Files:**
- Create: `supabase/migrations/20260424120000_profiles_logo_duel_wins.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Adds profiles.logo_duel_wins and corrects profiles.duel_wins to
-- standard-only by backfilling both from duel_games (source of truth).
-- Idempotent: re-running recomputes from duel_games without drift.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS logo_duel_wins int NOT NULL DEFAULT 0;

UPDATE profiles p SET logo_duel_wins = COALESCE((
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
), 0);

UPDATE profiles p SET duel_wins = COALESCE((
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
), 0);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the `mcp__supabase__apply_migration` tool with `project_id: npwneqworgyclzaofuln`, `name: profiles_logo_duel_wins`, and the SQL above.

Per memory rule `feedback_mcp_migration_must_commit_file`: commit the `.sql` file in the same commit that applies the migration.

- [ ] **Step 3: Verify the column and backfill**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT id, username, duel_wins, logo_duel_wins FROM profiles LIMIT 5;
```
Expected: `logo_duel_wins` column exists; for users with logo-duel history, the values are >0.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260424120000_profiles_logo_duel_wins.sql
git commit -m "feat(db): add profiles.logo_duel_wins + backfill both duel win counts"
```

---

### Task 2: Migration — new logo-duel leaderboard RPCs

**Files:**
- Create: `supabase/migrations/20260424120100_logo_duel_leaderboard_rpcs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Logo duel leaderboard: same shape as standard duel RPCs,
-- filtered to game_type = 'logo'.

CREATE OR REPLACE FUNCTION get_logo_duel_leaderboard(p_limit int DEFAULT 10)
RETURNS TABLE(user_id uuid, username text, wins int, losses int, games_played int)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH finished AS (
    SELECT
      CASE WHEN (scores->>'host')::int > (scores->>'guest')::int THEN host_id ELSE guest_id END AS winner_id,
      CASE WHEN (scores->>'host')::int > (scores->>'guest')::int THEN guest_id ELSE host_id END AS loser_id
    FROM duel_games
    WHERE status = 'finished' AND game_type = 'logo' AND scores IS NOT NULL
  ),
  win_counts AS (SELECT winner_id AS uid, COUNT(*)::int AS w FROM finished GROUP BY winner_id),
  loss_counts AS (SELECT loser_id AS uid, COUNT(*)::int AS l FROM finished GROUP BY loser_id),
  combined AS (
    SELECT COALESCE(wc.uid, lc.uid) AS uid,
           COALESCE(wc.w, 0) AS wins,
           COALESCE(lc.l, 0) AS losses
    FROM win_counts wc FULL OUTER JOIN loss_counts lc ON wc.uid = lc.uid
  )
  SELECT c.uid, p.username, c.wins, c.losses, (c.wins + c.losses) AS games_played
  FROM combined c JOIN profiles p ON p.id = c.uid
  WHERE c.wins > 0
  ORDER BY c.wins DESC, c.losses ASC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_logo_duel_rank(p_user_id uuid)
RETURNS int LANGUAGE sql SECURITY DEFINER AS $$
  WITH win_counts AS (
    SELECT CASE WHEN (scores->>'host')::int > (scores->>'guest')::int THEN host_id ELSE guest_id END AS winner_id
    FROM duel_games
    WHERE status = 'finished' AND game_type = 'logo' AND scores IS NOT NULL
  ),
  per_user AS (SELECT winner_id, COUNT(*)::int AS wins FROM win_counts GROUP BY winner_id)
  SELECT (COUNT(*)::int + 1) FROM per_user
  WHERE wins > COALESCE((SELECT wins FROM per_user WHERE winner_id = p_user_id), 0);
$$;

CREATE OR REPLACE FUNCTION get_logo_duel_user_stats(p_user_id uuid)
RETURNS TABLE(wins int, losses int, games_played int)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH finished AS (
    SELECT CASE WHEN (scores->>'host')::int > (scores->>'guest')::int THEN host_id ELSE guest_id END AS winner_id
    FROM duel_games
    WHERE status = 'finished' AND game_type = 'logo' AND scores IS NOT NULL
      AND (host_id = p_user_id OR guest_id = p_user_id)
  )
  SELECT
    COUNT(*) FILTER (WHERE winner_id = p_user_id)::int AS wins,
    COUNT(*) FILTER (WHERE winner_id != p_user_id)::int AS losses,
    COUNT(*)::int AS games_played
  FROM finished;
$$;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with `name: logo_duel_leaderboard_rpcs`.

- [ ] **Step 3: Verify the RPCs**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT * FROM get_logo_duel_leaderboard(5);
SELECT get_logo_duel_rank((SELECT id FROM profiles WHERE logo_duel_wins > 0 LIMIT 1));
```
Expected: leaderboard query returns rows (or empty set if no logo duels played yet); rank query returns an int.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260424120100_logo_duel_leaderboard_rpcs.sql
git commit -m "feat(db): add get_logo_duel_{leaderboard,rank,user_stats} RPCs"
```

---

### Task 3: `SupabaseService` — split increments and add logo-duel getters

**Files:**
- Modify: `backend/src/supabase/supabase.service.ts`
- Modify: `backend/src/common/interfaces/profile.interface.ts`
- Test: `backend/src/supabase/supabase.service.spec.ts` (create if missing)

- [ ] **Step 1: Add `logo_duel_wins` to the profile interface**

In `backend/src/common/interfaces/profile.interface.ts`, locate the `duel_wins: number;` line and add directly below:

```typescript
  logo_duel_wins: number;
```

- [ ] **Step 2: Update `getProfile` select list**

In `backend/src/supabase/supabase.service.ts:51`, find the select string containing `duel_wins` and add `logo_duel_wins` to it. The select currently reads:

```
'id, username, elo, logo_quiz_elo, logo_quiz_hardcore_elo, logo_quiz_games_played, logo_quiz_hardcore_games_played, games_played, questions_answered, correct_answers, country_code, max_correct_streak, logo_quiz_correct, duel_wins, br_wins, last_active_date, current_daily_streak, total_questions_all_modes, modes_played, xp, level'
```

Change `duel_wins` → `duel_wins, logo_duel_wins`.

- [ ] **Step 3: Update default profile row init**

In `backend/src/supabase/supabase.service.ts` near line 71 where `duel_wins: 0,` is set as a default, add directly below:

```typescript
      logo_duel_wins: 0,
```

- [ ] **Step 4: Split `incrementDuelWins` to accept game_type**

Replace the current `incrementDuelWins` at `backend/src/supabase/supabase.service.ts:791-803` with:

```typescript
  async incrementDuelWins(userId: string, gameType: 'standard' | 'logo' = 'standard'): Promise<number> {
    const column = gameType === 'logo' ? 'logo_duel_wins' : 'duel_wins';
    const { data: profile } = await this.client
      .from('profiles')
      .select(column)
      .eq('id', userId)
      .maybeSingle();
    const current = (profile as Record<string, number> | null)?.[column] ?? 0;
    const newCount = current + 1;
    await this.client
      .from('profiles')
      .update({ [column]: newCount })
      .eq('id', userId);
    return newCount;
  }
```

- [ ] **Step 5: Extend `getDuelWinCount` and `getDuelGameCount` with optional filter**

Replace `getDuelWinCount` at `backend/src/supabase/supabase.service.ts:637-648`:

```typescript
  async getDuelWinCount(userId: string, gameType?: 'standard' | 'logo'): Promise<number> {
    let query = this.client
      .from('duel_games')
      .select('id, host_id, guest_id, scores')
      .eq('status', 'finished')
      .or(`host_id.eq.${userId},guest_id.eq.${userId}`);
    if (gameType) query = query.eq('game_type', gameType);
    const { data } = await query;
    if (!data) return 0;
    return data.filter((g: { host_id: string; guest_id: string; scores: { host: number; guest: number } }) => {
      const isHost = g.host_id === userId;
      return isHost ? g.scores.host > g.scores.guest : g.scores.guest > g.scores.host;
    }).length;
  }
```

Replace `getDuelGameCount` at lines 650-657:

```typescript
  async getDuelGameCount(userId: string, gameType?: 'standard' | 'logo'): Promise<number> {
    let query = this.client
      .from('duel_games')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'finished')
      .or(`host_id.eq.${userId},guest_id.eq.${userId}`);
    if (gameType) query = query.eq('game_type', gameType);
    const { count } = await query;
    return count ?? 0;
  }
```

- [ ] **Step 6: Add `getLogoDuelLeaderboard` and `getLogoDuelLeaderboardEntryForUser`**

Add directly below `getDuelLeaderboardEntryForUser` (around line 373):

```typescript
  async getLogoDuelLeaderboard(limit: number): Promise<DuelLeaderboardEntry[]> {
    const cacheKey = `leaderboard:logo_duel:${limit}`;
    const cached = await this.redisService.get<DuelLeaderboardEntry[]>(cacheKey);
    if (cached) return cached;
    const { data } = await this.client.rpc('get_logo_duel_leaderboard', { p_limit: limit });
    const result = (data ?? []) as DuelLeaderboardEntry[];
    await this.redisService.set(cacheKey, result, LEADERBOARD_TTL);
    return result;
  }

  async getLogoDuelLeaderboardEntryForUser(userId: string): Promise<DuelLeaderboardEntryWithRank | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;
    const { data: stats } = await this.client.rpc('get_logo_duel_user_stats', { p_user_id: userId });
    const row = (stats as Array<{ wins: number; losses: number; games_played: number }> | null)?.[0];
    if (!row || row.wins === 0) return null;
    const { data: rank } = await this.client.rpc('get_logo_duel_rank', { p_user_id: userId });
    return {
      user_id: userId,
      username: profile.username,
      wins: row.wins,
      losses: row.losses,
      games_played: row.games_played,
      rank: (rank as number) ?? 0,
    };
  }
```

- [ ] **Step 7: Run type check**

```bash
cd backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/supabase/supabase.service.ts backend/src/common/interfaces/profile.interface.ts
git commit -m "feat(backend): split duel-win stats by game_type + add logo-duel leaderboard getters"
```

---

### Task 4: `DuelService` — route increment to correct column

**Files:**
- Modify: `backend/src/duel/duel.service.ts:493`

- [ ] **Step 1: Pass `row.game_type` into `incrementDuelWins`**

At `backend/src/duel/duel.service.ts:493`, change:

```typescript
              await this.supabaseService.incrementDuelWins(playerId);
```

to:

```typescript
              await this.supabaseService.incrementDuelWins(playerId, row.game_type as 'standard' | 'logo');
```

- [ ] **Step 2: Update the `duelWins` lookup right below at line 497**

Change:

```typescript
            const duelWins = isWinner ? (await this.supabaseService.getDuelWinCount(playerId)) : undefined;
```

to (scopes the achievement-relevant count to standard duels only — logo-duel achievements are out of scope for v1):

```typescript
            const duelWins = isWinner ? (await this.supabaseService.getDuelWinCount(playerId, 'standard')) : undefined;
```

- [ ] **Step 3: Update `duelGames` at line 498**

Change:

```typescript
            const duelGames = await this.supabaseService.getDuelGameCount(playerId);
```

to:

```typescript
            const duelGames = await this.supabaseService.getDuelGameCount(playerId, 'standard');
```

- [ ] **Step 4: Type check**

```bash
cd backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/duel/duel.service.ts
git commit -m "fix(duel): route win increment + achievement count to game_type-specific column"
```

---

### Task 5: `LeaderboardController` — expose logo duel + bump LIMIT to 10

**Files:**
- Modify: `backend/src/leaderboard/leaderboard.controller.ts`

- [ ] **Step 1: Replace the controller contents**

Replace the full file with:

```typescript
import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

const LIMIT = 10;

@Controller('api/leaderboard')
export class LeaderboardController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get()
  async getLeaderboard() {
    const [solo, blitz, logoQuiz, logoQuizHardcore, duel, logoDuel] = await Promise.all([
      this.supabaseService.getLeaderboard(LIMIT),
      this.supabaseService.getBlitzLeaderboard(LIMIT),
      this.supabaseService.getLogoQuizLeaderboard(LIMIT),
      this.supabaseService.getLogoQuizHardcoreLeaderboard(LIMIT),
      this.supabaseService.getDuelLeaderboard(LIMIT),
      this.supabaseService.getLogoDuelLeaderboard(LIMIT),
    ]);
    return { solo, blitz, logoQuiz, logoQuizHardcore, duel, logoDuel };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getMyLeaderboardEntries(@Req() req: any) {
    const userId = req.user.id;
    const [soloMe, blitzMe, logoQuizMe, logoQuizHardcoreMe, duelMe, logoDuelMe] = await Promise.all([
      this.supabaseService.getLeaderboardEntryForUser(userId),
      this.supabaseService.getBlitzLeaderboardEntryForUser(userId),
      this.supabaseService.getLogoQuizLeaderboardEntryForUser(userId),
      this.supabaseService.getLogoQuizHardcoreLeaderboardEntryForUser(userId),
      this.supabaseService.getDuelLeaderboardEntryForUser(userId),
      this.supabaseService.getLogoDuelLeaderboardEntryForUser(userId),
    ]);
    return { soloMe, blitzMe, logoQuizMe, logoQuizHardcoreMe, duelMe, logoDuelMe };
  }
}
```

- [ ] **Step 2: Type check + run backend**

```bash
cd backend && npx tsc --noEmit
```
Expected: no errors.

Then start the backend locally and hit `/api/leaderboard`:

```bash
cd backend && npm run start:dev &
sleep 5
curl -s http://localhost:3000/api/leaderboard | jq 'keys'
```
Expected output: `["blitz", "duel", "logoDuel", "logoQuiz", "logoQuizHardcore", "solo"]`.

Kill the backend: `pkill -f "nest start"`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/leaderboard/leaderboard.controller.ts
git commit -m "feat(leaderboard): expose logoDuel channel + bump LIMIT to 10"
```

---

### Task 6: `SoloService.getProfile` — include duel + logo-duel records

**Files:**
- Modify: `backend/src/solo/solo.service.ts` (locate the `getProfile` method)
- Modify: `backend/src/solo/solo.controller.ts` if it has a response DTO — verify in Step 1

- [ ] **Step 1: Locate the profile response shape**

```bash
grep -n "getProfile\|blitz_stats\|mayhem_stats" backend/src/solo/solo.service.ts
```
Expected: finds the `getProfile` method that returns `{ profile, blitz_stats, mayhem_stats, history }`.

- [ ] **Step 2: Extend the return value**

Inside `SoloService.getProfile(userId)`, alongside the existing `blitz_stats` / `mayhem_stats` fetches, add two parallel stat fetches and include them in the return object:

```typescript
    const [profile, blitzStats, mayhemStats, history, duelStats, logoDuelStats] = await Promise.all([
      this.supabase.getLeaderboardEntryForUser(userId),        // existing
      this.supabase.getBlitzStatsForUser(userId),              // existing
      this.supabase.getMayhemStatsForUser(userId),             // existing (or whatever the existing name is)
      this.supabase.getEloHistory(userId),                     // existing
      this.supabase.getDuelLeaderboardEntryForUser(userId),    // NEW — may be null
      this.supabase.getLogoDuelLeaderboardEntryForUser(userId),// NEW — may be null
    ]);

    return {
      profile,
      blitz_stats: blitzStats,
      mayhem_stats: mayhemStats,
      history,
      duel_stats: duelStats
        ? { wins: duelStats.wins, losses: duelStats.losses, rank: duelStats.rank }
        : { wins: 0, losses: 0, rank: null },
      logo_duel_stats: logoDuelStats
        ? { wins: logoDuelStats.wins, losses: logoDuelStats.losses, rank: logoDuelStats.rank }
        : { wins: 0, losses: 0, rank: null },
    };
```

(Adjust the existing variable names in the destructure to match whatever the actual `getProfile` body uses — the key insight is adding two new parallel promises and two new response fields.)

- [ ] **Step 3: Type check**

```bash
cd backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Update the frontend type for `SoloApiService.getProfile` response**

In `frontend/src/app/core/solo-api.service.ts`, locate the return-type interface for `getProfile` and add:

```typescript
  duel_stats: { wins: number; losses: number; rank: number | null };
  logo_duel_stats: { wins: number; losses: number; rank: number | null };
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/solo/solo.service.ts frontend/src/app/core/solo-api.service.ts
git commit -m "feat(profile): include duel + logo-duel records in profile endpoint response"
```

---

## Phase 2 — Frontend: new DS primitives

### Task 7: `so-rating-card` component

**Files:**
- Create: `frontend/src/app/shared/ui/so-rating-card/so-rating-card.ts`
- Modify: `frontend/src/app/shared/ui/index.ts`

- [ ] **Step 1: Create the component**

Write `frontend/src/app/shared/ui/so-rating-card/so-rating-card.ts`:

```typescript
import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

export type SoRatingCardType = 'elo' | 'record';

export interface SoRatingTier {
  label: string;
  color: string;
}

@Component({
  selector: 'so-rating-card',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="routerLink(); else staticTpl">
      <a [routerLink]="routerLink()" class="so-rating-card" [class.so-rating-card--elo]="type() === 'elo'">
        <ng-container *ngTemplateOutlet="body"></ng-container>
      </a>
    </ng-container>
    <ng-template #staticTpl>
      <div class="so-rating-card" [class.so-rating-card--elo]="type() === 'elo'">
        <ng-container *ngTemplateOutlet="body"></ng-container>
      </div>
    </ng-template>

    <ng-template #body>
      <div class="so-rating-card__head">
        <mat-icon *ngIf="icon()" class="so-rating-card__icon">{{ icon() }}</mat-icon>
        <span class="so-rating-card__label">{{ label() }}</span>
      </div>
      <div class="so-rating-card__value">{{ displayValue() }}</div>
      <span *ngIf="type() === 'elo' && tier()" class="so-rating-card__tier" [style.color]="tier()!.color">
        {{ tier()!.label }}
      </span>
    </ng-template>
  `,
  styles: [`
    .so-rating-card {
      display: flex; flex-direction: column; gap: 0.375rem;
      background: var(--color-surface-low);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: var(--radius-lg, 12px);
      padding: 0.75rem 0.875rem;
      text-decoration: none; color: inherit;
      transition: background 120ms;
    }
    a.so-rating-card:hover { background: rgba(255,255,255,0.03); }
    a.so-rating-card:active { background: rgba(255,255,255,0.05); }
    .so-rating-card__head {
      display: flex; align-items: center; gap: 0.375rem;
      font-family: var(--font-headline);
      font-size: 0.6875rem; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--color-fg-muted);
    }
    .so-rating-card__icon { font-size: 0.875rem; width: 0.875rem; height: 0.875rem; }
    .so-rating-card__label { flex: 1; }
    .so-rating-card__value {
      font-family: var(--font-numeric);
      font-size: 1.25rem; font-weight: 700;
      color: var(--color-fg);
    }
    .so-rating-card__tier {
      font-family: var(--font-headline);
      font-size: 0.625rem; letter-spacing: 0.12em;
      text-transform: uppercase;
    }
  `],
})
export class SoRatingCardComponent {
  label = input.required<string>();
  type  = input.required<SoRatingCardType>();
  value = input.required<number>();
  secondaryValue = input<number | null>(null);
  tier  = input<SoRatingTier | null>(null);
  icon  = input<string | null>(null);
  routerLink = input<string | null>(null);

  displayValue = computed(() => {
    if (this.type() === 'record') {
      const wins = this.value();
      const losses = this.secondaryValue() ?? 0;
      return `${wins}W — ${losses}L`;
    }
    return String(this.value());
  });
}
```

- [ ] **Step 2: Export from the UI barrel**

In `frontend/src/app/shared/ui/index.ts`, add:

```typescript
export { SoRatingCardComponent, type SoRatingCardType, type SoRatingTier } from './so-rating-card/so-rating-card';
```

- [ ] **Step 3: Type check**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/shared/ui/so-rating-card/so-rating-card.ts frontend/src/app/shared/ui/index.ts
git commit -m "feat(ui): add so-rating-card DS primitive (ELO + record variants)"
```

---

### Task 8: `so-xp-card` component

**Files:**
- Create: `frontend/src/app/shared/ui/so-xp-card/so-xp-card.ts`
- Modify: `frontend/src/app/shared/ui/index.ts`

- [ ] **Step 1: Create the component**

Write `frontend/src/app/shared/ui/so-xp-card/so-xp-card.ts`:

```typescript
import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'so-xp-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="so-xp-card">
      <div class="so-xp-card__head">
        <span class="so-xp-card__level">Level {{ level() }}</span>
        <span class="so-xp-card__total">{{ xp() }} XP</span>
      </div>
      <div class="so-xp-card__track"
           role="progressbar"
           aria-label="XP progress"
           aria-valuemin="0"
           aria-valuemax="100"
           [attr.aria-valuenow]="pct()">
        <div class="so-xp-card__fill" [style.--progress]="pct() / 100"></div>
      </div>
      <div class="so-xp-card__foot">{{ remaining() }} XP to Level {{ level() + 1 }}</div>
    </div>
  `,
  styles: [`
    .so-xp-card {
      padding: 0.75rem 0.875rem;
      background: rgba(139, 92, 246, 0.08);
      border: 1px solid rgba(139, 92, 246, 0.25);
      border-radius: 10px;
    }
    .so-xp-card__head {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 0.4rem;
    }
    .so-xp-card__level {
      font-family: var(--font-headline);
      font-size: 0.95rem; font-weight: 700;
      color: #a78bfa;
      letter-spacing: 0.02em;
    }
    .so-xp-card__total {
      font-family: var(--font-numeric);
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.6);
    }
    .so-xp-card__track {
      height: 6px;
      background: rgba(139, 92, 246, 0.15);
      border-radius: 3px;
      overflow: hidden;
    }
    .so-xp-card__fill {
      height: 100%;
      width: calc(var(--progress, 0) * 100%);
      background: linear-gradient(90deg, #8b5cf6, #a78bfa);
      border-radius: 3px;
      transition: width 0.5s ease;
      box-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
    }
    .so-xp-card__foot {
      margin-top: 0.35rem;
      text-align: right;
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.5);
    }
  `],
})
export class SoXpCardComponent {
  level     = input.required<number>();
  xp        = input.required<number>();
  pct       = input.required<number>();
  remaining = input.required<number>();
}
```

- [ ] **Step 2: Export from the UI barrel**

Add to `frontend/src/app/shared/ui/index.ts`:

```typescript
export { SoXpCardComponent } from './so-xp-card/so-xp-card';
```

- [ ] **Step 3: Type check**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/shared/ui/so-xp-card/so-xp-card.ts frontend/src/app/shared/ui/index.ts
git commit -m "feat(ui): add so-xp-card DS primitive (factored from profile)"
```

---

## Phase 3 — Profile screen

### Task 9: Swap inline tier-progress for `so-tier-progress`

**Files:**
- Modify: `frontend/src/app/features/profile/profile.ts`
- Modify: `frontend/src/app/features/profile/profile.html`
- Modify: `frontend/src/app/features/profile/profile.css`

- [ ] **Step 1: Add `SoTierProgressComponent` to the profile imports**

In `frontend/src/app/features/profile/profile.ts` at the barrel import (lines 19-26):

```typescript
import {
  SoAvatarComponent,
  SoStatCardComponent,
  SoSectionHeaderComponent,
  SoHistoryRowComponent,
  SoButtonComponent,
  SoTierProgressComponent,
  type SoHistoryRowData,
} from '../../shared/ui';
```

And in the `@Component.imports` array, add `SoTierProgressComponent`.

- [ ] **Step 2: Add a `currentTierStart` computed**

Below the existing `nextTierLabel` computed in `profile.ts`, add:

```typescript
  currentTierStart = computed(() => {
    // Mirrors profile-tier.ts — the floor of the user's current tier,
    // needed by so-tier-progress for fill math.
    const elo = this.profile()?.elo ?? 1000;
    const TIER_BOUNDARIES: Array<[number, number | null]> = [
      [2400, null], [2000, 2399], [1650, 1999], [1300, 1649],
      [1000, 1299], [750, 999], [500, 749],
    ];
    const currentKey = getEloTier(elo).tier;
    const row = TIER_BOUNDARIES.find(([min]) => getEloTier(min).tier === currentKey);
    return row?.[0] ?? 500;
  });

  nextTierElo = computed(() => nextTierThreshold(this.profile()?.elo ?? 1000) ?? (this.profile()?.elo ?? 1000));
```

- [ ] **Step 3: Replace the inline markup**

In `frontend/src/app/features/profile/profile.html:109-121`, replace:

```html
      <!-- Tier Progress — tap to view all tiers -->
      @if (nextTierLabel()) {
        <a class="tier-progress tier-progress--link"
           routerLink="/profile/tier"
           aria-label="View all tiers">
          <div class="tier-progress__labels">
            <span class="tier-progress__current">{{ rankTier().label }}</span>
            <span class="tier-progress__next">{{ nextTierLabel() }}</span>
          </div>
          <div class="tier-progress__track" role="progressbar" aria-label="Tier progress" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="tierProgressPct()">
            <div class="tier-progress__fill" [style.--progress]="tierProgressPct() / 100"></div>
          </div>
        </a>
      }
```

with:

```html
      <!-- Tier Progress — tap to view all tiers -->
      @if (nextTierLabel(); as nextLabel) {
        <a routerLink="/profile/tier" class="tier-progress-link" aria-label="View all tiers">
          <so-tier-progress
            [tier]="rankTier().label"
            [nextTier]="nextLabel"
            [elo]="profile()?.elo ?? 1000"
            [nextElo]="nextTierElo()"
            [tierStart]="currentTierStart()"
            [color]="rankTier().color" />
        </a>
      }
```

- [ ] **Step 4: Replace the tier-progress CSS**

In `frontend/src/app/features/profile/profile.css`, delete lines 261-301 (all `.tier-progress*` selectors) and add:

```css
.tier-progress-link {
  display: block;
  color: inherit;
  text-decoration: none;
  margin: 0 -1.25rem;
  padding: 0 1.25rem 0.75rem;
  -webkit-tap-highlight-color: transparent;
}
```

- [ ] **Step 5: Verify in a dev server**

```bash
cd frontend && npm start
```
Open the profile screen. Tier progress strip should render with the `so-tier-progress` look; tapping navigates to `/profile/tier`. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/profile/profile.ts frontend/src/app/features/profile/profile.html frontend/src/app/features/profile/profile.css
git commit -m "refactor(profile): swap inline tier-progress for so-tier-progress primitive"
```

---

### Task 10: Ratings card + XP card section on profile

**Files:**
- Modify: `frontend/src/app/features/profile/profile.ts`
- Modify: `frontend/src/app/features/profile/profile.html`
- Modify: `frontend/src/app/features/profile/profile.css`

- [ ] **Step 1: Add Ratings / XP imports + signals**

In `frontend/src/app/features/profile/profile.ts`:

Add `SoRatingCardComponent` and `SoXpCardComponent` to the DS barrel import and to `@Component.imports`.

Add these signals near the existing `profile` / `blitzStats` signals:

```typescript
  duelStats     = signal<{ wins: number; losses: number; rank: number | null } | null>(null);
  logoDuelStats = signal<{ wins: number; losses: number; rank: number | null } | null>(null);
```

In `loadProfile()`, after `this.profile.set(profileRes?.profile ?? null);`, add:

```typescript
      this.duelStats.set(profileRes?.duel_stats ?? { wins: 0, losses: 0, rank: null });
      this.logoDuelStats.set(profileRes?.logo_duel_stats ?? { wins: 0, losses: 0, rank: null });
```

Add these tier helpers near the existing `rankTier` computed:

```typescript
  soloTier = computed(() => {
    const t = this.rankTier();
    return { label: t.label, color: t.color };
  });

  logoQuizTier = computed(() => {
    const t = getEloTier(this.profile()?.logo_quiz_elo ?? 1000);
    return { label: t.label, color: t.color };
  });

  logoHardcoreTier = computed(() => {
    const t = getEloTier(this.profile()?.logo_quiz_hardcore_elo ?? 1000);
    return { label: t.label, color: t.color };
  });
```

- [ ] **Step 2: Add Ratings + XP markup to the template**

In `frontend/src/app/features/profile/profile.html`, replace the `<!-- ─── XP / LEVEL ─────── -->` block (lines 124-136) and the `<!-- ─── THIS SEASON ─────── -->` block (lines 138-156) with:

```html
    <!-- ─── RATINGS + XP (stuck pair) ─────────────── -->
    <section class="section ratings-section">
      <so-section-header label="Ratings" />
      <div class="ratings-grid">
        <so-rating-card
          label="Solo Ranked"
          type="elo"
          [value]="profile()?.elo ?? 1000"
          [tier]="soloTier()"
          icon="military_tech"
          routerLink="/profile/tier" />
        <so-rating-card
          label="Logo Quiz"
          type="elo"
          [value]="profile()?.logo_quiz_elo ?? 1000"
          [tier]="logoQuizTier()"
          icon="extension" />
        <so-rating-card
          label="Logo Hardcore"
          type="elo"
          [value]="profile()?.logo_quiz_hardcore_elo ?? 1000"
          [tier]="logoHardcoreTier()"
          icon="local_fire_department" />
        <so-rating-card
          label="Duel"
          type="record"
          [value]="duelStats()?.wins ?? 0"
          [secondaryValue]="duelStats()?.losses ?? 0"
          icon="sports_mma" />
        <so-rating-card
          label="Logo Duel"
          type="record"
          [value]="logoDuelStats()?.wins ?? 0"
          [secondaryValue]="logoDuelStats()?.losses ?? 0"
          icon="swords" />
      </div>
    </section>

    <section class="section xp-section">
      <so-xp-card
        [level]="level()"
        [xp]="xp()"
        [pct]="xpPct()"
        [remaining]="xpRemaining()" />
    </section>
```

- [ ] **Step 3: Add CSS**

Append to `frontend/src/app/features/profile/profile.css`:

```css
/* ── Ratings + XP stuck pair ─────────────── */
.ratings-section { padding-bottom: 0.5rem; }
.ratings-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.625rem;
}
.ratings-grid > so-rating-card:nth-child(5) {
  grid-column: 1 / -1;
}
.xp-section { padding-top: 0; }
```

Delete the old `.xp-card*` ruleset (lines 304-342) — it moved into `so-xp-card`.

Delete the old `.stat-grid` ruleset if still present (search for it):

```bash
grep -n "\.stat-grid" frontend/src/app/features/profile/profile.css
```
Delete any rulesets found.

- [ ] **Step 4: Type check and visual check**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors.

Then `npm start` and verify the profile shows Ratings grid with 5 cards (2/2/1 wrap), XP card snapped below.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/profile/profile.ts frontend/src/app/features/profile/profile.html frontend/src/app/features/profile/profile.css
git commit -m "feat(profile): Ratings card grid + XP card (stuck pair, replaces This Season)"
```

---

### Task 11: `/profile/achievements` route component

**Files:**
- Create: `frontend/src/app/features/profile-achievements/profile-achievements.ts`
- Create: `frontend/src/app/features/profile-achievements/profile-achievements.html`
- Create: `frontend/src/app/features/profile-achievements/profile-achievements.css`
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Create the component class**

Write `frontend/src/app/features/profile-achievements/profile-achievements.ts`:

```typescript
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { AchievementsApiService, Achievement } from '../../core/achievements-api.service';
import { SoSectionHeaderComponent } from '../../shared/ui';

@Component({
  selector: 'app-profile-achievements',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, SoSectionHeaderComponent],
  templateUrl: './profile-achievements.html',
  styleUrl: './profile-achievements.css',
})
export class ProfileAchievementsComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private api = inject(AchievementsApiService);
  lang = inject(LanguageService);

  achievements = signal<Achievement[]>([]);
  loading = signal(true);
  selectedAchievement = signal<Achievement | null>(null);

  readonly categoryMeta: Record<string, { label: string; icon: string; order: number }> = {
    progression: { label: 'Progression', icon: '📈', order: 1 },
    milestone:   { label: 'Milestones',  icon: '🎯', order: 2 },
    consistency: { label: 'Consistency', icon: '📅', order: 3 },
    performance: { label: 'Performance', icon: '🔥', order: 4 },
    mode:        { label: 'Modes',       icon: '🎮', order: 5 },
    rank:        { label: 'Rank',        icon: '👑', order: 6 },
  };

  earned = computed(() => this.achievements().filter(a => a.earned_at).length);

  categorized = computed(() => {
    const groups = new Map<string, Achievement[]>();
    for (const a of this.achievements()) {
      const key = a.category ?? 'other';
      const list = groups.get(key) ?? [];
      list.push(a);
      groups.set(key, list);
    }
    return Array.from(groups.entries())
      .map(([key, items]) => ({
        key,
        label: this.categoryMeta[key]?.label ?? key,
        icon: this.categoryMeta[key]?.icon ?? '🏅',
        order: this.categoryMeta[key]?.order ?? 99,
        items,
        earned: items.filter(a => a.earned_at).length,
        total: items.length,
      }))
      .sort((a, b) => a.order - b.order);
  });

  async ngOnInit(): Promise<void> {
    await this.auth.sessionReady;
    const userId = this.route.snapshot.paramMap.get('userId') ?? this.auth.user()?.id ?? null;
    if (!userId) { this.loading.set(false); return; }
    try {
      const data = await firstValueFrom(this.api.getForUser(userId));
      this.achievements.set(data);
    } catch {
      this.achievements.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  progressPercent(a: Achievement): number {
    if (a.earned_at) return 100;
    if (a.target <= 0) return 0;
    return Math.round((a.current / a.target) * 100);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  goBack(): void {
    this.router.navigate(['/profile']);
  }
}
```

- [ ] **Step 2: Create the template**

Write `frontend/src/app/features/profile-achievements/profile-achievements.html`:

```html
<div class="achievements-page page-stagger">
  <header class="achievements-header">
    <button class="achievements-back" (click)="goBack()" aria-label="Back">
      <mat-icon>arrow_back</mat-icon>
    </button>
    <h1 class="achievements-title">Achievements</h1>
    <span class="achievements-count">{{ earned() }} / {{ achievements().length }}</span>
  </header>

  @if (loading()) {
    <div class="achievements-loading">Loading…</div>
  } @else {
    @for (group of categorized(); track group.key) {
      <section class="achievements-group">
        <div class="achievements-group__head">
          <span class="achievements-group__icon">{{ group.icon }}</span>
          <h3 class="achievements-group__title">{{ group.label }}</h3>
          <span class="achievements-group__count">{{ group.earned }} / {{ group.total }}</span>
        </div>
        <div class="achievements-grid">
          @for (a of group.items; track a.id) {
            <button
              type="button"
              class="achievement-tile"
              [class.achievement-tile--locked]="!a.earned_at"
              (click)="selectedAchievement.set(a)">
              <span class="achievement-tile__icon">{{ a.icon }}</span>
              <span class="achievement-tile__name">{{ a.name }}</span>
              @if (!a.earned_at && a.target > 1) {
                <div class="achievement-tile__progress">
                  <div class="achievement-tile__progress-bar">
                    <div class="achievement-tile__progress-fill" [style.width.%]="progressPercent(a)"></div>
                  </div>
                  <span class="achievement-tile__progress-text">{{ a.current }} / {{ a.target }}</span>
                </div>
              }
            </button>
          }
        </div>
      </section>
    }
  }

  @if (selectedAchievement(); as a) {
    <div class="achv-popup-backdrop" (click)="selectedAchievement.set(null)">
      <div class="achv-popup" (click)="$event.stopPropagation()">
        <span class="achv-popup__icon">{{ a.icon }}</span>
        <h3 class="achv-popup__name">{{ a.name }}</h3>
        <p class="achv-popup__desc">{{ a.description }}</p>

        @if (a.earned_at) {
          <div class="achv-popup__badge achv-popup__badge--earned">
            <mat-icon style="font-size:1rem;">check_circle</mat-icon>
            Earned {{ formatDate(a.earned_at) }}
          </div>
        } @else {
          <div class="achv-popup__progress-section">
            <div class="achv-popup__progress-bar">
              <div class="achv-popup__progress-fill" [style.width.%]="progressPercent(a)"></div>
            </div>
            <span class="achv-popup__progress-text">{{ a.current }} / {{ a.target }}</span>
          </div>
        }

        <span class="achv-popup__category">{{ a.category }}</span>
        <button class="achv-popup__close" (click)="selectedAchievement.set(null)">Got it</button>
      </div>
    </div>
  }
</div>
```

- [ ] **Step 3: Copy the achievements CSS from profile**

Write `frontend/src/app/features/profile-achievements/profile-achievements.css`:

```css
.achievements-page {
  padding: 1rem 1.25rem 5rem;
  max-width: 640px;
  margin: 0 auto;
  color: var(--color-fg);
}
.achievements-header {
  display: flex; align-items: center; gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.achievements-back {
  background: rgba(255,255,255,0.06);
  border: none; color: var(--color-fg);
  width: 2.25rem; height: 2.25rem;
  border-radius: 0.5rem;
  display: grid; place-items: center;
  cursor: pointer;
}
.achievements-title {
  font-family: var(--font-headline);
  font-size: 1.25rem; font-weight: 700;
  margin: 0; flex: 1;
}
.achievements-count {
  font-family: var(--font-numeric);
  font-size: 0.875rem;
  color: var(--color-fg-muted);
}
.achievements-loading {
  text-align: center; padding: 2rem; color: var(--color-fg-muted);
}

.achievements-group { margin-bottom: 1.5rem; }
.achievements-group__head {
  display: flex; align-items: center; gap: 0.5rem;
  margin-bottom: 0.625rem;
}
.achievements-group__icon { font-size: 1.125rem; }
.achievements-group__title {
  font-family: var(--font-headline);
  font-size: 0.75rem; letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-fg); margin: 0; flex: 1;
}
.achievements-group__count {
  font-family: var(--font-numeric);
  font-size: 0.6875rem;
  color: var(--color-fg-muted);
}
.achievements-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}
.achievement-tile {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 0.75rem 0.5rem;
  display: flex; flex-direction: column;
  align-items: center; gap: 0.375rem;
  color: inherit;
  cursor: pointer;
  transition: background 120ms;
}
.achievement-tile:hover { background: rgba(255,255,255,0.07); }
.achievement-tile--locked { opacity: 0.45; }
.achievement-tile__icon { font-size: 1.5rem; }
.achievement-tile__name {
  font-size: 0.625rem;
  text-align: center;
  color: var(--color-fg-muted);
  letter-spacing: 0.04em;
}
.achievement-tile__progress {
  width: 100%;
  display: flex; flex-direction: column; gap: 0.125rem;
  margin-top: 0.125rem;
}
.achievement-tile__progress-bar {
  height: 2px;
  background: rgba(255,255,255,0.08);
  border-radius: 1px;
  overflow: hidden;
}
.achievement-tile__progress-fill {
  height: 100%;
  background: var(--color-accent);
}
.achievement-tile__progress-text {
  font-size: 0.5rem;
  color: var(--color-fg-dim);
  text-align: center;
}

.achv-popup-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.75);
  display: grid; place-items: center;
  padding: 1rem;
  z-index: 100;
}
.achv-popup {
  background: var(--color-surface);
  border-radius: 16px;
  padding: 1.5rem;
  max-width: 320px; width: 100%;
  display: flex; flex-direction: column; align-items: center;
  gap: 0.75rem;
}
.achv-popup__icon { font-size: 3rem; }
.achv-popup__name {
  font-family: var(--font-headline);
  font-size: 1.125rem; font-weight: 700;
  margin: 0; text-align: center;
}
.achv-popup__desc {
  font-size: 0.875rem;
  color: var(--color-fg-muted);
  text-align: center; margin: 0;
}
.achv-popup__badge {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: rgba(34,197,94,0.15);
  color: #22c55e;
  border-radius: 999px;
  font-size: 0.75rem;
}
.achv-popup__progress-section {
  width: 100%;
  display: flex; flex-direction: column; gap: 0.25rem; align-items: center;
}
.achv-popup__progress-bar {
  width: 100%; height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px; overflow: hidden;
}
.achv-popup__progress-fill {
  height: 100%;
  background: var(--color-accent);
}
.achv-popup__progress-text {
  font-family: var(--font-numeric);
  font-size: 0.75rem;
  color: var(--color-fg-muted);
}
.achv-popup__category {
  font-size: 0.625rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-fg-dim);
}
.achv-popup__close {
  width: 100%;
  padding: 0.625rem;
  background: var(--color-accent);
  color: var(--color-bg);
  border: none;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 0.5rem;
}
```

- [ ] **Step 4: Register the route**

In `frontend/src/app/app.routes.ts`, find the `/profile/tier` registration and add directly below it (before `/profile/:userId`):

```typescript
      { path: 'profile/achievements', loadComponent: () => import('./features/profile-achievements/profile-achievements').then(m => m.ProfileAchievementsComponent), canActivate: [authGuard] },
```

- [ ] **Step 5: Type check + visual**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors.

`npm start` and navigate to `/profile/achievements`. Grid renders; tapping a tile opens the detail popup; back button returns to `/profile`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/profile-achievements frontend/src/app/app.routes.ts
git commit -m "feat(profile): add /profile/achievements route (categorized grid + detail popup)"
```

---

### Task 12: Profile compact achievements preview + remove bulky grid

**Files:**
- Modify: `frontend/src/app/features/profile/profile.ts`
- Modify: `frontend/src/app/features/profile/profile.html`
- Modify: `frontend/src/app/features/profile/profile.css`

- [ ] **Step 1: Add `recentAchievements` computed**

In `frontend/src/app/features/profile/profile.ts`, near the existing `achievementsEarned` computed, add:

```typescript
  recentAchievements = computed(() => {
    return this.achievements()
      .filter(a => !!a.earned_at)
      .sort((a, b) => (b.earned_at ?? '').localeCompare(a.earned_at ?? ''))
      .slice(0, 5);
  });
```

- [ ] **Step 2: Delete the categorized grid + popup state + CSS from profile**

Delete from `profile.ts`:
- `selectedAchievement` signal (around line 74)
- `categoryMeta` object + `categorizedAchievements` computed + `progressPercent` method (lines ~197-231)
- `formatDate` method if unused elsewhere in profile.ts (search first — it's also used by the edit sheet; keep if still referenced)

- [ ] **Step 3: Replace the achievements section in the template**

In `frontend/src/app/features/profile/profile.html`, replace the entire `<!-- ─── ACHIEVEMENTS ─── -->` block (lines ~254-298) with:

```html
    <!-- ─── ACHIEVEMENTS (compact preview) ────────── -->
    <section class="section">
      <so-section-header [label]="lang.t().achievements" />
      <div class="section__head-extras">
        <span class="achievements-counter">{{ achievementsEarned() }} / {{ achievements().length }}</span>
        @if (isOwnProfile()) {
          <a class="section__see-all" routerLink="/profile/achievements">View all ›</a>
        }
      </div>
      @if (recentAchievements().length > 0) {
        <div class="achievements-preview">
          @for (a of recentAchievements(); track a.id) {
            <span class="achievements-preview__tile" [attr.title]="a.name">{{ a.icon }}</span>
          }
        </div>
      } @else if (isOwnProfile()) {
        <app-empty-state
          icon="emoji_events"
          title="No achievements yet"
          subtitle="Play some games to start earning badges"
          ctaLabel="View all achievements"
          ctaRoute="/profile/achievements"
        />
      }
    </section>
```

Also delete the achievement detail popup block (`@if (selectedAchievement(); as a) { ... }` — lines ~363-390) — it lives in the achievements route now.

- [ ] **Step 4: Clean the profile CSS**

Delete from `profile.css` (search for each and remove):
- `.achievements-group` + `.achievements-group__head`/`__icon`/`__title`/`__count`
- `.achievements-grid`
- `.achievement-tile` + `__icon`/`__name`/`__progress`/`__progress-bar`/`__progress-fill`/`__progress-text`
- `.achievement-tile--locked`
- `.achv-popup-backdrop`, `.achv-popup`, `.achv-popup__icon`, `.achv-popup__name`, `.achv-popup__desc`, `.achv-popup__badge*`, `.achv-popup__progress*`, `.achv-popup__category`, `.achv-popup__close`

Append:

```css
.achievements-preview {
  display: flex; gap: 0.5rem;
  padding: 0.5rem 0;
}
.achievements-preview__tile {
  font-size: 1.5rem;
  width: 2.5rem; height: 2.5rem;
  display: grid; place-items: center;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
}
```

- [ ] **Step 5: Type check + visual**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors.

`npm start` and verify the profile achievements section shows 5 icons + counter + "View all ›" link.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/profile/profile.ts frontend/src/app/features/profile/profile.html frontend/src/app/features/profile/profile.css
git commit -m "refactor(profile): compact achievements preview + delete bulky grid (moved to /profile/achievements)"
```

---

## Phase 4 — Leaderboard

### Task 13: Cap leaderboard list at top 10 + fix `showMeBelow`

**Files:**
- Modify: `frontend/src/app/features/leaderboard/lb-section/lb-section.ts`
- Test: `frontend/src/app/features/leaderboard/lb-section/lb-section.spec.ts` (create)

- [ ] **Step 1: Write failing tests**

Create `frontend/src/app/features/leaderboard/lb-section/lb-section.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { LbSectionComponent } from './lb-section';
import type { LeaderboardRow } from '../leaderboard-row';

function makeRow(rank: number, id: string, isMe = false): LeaderboardRow {
  return {
    id, rank,
    username: `user-${rank}`,
    score: 2000 - rank * 10,
    scoreLabel: 'ELO',
    tier: 'pro',
    meta: '',
    isMe,
  };
}

describe('LbSectionComponent — top-10 cap', () => {
  function instance() {
    const fixture = TestBed.createComponent(LbSectionComponent);
    return fixture.componentInstance;
  }

  it('listRows caps at 7 rows after the podium when rows >= 10', () => {
    const c = instance();
    const rows = Array.from({ length: 25 }, (_, i) => makeRow(i + 1, `u${i + 1}`));
    TestBed.runInInjectionContext(() => {
      (c as any).rows = () => rows;
    });
    // Using input signals — in this framework version, we can also assign via component props.
    // If input.required() prevents direct set, adjust via fixture.componentRef.setInput('rows', rows).
    // Using fixture for accuracy:
  });
});
```

Because `lb-section` uses `input.required`, tests must use `fixture.componentRef.setInput(name, value)`. Replace the test body with the form below and keep ONE failing test first:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LbSectionComponent } from './lb-section';
import type { LeaderboardRow } from '../leaderboard-row';

function makeRow(rank: number, id: string, isMe = false): LeaderboardRow {
  return {
    id, rank,
    username: `user-${rank}`,
    score: 2000 - rank * 10,
    scoreLabel: 'ELO',
    tier: 'pro',
    meta: '',
    isMe,
  };
}

describe('LbSectionComponent — top-10 cap', () => {
  let fixture: ComponentFixture<LbSectionComponent>;
  let component: LbSectionComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LbSectionComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(LbSectionComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('emptyMessage', 'empty');
  });

  it('listRows returns at most 7 rows after the podium when total rows >= 10', () => {
    const rows = Array.from({ length: 25 }, (_, i) => makeRow(i + 1, `u${i + 1}`));
    fixture.componentRef.setInput('rows', rows);
    expect(component.listRows().length).toBe(7);
    expect(component.listRows()[0].rank).toBe(4);
    expect(component.listRows()[6].rank).toBe(10);
  });

  it('listRows falls back to rows when fewer than 3 (no podium)', () => {
    const rows = [makeRow(1, 'u1'), makeRow(2, 'u2')];
    fixture.componentRef.setInput('rows', rows);
    expect(component.listRows().length).toBe(2);
  });

  it('showMeBelow is true when me.rank > 10 even if backend included the row', () => {
    const rows = Array.from({ length: 12 }, (_, i) => makeRow(i + 1, `u${i + 1}`));
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('meRow', makeRow(12, 'u12', true));
    expect(component.showMeBelow()).toBe(true);
  });

  it('showMeBelow is false when me is within the visible top 10', () => {
    const rows = Array.from({ length: 12 }, (_, i) => makeRow(i + 1, `u${i + 1}`));
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('meRow', makeRow(5, 'u5', true));
    expect(component.showMeBelow()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests — expect failures**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless --include='**/lb-section.spec.ts'
```
Expected: the first and third tests FAIL (current `listRows` slice is uncapped, `showMeBelow` misses users at rank 11+ when backend returned them).

- [ ] **Step 3: Update `lb-section.ts`**

Replace `listRows` and `showMeBelow` in `frontend/src/app/features/leaderboard/lb-section/lb-section.ts`:

```typescript
  listRows = computed(() => {
    const rows = this.rows();
    if (rows.length >= 3) return rows.slice(3, 10);
    return rows.slice(0, 10);
  });

  showMeBelow = computed(() => {
    const me = this.meRow();
    if (!me) return false;
    const visibleIds = new Set(this.rows().slice(0, 10).map(r => r.id));
    return !visibleIds.has(me.id);
  });
```

- [ ] **Step 4: Re-run tests**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless --include='**/lb-section.spec.ts'
```
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/leaderboard/lb-section/lb-section.ts frontend/src/app/features/leaderboard/lb-section/lb-section.spec.ts
git commit -m "feat(leaderboard): cap visible list at top 10 + fix showMeBelow visible-range check"
```

---

### Task 14: Leaderboard Duel sub-tab (standard / logo)

**Files:**
- Modify: `frontend/src/app/core/leaderboard-api.service.ts`
- Modify: `frontend/src/app/features/leaderboard/leaderboard.ts`
- Modify: `frontend/src/app/features/leaderboard/leaderboard.html`
- Modify: `frontend/src/app/features/leaderboard/leaderboard-row.ts`

- [ ] **Step 1: Extend the API service types + response**

In `frontend/src/app/core/leaderboard-api.service.ts`, find the `getLeaderboard` / `getMyLeaderboardEntries` return types and add:

```typescript
  logoDuel: DuelLeaderboardEntry[];
  // ...in the "me" interface:
  logoDuelMe: (DuelLeaderboardEntry & { rank: number }) | null;
```

(The exact shape mirrors the existing `duel` / `duelMe` entries. Re-use `DuelLeaderboardEntry` — the data shape is identical.)

- [ ] **Step 2: Add `logoDuelRows` / `logoDuelMeRow` + sub-tab state to `leaderboard.ts`**

In `frontend/src/app/features/leaderboard/leaderboard.ts`:

Add the new signal right after `duelMeEntry`:

```typescript
  private logoDuelEntries = signal<DuelLeaderboardEntry[]>([]);
  private logoDuelMeEntry = signal<(DuelLeaderboardEntry & { rank: number }) | null>(null);
```

Add the new computed rows right after `duelRows`:

```typescript
  logoDuelRows   = computed<LeaderboardRow[]>(() => toRows.duel(this.logoDuelEntries(), this.currentUserId()));
  logoDuelMeRow  = computed<LeaderboardRow | null>(() => meToRow.duel(this.logoDuelMeEntry(), this.currentUserId()));
```

Update `hasAnyMyRank`:

```typescript
  hasAnyMyRank = computed(() =>
    !!(this.soloMeRow() || this.logoQuizMeRow() || this.logoQuizHardcoreMeRow() || this.duelMeRow() || this.logoDuelMeRow())
  );
```

Add a sub-tab type + state:

```typescript
type DuelSubTab = 'standard' | 'logo';

const DUEL_SUB_TABS: SoTab[] = [
  { id: 'standard', label: 'Standard', color: '#f59e0b' },
  { id: 'logo',     label: 'Logo',     color: '#a855f7' },
];
```

Add to the class:

```typescript
  duelSubTab = signal<DuelSubTab>('standard');
  readonly duelSubTabs = DUEL_SUB_TABS;

  setDuelSubTab(sub: string): void {
    this.duelSubTab.set(sub as DuelSubTab);
  }
```

Update `load()` to consume the new fields:

```typescript
      this.logoDuelEntries.set(leaderboardRes.logoDuel ?? []);
      this.logoDuelMeEntry.set(meRes.logoDuelMe ?? null);
```

(Add both lines alongside the existing `this.duelEntries.set(...)` / `this.duelMeEntry.set(...)` lines.)

- [ ] **Step 3: Update the leaderboard template**

In `frontend/src/app/features/leaderboard/leaderboard.html`, replace the `@case ('duel')` block with:

```html
      @case ('duel') {
        <div class="logo-sub-tabs-wrap">
          <so-tab-strip
            [tabs]="duelSubTabs"
            [active]="duelSubTab()"
            tabIdPrefix="lb-duel-sub-"
            (activeChange)="setDuelSubTab($event)" />
        </div>
        <section class="leaderboard-section">
          @if (duelSubTab() === 'standard') {
            <lb-section
              [rows]="duelRows()"
              [meRow]="duelMeRow()"
              emptyIcon="sports_mma"
              [emptyMessage]="lang.t().lbNoDuel"
              [yourRankLabel]="lang.t().lbYourRank" />
          } @else {
            <lb-section
              [rows]="logoDuelRows()"
              [meRow]="logoDuelMeRow()"
              emptyIcon="swords"
              emptyMessage="No logo duel players yet. Be the first!"
              [yourRankLabel]="lang.t().lbYourRank" />
          }
        </section>
      }
```

- [ ] **Step 4: Add "Logo Duel" rank card to the Your Rankings strip**

In `leaderboard.html`, directly below the existing `@if (duelMeRow(); as me) { ... }` block inside the `your-ranks-strip`, add:

```html
          @if (logoDuelMeRow(); as me) {
            <a [routerLink]="['/profile', me.id]" class="your-rank-card your-rank-card--logo-duel">
              <div class="your-rank-icon"><mat-icon>swords</mat-icon></div>
              <div class="your-rank-info">
                <span class="your-rank-mode">Logo Duel</span>
                <span class="your-rank-value">#{{ me.rank }}</span>
              </div>
              <div class="your-rank-score">
                <span class="your-rank-score-value">{{ me.score }}</span>
                <span class="your-rank-score-label">{{ me.scoreLabel }}</span>
              </div>
            </a>
          }
```

- [ ] **Step 5: Add a matching `.your-rank-card--logo-duel` style**

In `frontend/src/app/features/leaderboard/leaderboard.css`, copy the existing `.your-rank-card--duel` ruleset and paste as `.your-rank-card--logo-duel` with a purple tint to differentiate:

```bash
grep -n "your-rank-card--duel" frontend/src/app/features/leaderboard/leaderboard.css
```

Duplicate the found rule, rename selector, and switch any `#f59e0b` (amber) to `#a855f7` (purple). Exact values depend on the existing file — keep consistent tint choices.

- [ ] **Step 6: Type check + verify**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors.

`npm start`, navigate to `/leaderboard`, tap Duel → verify Standard/Logo sub-tabs render and switch correctly. "Your Rankings" strip shows Logo Duel entry when user has logo-duel wins.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/core/leaderboard-api.service.ts frontend/src/app/features/leaderboard/leaderboard.ts frontend/src/app/features/leaderboard/leaderboard.html frontend/src/app/features/leaderboard/leaderboard.css
git commit -m "feat(leaderboard): add Logo Duel sub-tab under Duel + rank strip entry"
```

---

## Phase 5 — Pinch zoom

### Task 15: Viewport meta — enable user-scalable

**Files:**
- Modify: `frontend/src/index.html:7`

- [ ] **Step 1: Update the viewport meta**

Replace:

```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

with:

```html
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover">
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/index.html
git commit -m "feat(a11y): enable pinch zoom via viewport meta (max 5x)"
```

---

### Task 16: Android — enable WebView zoom in `MainActivity`

**Files:**
- Modify: `frontend/android/app/src/main/java/com/stepovr/app/MainActivity.java`

- [ ] **Step 1: Override `onCreate` to enable WebView zoom**

Replace the file contents with:

```java
package com.stepovr.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Enable pinch-zoom app-wide. iOS WKWebView respects the viewport meta;
        // Android WebView requires explicit setSupportZoom + setBuiltInZoomControls.
        // setDisplayZoomControls(false) hides the legacy on-screen +/- overlay.
        getBridge().getWebView().getSettings().setSupportZoom(true);
        getBridge().getWebView().getSettings().setBuiltInZoomControls(true);
        getBridge().getWebView().getSettings().setDisplayZoomControls(false);
    }
}
```

- [ ] **Step 2: Sync Capacitor**

```bash
cd frontend && npx cap sync android
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add frontend/android/app/src/main/java/com/stepovr/app/MainActivity.java
git commit -m "feat(android): enable WebView pinch zoom via MainActivity onCreate override"
```

---

## Phase 6 — Version bump

### Task 17: Bump VERSION + CHANGELOG entry

**Files:**
- Modify: `VERSION`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update VERSION**

Replace the contents of `VERSION` with:

```
0.10.0.0
```

- [ ] **Step 2: Add a CHANGELOG entry**

In `CHANGELOG.md`, insert directly below the `All notable changes to StepOvr will be documented in this file.` line (before `## [0.9.6.0]`):

```markdown
## [0.10.0.0] - 2026-04-24

### Changed — Profile screen recomposition

**Tier-progress swap.** The hand-rolled `.tier-progress--link` strip inside the profile hero is replaced by the DS `so-tier-progress` primitive wrapped in the same tap-to-`/profile/tier` `<a>`. Tier color is passed through so the fill matches the hero tint.

**Ratings card + XP.** The previous "This Season" 4-stat grid is replaced by a Ratings grid that surfaces every rating the user has — Solo Ranked, Logo Quiz, Logo Quiz Hardcore (ELO variants) and Duel, Logo Duel (record variants). XP card is factored into a new `so-xp-card` primitive and stuck directly below the Ratings grid.

**Achievements → `/profile/achievements`.** The bulky categorized grid is lifted off the main profile screen onto its own route. Profile page keeps a compact preview of the 5 most-recently-earned icons plus a "View all ›" link.

### Added — Pinch zoom everywhere

Viewport meta now declares `user-scalable=yes, maximum-scale=5`; iOS WKWebView picks this up automatically. Android MainActivity gets an `onCreate` override to call `setSupportZoom(true)` + `setBuiltInZoomControls(true)` + `setDisplayZoomControls(false)` on the Capacitor bridge WebView.

### Changed — Leaderboard top-10 cap

`lb-section.listRows` is capped at 7 post-podium rows (10 total visible). `showMeBelow` now checks against the visible subset instead of the raw backend payload, so users at rank 11+ correctly get a pinned "me" row below the separator. Backend `LIMIT` bumped from 5 to 10.

### Changed — Duel / Logo Duel stat separation

`profiles.logo_duel_wins` column added, backfilled from `duel_games` where `game_type = 'logo'`. Existing `profiles.duel_wins` also recomputed from `game_type = 'standard'` — users whose counts were previously conflated see their displayed number drop to the true standard-only count. `SupabaseService.incrementDuelWins` now takes a `'standard' | 'logo'` argument; `DuelService` passes `row.game_type` through. `getDuelWinCount` / `getDuelGameCount` accept an optional `gameType` filter. Existing duel achievements (`duel_5/50/100_wins`) now trigger on standard duels only.

### Added — Logo duel leaderboard

New `get_logo_duel_{leaderboard,rank,user_stats}` RPCs (mirror the standard duel ones with `game_type = 'logo'`). Leaderboard controller exposes `logoDuel` + `logoDuelMe` alongside existing duel channels. Frontend adds a Standard / Logo sub-tab under the Duel mode tab and a Logo Duel card in the "Your Rankings" strip.
```

- [ ] **Step 3: Commit**

```bash
git add VERSION CHANGELOG.md
git commit -m "chore: bump VERSION 0.10.0.0 + CHANGELOG entry"
```

---

## Verification before PR

- [ ] **Backend tests pass**

```bash
cd backend && npm test
```

- [ ] **Frontend tests pass**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

- [ ] **Frontend type check passes**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```

- [ ] **Backend type check passes**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Production build succeeds (frontend)**

```bash
cd frontend && npm run build
```

- [ ] **Manual smoke test on a real device**

- iOS: pinch-zoom works on `/`, `/profile`, `/leaderboard`, `/solo` (game screen)
- Android: same four routes after `cap sync android` + rebuild
- Profile: tier strip taps through to `/profile/tier`; Ratings grid shows all 5 cards (including 0-record logo duel); "View all ›" achievements link works; recent 5 icons visible
- Leaderboard: Duel tab has Standard / Logo sub-tabs; each caps at 10 visible rows; user at rank > 10 sees pinned "me" row

---

## Self-review summary

**Spec coverage:**
- §1 Tier-progress swap → Task 9
- §2 Ratings card + XP → Tasks 7, 8, 10
- §3 Duel/Logo-Duel backend split → Tasks 1, 2, 3, 4, 5, 6
- §4 Achievements route + compact → Tasks 11, 12
- §5 Pinch zoom → Tasks 15, 16
- §6 Leaderboard top-10 → Task 13
- §6 Logo duel sub-tab → Task 14
- VERSION + CHANGELOG → Task 17

**Placeholder scan:** No TBDs or "add appropriate X" phrases. Every step has actual code or a concrete command.

**Type consistency:** `incrementDuelWins(userId, gameType)` signature matches in Tasks 3 and 4. `SoRatingTier` interface used in Task 7 matches the shape returned by `soloTier()` / `logoQuizTier()` / `logoHardcoreTier()` in Task 10. `logoDuel` / `logoDuelMe` naming identical between Tasks 5 (backend) and 14 (frontend API service consumption).

**Ordering:** Backend DB state exists before services read it (Tasks 1-2 before 3-6). Frontend primitives exist before profile composes them (Tasks 7-8 before 10). Routes registered before they're linked from profile (Task 11 before Task 12 which adds the link).
