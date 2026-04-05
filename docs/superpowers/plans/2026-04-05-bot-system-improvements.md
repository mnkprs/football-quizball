# Bot System Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-enable the bot system with reduced resource usage, clean log separation, and runtime tunability.

**Architecture:** Four surgical changes to the existing bot module — fix pause persistence, add idle-skip logic to the matchmaker cron, create a BotLogger wrapper for log isolation, and extract hardcoded constants to env vars. No new modules, no new dependencies, no frontend changes.

**Tech Stack:** NestJS, @nestjs/schedule (`@Interval`), Supabase JS client, NestJS Logger

**Spec:** `docs/superpowers/specs/2026-04-05-bot-system-improvements-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/bot/bot-logger.ts` | **CREATE** | BotLogger wrapper — prefixed logging with env-based level filtering |
| `backend/src/bot/bot-config.ts` | **CREATE** | All bot env var constants read once at module load |
| `backend/src/bot/bot-matchmaker.service.ts` | MODIFY | Conditional execution, env var intervals, BotLogger, extract stale cleanup |
| `backend/src/bot/bot-online-game-runner.service.ts` | MODIFY | Persist pause/resume, env var interval, BotLogger |
| `backend/src/bot/bot-duel-runner.service.ts` | MODIFY | BotLogger swap |
| `backend/src/bot/bot-battle-royale-runner.service.ts` | MODIFY | BotLogger swap |
| `backend/src/bot/bot.service.ts` | MODIFY | BotLogger swap |
| `backend/src/admin/admin.controller.ts` | MODIFY | Await async pause/resume on online runner |

---

### Task 1: Create BotLogger utility

**Files:**
- Create: `backend/src/bot/bot-logger.ts`

- [ ] **Step 1: Create the BotLogger class**

```typescript
// backend/src/bot/bot-logger.ts
import { Logger } from '@nestjs/common';

const BOT_LOG_LEVEL = (process.env.BOT_LOG_LEVEL ?? 'warn').toLowerCase();

/**
 * Logger wrapper for bot services.
 * Prefixes all messages with [BOT:<context>] and suppresses debug()
 * when BOT_LOG_LEVEL is 'warn' (default).
 */
export class BotLogger {
  private readonly inner: Logger;
  private readonly prefix: string;
  private readonly debugEnabled: boolean;

  constructor(context: string) {
    this.inner = new Logger(`BOT:${context}`);
    this.prefix = `[BOT:${context}]`;
    this.debugEnabled = BOT_LOG_LEVEL === 'debug';
  }

  debug(message: string): void {
    if (this.debugEnabled) {
      this.inner.debug(`${this.prefix} ${message}`);
    }
  }

  warn(message: string): void {
    this.inner.warn(`${this.prefix} ${message}`);
  }

  error(message: string, trace?: string): void {
    this.inner.error(`${this.prefix} ${message}`, trace);
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `bot-logger.ts`

- [ ] **Step 3: Commit**

```bash
git add backend/src/bot/bot-logger.ts
git commit -m "feat(bot): add BotLogger utility with env-based log level filtering"
```

---

### Task 2: Create bot-config.ts for env var constants

**Files:**
- Create: `backend/src/bot/bot-config.ts`

- [ ] **Step 1: Create the config file with all env-driven constants**

```typescript
// backend/src/bot/bot-config.ts

/** Parse an env var as integer with a default fallback. */
function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

// ── Intervals (milliseconds) ────────────────────────────────────────────────

/** Matchmaker polling interval. */
export const BOT_MATCHMAKER_INTERVAL_MS = envInt('BOT_MATCHMAKER_INTERVAL_SEC', 5) * 1000;

/** Online game runner polling interval. */
export const BOT_ONLINE_RUNNER_INTERVAL_MS = envInt('BOT_ONLINE_RUNNER_INTERVAL_SEC', 30) * 1000;

/** Stale BR room cleanup interval (fixed 60s). */
export const BOT_STALE_CLEANUP_INTERVAL_MS = 60_000;

// ── Timeouts ────────────────────────────────────────────────────────────────

/** Seconds a game must be waiting before a bot is injected. */
export const QUEUE_TIMEOUT_SECONDS = envInt('BOT_QUEUE_TIMEOUT_SEC', 30);

// ── Battle Royale ───────────────────────────────────────────────────────────

/** Minimum bots to fill into a BR room. */
export const BR_BOT_MIN = envInt('BOT_BR_MIN_BOTS', 3);

/** Maximum bots to fill into a BR room. */
export const BR_BOT_MAX = envInt('BOT_BR_MAX_BOTS', 7);

/** Minimum number of public waiting BR rooms the matchmaker will maintain. */
export const BR_MIN_WAITING_ROOMS = envInt('BOT_BR_MIN_WAITING_ROOMS', 2);

/** Number of seed bots when creating a new bot-hosted room. */
export const BR_SEED_BOT_COUNT = 3;

/** Minutes a BR room can stay in 'waiting' before being deleted as stale. */
export const STALE_BR_ROOM_MINUTES = envInt('BOT_STALE_ROOM_MINUTES', 10);

// ── Online Game Runner ──────────────────────────────────────────────────────

/** Minimum seconds a bot waits before taking its online game turn. */
export const BOT_TURN_MIN_WAIT_SECONDS = 45;
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `bot-config.ts`

- [ ] **Step 3: Commit**

```bash
git add backend/src/bot/bot-config.ts
git commit -m "feat(bot): add bot-config.ts with env-driven constants"
```

---

### Task 3: Swap BotLogger into bot.service.ts

**Files:**
- Modify: `backend/src/bot/bot.service.ts`

- [ ] **Step 1: Replace Logger import and instantiation**

Replace:
```typescript
import { Injectable, Logger } from '@nestjs/common';
```
With:
```typescript
import { Injectable } from '@nestjs/common';
import { BotLogger } from './bot-logger';
```

Replace:
```typescript
  private readonly logger = new Logger(BotService.name);
```
With:
```typescript
  private readonly logger = new BotLogger('Service');
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/bot/bot.service.ts
git commit -m "refactor(bot): swap Logger for BotLogger in bot.service"
```

---

### Task 4: Swap BotLogger into bot-duel-runner.service.ts

**Files:**
- Modify: `backend/src/bot/bot-duel-runner.service.ts`

- [ ] **Step 1: Replace Logger import and instantiation**

Replace:
```typescript
import { Injectable, Logger } from '@nestjs/common';
```
With:
```typescript
import { Injectable } from '@nestjs/common';
import { BotLogger } from './bot-logger';
```

Replace:
```typescript
  private readonly logger = new Logger(BotDuelRunner.name);
```
With:
```typescript
  private readonly logger = new BotLogger('DuelRunner');
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/bot/bot-duel-runner.service.ts
git commit -m "refactor(bot): swap Logger for BotLogger in bot-duel-runner"
```

---

### Task 5: Swap BotLogger into bot-battle-royale-runner.service.ts

**Files:**
- Modify: `backend/src/bot/bot-battle-royale-runner.service.ts`

- [ ] **Step 1: Replace Logger import and instantiation**

Replace:
```typescript
import { Injectable, Logger } from '@nestjs/common';
```
With:
```typescript
import { Injectable } from '@nestjs/common';
import { BotLogger } from './bot-logger';
```

Replace:
```typescript
  private readonly logger = new Logger(BotBattleRoyaleRunner.name);
```
With:
```typescript
  private readonly logger = new BotLogger('BRRunner');
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/bot/bot-battle-royale-runner.service.ts
git commit -m "refactor(bot): swap Logger for BotLogger in bot-battle-royale-runner"
```

---

### Task 6: Fix OnlineGameRunner pause persistence + BotLogger + env var interval

**Files:**
- Modify: `backend/src/bot/bot-online-game-runner.service.ts`

- [ ] **Step 1: Update imports**

Replace:
```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { BotService } from './bot.service';
import { OnlineGameService } from '../online-game/online-game.service';
import { OnlineBoardCell, OnlineBoardState } from '../online-game/online-game.types';
import { GeneratedQuestion } from '../questions/question.types';

/** Minimum seconds a bot waits before taking its online game turn (simulates async human). */
const BOT_TURN_MIN_WAIT_SECONDS = 45;
```
With:
```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { BotService } from './bot.service';
import { OnlineGameService } from '../online-game/online-game.service';
import { OnlineBoardCell, OnlineBoardState } from '../online-game/online-game.types';
import { GeneratedQuestion } from '../questions/question.types';
import { BotLogger } from './bot-logger';
import { BOT_ONLINE_RUNNER_INTERVAL_MS, BOT_TURN_MIN_WAIT_SECONDS } from './bot-config';
```

- [ ] **Step 2: Replace Logger instantiation**

Replace:
```typescript
  private readonly logger = new Logger(BotOnlineGameRunner.name);
```
With:
```typescript
  private readonly logger = new BotLogger('OnlineRunner');
```

- [ ] **Step 3: Make pause() and resume() async with DB persistence**

Replace:
```typescript
  pause(): void {
    this._paused = true;
    this.logger.warn('[BotOnlineRunner] Bot turns PAUSED');
  }

  resume(): void {
    this._paused = false;
    this.logger.warn('[BotOnlineRunner] Bot turns RESUMED');
  }
```
With:
```typescript
  async pause(): Promise<void> {
    this._paused = true;
    await this.supabaseService.setSetting('bots_paused', 'true');
    this.logger.warn('Bot turns PAUSED (persisted)');
  }

  async resume(): Promise<void> {
    this._paused = false;
    await this.supabaseService.setSetting('bots_paused', 'false');
    this.logger.warn('Bot turns RESUMED (persisted)');
  }
```

- [ ] **Step 4: Update onModuleInit log message**

Replace:
```typescript
      this.logger.warn('[BotOnlineRunner] Bot turns PAUSED (restored from database)');
```
With:
```typescript
      this.logger.warn('Bot turns PAUSED (restored from database)');
```

- [ ] **Step 5: Replace @Cron with @Interval**

Replace:
```typescript
  @Cron('*/30 * * * * *')
```
With:
```typescript
  @Interval(BOT_ONLINE_RUNNER_INTERVAL_MS)
```

- [ ] **Step 6: Verify the file compiles**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add backend/src/bot/bot-online-game-runner.service.ts
git commit -m "fix(bot): persist OnlineGameRunner pause state + add BotLogger and env interval"
```

---

### Task 7: Update admin.controller.ts to await async pause/resume

**Files:**
- Modify: `backend/src/admin/admin.controller.ts:278-299`

- [ ] **Step 1: Update pauseBots to await the online runner**

Replace:
```typescript
  async pauseBots() {
    await this.botMatchmaker.pause();
    this.botOnlineRunner.pause();
    this.logger.warn('[Admin] All bot activity PAUSED');
    return { paused: true };
  }
```
With:
```typescript
  async pauseBots() {
    await this.botMatchmaker.pause();
    await this.botOnlineRunner.pause();
    this.logger.warn('[Admin] All bot activity PAUSED');
    return { paused: true };
  }
```

- [ ] **Step 2: Update resumeBots to await the online runner**

Replace:
```typescript
  async resumeBots() {
    await this.botMatchmaker.resume();
    this.botOnlineRunner.resume();
    this.logger.warn('[Admin] All bot activity RESUMED');
    return { paused: false };
```
With:
```typescript
  async resumeBots() {
    await this.botMatchmaker.resume();
    await this.botOnlineRunner.resume();
    this.logger.warn('[Admin] All bot activity RESUMED');
    return { paused: false };
```

- [ ] **Step 3: Verify the file compiles**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/admin/admin.controller.ts
git commit -m "fix(bot): await async pause/resume on OnlineGameRunner in admin controller"
```

---

### Task 8: Refactor bot-matchmaker.service.ts — conditional execution, env vars, BotLogger, stale cleanup extraction

This is the largest task. It modifies `bot-matchmaker.service.ts` to:
1. Use BotLogger instead of Logger
2. Import constants from bot-config.ts (replacing hardcoded values)
3. Add a lightweight idle-check before running all 5 tasks
4. Replace `@Cron('*/5 * * * * *')` with `@Interval(BOT_MATCHMAKER_INTERVAL_MS)`
5. Extract stale BR room cleanup to its own `@Interval(BOT_STALE_CLEANUP_INTERVAL_MS)`

**Files:**
- Modify: `backend/src/bot/bot-matchmaker.service.ts`

- [ ] **Step 1: Update imports**

Replace:
```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { BotService } from './bot.service';
import { BotDuelRunner } from './bot-duel-runner.service';
import { BotBattleRoyaleRunner } from './bot-battle-royale-runner.service';
import { BattleRoyaleService } from '../battle-royale/battle-royale.service';

/** Seconds a game must be waiting before a bot is injected. */
const QUEUE_TIMEOUT_SECONDS = 30;

/** Minimum and maximum number of bots to fill into a Battle Royale room. */
const BR_BOT_MIN = 3;
const BR_BOT_MAX = 7;

/** Minimum number of public waiting BR rooms the matchmaker will maintain. */
const BR_MIN_WAITING_ROOMS = 2;

/** Number of seed bots to add when the matchmaker creates a new bot-hosted room. */
const BR_SEED_BOT_COUNT = 3;

/** Minutes a BR room can stay in 'waiting' before being deleted as stale. */
const STALE_BR_ROOM_MINUTES = 10;
```
With:
```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { BotService } from './bot.service';
import { BotDuelRunner } from './bot-duel-runner.service';
import { BotBattleRoyaleRunner } from './bot-battle-royale-runner.service';
import { BattleRoyaleService } from '../battle-royale/battle-royale.service';
import { BotLogger } from './bot-logger';
import {
  BOT_MATCHMAKER_INTERVAL_MS,
  BOT_STALE_CLEANUP_INTERVAL_MS,
  QUEUE_TIMEOUT_SECONDS,
  BR_BOT_MIN,
  BR_BOT_MAX,
  BR_MIN_WAITING_ROOMS,
  BR_SEED_BOT_COUNT,
  STALE_BR_ROOM_MINUTES,
} from './bot-config';
```

- [ ] **Step 2: Replace Logger instantiation**

Replace:
```typescript
  private readonly logger = new Logger(BotMatchmakerService.name);
```
With:
```typescript
  private readonly logger = new BotLogger('Matchmaker');
```

- [ ] **Step 3: Update pause/resume log messages (remove prefix since BotLogger adds it)**

Replace:
```typescript
    this.logger.warn('[Matchmaker] Bot activity PAUSED (persisted)');
```
With:
```typescript
    this.logger.warn('Bot activity PAUSED (persisted)');
```

Replace:
```typescript
    this.logger.warn('[Matchmaker] Bot activity RESUMED (persisted)');
```
With:
```typescript
    this.logger.warn('Bot activity RESUMED (persisted)');
```

Replace:
```typescript
      this.logger.warn('[Matchmaker] Bot activity PAUSED (restored from database)');
```
With:
```typescript
      this.logger.warn('Bot activity PAUSED (restored from database)');
```

- [ ] **Step 4: Replace @Cron with @Interval and add idle check**

Replace:
```typescript
  @Cron('*/5 * * * * *') // every 5 seconds
  async checkQueues(): Promise<void> {
    if (this._paused || this.checkQueuesRunning) return;
    this.checkQueuesRunning = true;
    try {
      await Promise.allSettled([
        this.injectBotsIntoOnlineQueues(),
        this.injectBotsIntoDuelQueues(),
        this.injectBotsIntoBattleRoyaleRooms(),
        this.createBotBRRooms(),
        this.cleanStaleBRRooms(),
      ]);
    } finally {
      this.checkQueuesRunning = false;
    }
  }
```
With:
```typescript
  @Interval(BOT_MATCHMAKER_INTERVAL_MS)
  async checkQueues(): Promise<void> {
    if (this._paused || this.checkQueuesRunning) return;
    this.checkQueuesRunning = true;
    try {
      // Lightweight idle check — skip cycle if nothing is waiting
      const hasWork = await this.hasQueuedWork();
      if (!hasWork) {
        this.logger.debug('No queued work — skipping cycle');
        return;
      }

      await Promise.allSettled([
        this.injectBotsIntoOnlineQueues(),
        this.injectBotsIntoDuelQueues(),
        this.injectBotsIntoBattleRoyaleRooms(),
        this.createBotBRRooms(),
      ]);
    } finally {
      this.checkQueuesRunning = false;
    }
  }

  /**
   * Stale BR room cleanup on its own slower interval (every 60s).
   */
  @Interval(BOT_STALE_CLEANUP_INTERVAL_MS)
  async cleanupStaleRooms(): Promise<void> {
    if (this._paused) return;
    await this.cleanStaleBRRooms();
  }
```

- [ ] **Step 5: Add the hasQueuedWork() method**

Add this private method to the class, right before the `// ── Online Game` comment block:

```typescript
  /**
   * Quick count check: are there any queued online games, waiting duels,
   * or waiting BR rooms? Returns true if any queue has work.
   */
  private async hasQueuedWork(): Promise<boolean> {
    const [online, duel, br] = await Promise.all([
      this.supabaseService.client
        .from('online_games')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'queued')
        .is('guest_id', null),
      this.supabaseService.client
        .from('duel_games')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting')
        .is('guest_id', null),
      this.supabaseService.client
        .from('battle_royale_rooms')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting'),
    ]);

    return (online.count ?? 0) + (duel.count ?? 0) + (br.count ?? 0) > 0;
  }
```

- [ ] **Step 6: Remove duplicate [Matchmaker] prefixes from all remaining log messages**

Since BotLogger now adds `[BOT:Matchmaker]` automatically, remove the manual `[Matchmaker]` prefix from all log messages in the file. Replace every occurrence of `[Matchmaker] ` in log strings with empty string. Affected lines:

- `this.logger.warn(`[Matchmaker] Online game ${game.id} bot inject failed: ${err}`)` → `this.logger.warn(`Online game ${game.id} bot inject failed: ${err}`)`
- `this.logger.warn(`[Matchmaker] No bot available for online game ${gameId}`)` → `this.logger.warn(`No bot available for online game ${gameId}`)`
- `this.logger.warn(`[Matchmaker] Failed to inject bot into online game ${gameId}: ${error.message}`)` → `this.logger.warn(`Failed to inject bot into online game ${gameId}: ${error.message}`)`
- `this.logger.debug(`[Matchmaker] Bot "${bot.username}" matched into online game ${gameId}`)` → `this.logger.debug(`Bot "${bot.username}" matched into online game ${gameId}`)`
- And all other instances following the same pattern throughout the file (duel, BR sections)

- [ ] **Step 7: Verify the file compiles**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add backend/src/bot/bot-matchmaker.service.ts
git commit -m "feat(bot): conditional cron execution, env var intervals, BotLogger in matchmaker"
```

---

### Task 9: Remove duplicate prefixes from remaining bot services

After swapping to BotLogger (Tasks 3-5), the log message strings still contain manual `[BotDuelRunner]`, `[BotBRRunner]`, `[BotOnlineRunner]`, `[updateBotStats]` prefixes that are now redundant with BotLogger's automatic `[BOT:<context>]` prefix.

**Files:**
- Modify: `backend/src/bot/bot-duel-runner.service.ts`
- Modify: `backend/src/bot/bot-battle-royale-runner.service.ts`
- Modify: `backend/src/bot/bot-online-game-runner.service.ts`
- Modify: `backend/src/bot/bot.service.ts`

- [ ] **Step 1: Clean bot-duel-runner.service.ts prefixes**

Remove `[BotDuelRunner] ` from all log message strings in the file:
- `'[BotDuelRunner] Starting bot ...'` → `'Starting bot ...'`
- `'[BotDuelRunner] Max attempts ...'` → `'Max attempts ...'`
- `'[BotDuelRunner] Duel ${gameId} ended ...'` → `'Duel ${gameId} ended ...'`

- [ ] **Step 2: Clean bot-battle-royale-runner.service.ts prefixes**

Remove `[BotBRRunner] ` from all log message strings:
- `'[BotBRRunner] Starting ...'` → `'Starting ...'`
- `'[BotBRRunner] Bot ${botId} answer error ...'` → `'Bot ${botId} answer error ...'`
- `'[BotBRRunner] Bot ${botId} finished ...'` → `'Bot ${botId} finished ...'`

- [ ] **Step 3: Clean bot-online-game-runner.service.ts prefixes**

Remove `[BotOnlineRunner] ` from all log message strings:
- `'[BotOnlineRunner] Turn failed ...'` → `'Turn failed ...'`
- `'[BotOnlineRunner] Bot ${botId} answered ...'` → `'Bot ${botId} answered ...'`

- [ ] **Step 4: Clean bot.service.ts prefix**

Remove `[updateBotStats] ` from the log message:
- `'[updateBotStats] Failed for bot ...'` → `'Stats update failed for bot ...'`

- [ ] **Step 5: Verify all files compile**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add backend/src/bot/bot-duel-runner.service.ts backend/src/bot/bot-battle-royale-runner.service.ts backend/src/bot/bot-online-game-runner.service.ts backend/src/bot/bot.service.ts
git commit -m "refactor(bot): remove redundant log prefixes now handled by BotLogger"
```

---

### Task 10: Full build verification

- [ ] **Step 1: Run full TypeScript build**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty`
Expected: Clean build with zero errors

- [ ] **Step 2: Start the backend and verify bot module initializes**

Run: `cd /Users/instashop/Projects/football-quizball/backend && timeout 15 npm run start 2>&1 | tail -30`
Expected: See `BOT:Matchmaker` and `BOT:OnlineRunner` in startup logs. If bots are paused, should see "PAUSED (restored from database)" messages.

- [ ] **Step 3: Commit all remaining changes (if any)**

If there are any uncommitted fixes from build verification, commit them.
