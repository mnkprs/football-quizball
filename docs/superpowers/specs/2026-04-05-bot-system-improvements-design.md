# Bot System Improvements — Design Spec

**Date:** 2026-04-05
**Goal:** Re-enable the bot system with reduced resource usage, clean log separation, and runtime tunability.
**Approach:** Smart Scheduling + Log Isolation (Approach B from brainstorm)

---

## Context

The bot system supports all 3 game modes (Duel, Battle Royale, Online Game) and serves two purposes:
1. **QA/testing** — simulate real users to test features end-to-end
2. **Fake traffic** — make the app feel alive with populated lobbies for early users

Bots were paused due to log noise — bot activity drowned out real errors in Railway logs, making it hard to track what's actually broken. The system is functional but wasteful when idle and lacks runtime configurability.

## Scope

4 changes, all in `backend/src/bot/`:

1. Fix OnlineGameRunner pause persistence (write path)
2. Conditional cron execution to reduce idle DB churn
3. Bot log isolation with dedicated prefix and log level
4. Configurable intervals via env vars

No new game modes, no new bot behaviors, no frontend changes.

---

## 1. Fix OnlineGameRunner Pause Persistence

**Problem:** `BotOnlineGameRunner.pause()` and `resume()` only set the in-memory `_paused` flag. The read path (`onModuleInit`) correctly restores from DB, but the write path doesn't persist. If the online runner's pause/resume were called independently of the matchmaker, the state would be lost on restart.

**Fix:** Make `pause()` and `resume()` async and persist to `app_settings` via `supabaseService.setSetting('bots_paused', ...)`, matching the `BotMatchmakerService` pattern.

**Files:** `bot-online-game-runner.service.ts`

**Behavior:** Since both services share the `bots_paused` key and the admin controller always pauses both together, this is a consistency fix — ensuring the write path matches the read path that already exists.

---

## 2. Conditional Cron Execution

**Problem:** The matchmaker cron fires every 5 seconds and runs 5 Supabase queries per cycle (online queues, duel queues, BR rooms, BR room creation, stale cleanup). When no players are online, this produces ~60k idle queries/hour.

**Fix:**

### Matchmaker (5s cron)
Before running all 5 tasks, execute a single lightweight query that counts:
- `online_games` with `status = 'queued'` and `guest_id IS NULL`
- `duel_games` with `status = 'waiting'` and `guest_id IS NULL`
- `battle_royale_rooms` with `status = 'waiting'`

If all counts are zero, skip the entire cycle. One query instead of five.

Implementation: Three `count: 'exact', head: true` queries batched via `Promise.all` — no new RPC needed. If all three return 0, return early.

### Stale BR Room Cleanup
Move from the 5s matchmaker cycle to its own interval at 60s. Stale rooms (10+ minutes old) don't need sub-minute cleanup frequency.

### Online Game Runner (30s cron)
No change needed — already exits early when no bot turns are pending.

---

## 3. Bot Log Isolation

**Problem:** Bot logs use `logger.debug` and `logger.warn` which mix with real user error logs, making Railway log monitoring noisy.

**Fix:**

### BotLogger Utility
Create a `BotLogger` class that wraps NestJS `Logger`:
- Reads `BOT_LOG_LEVEL` env var on construction (default: `warn`)
- Prefixes all messages with `[BOT:<context>]` (e.g. `[BOT:Matchmaker]`, `[BOT:DuelRunner]`)
- Suppresses `debug()` calls when `BOT_LOG_LEVEL` is `warn`
- Passes through `warn()` and `error()` calls always

```typescript
// Usage in bot services:
private readonly logger = new BotLogger('Matchmaker');

this.logger.debug('Skipping cycle — no queued games');  // suppressed by default
this.logger.warn('Bot inject failed: ...');              // always shown
```

### Migration
Replace `new Logger(...)` with `new BotLogger(...)` in all 5 bot services:
- `bot.service.ts`
- `bot-matchmaker.service.ts`
- `bot-duel-runner.service.ts`
- `bot-online-game-runner.service.ts`
- `bot-battle-royale-runner.service.ts`

**File:** New file `backend/src/bot/bot-logger.ts` (~20 lines)

---

## 4. Configurable Intervals via Env Vars

**Problem:** All timing constants and bot counts are hardcoded. Tuning requires a code change and redeploy.

**Fix:** Read from `process.env` with fallback defaults.

| Env Var | Default | Purpose |
|---------|---------|---------|
| `BOT_MATCHMAKER_INTERVAL_SEC` | `5` | Matchmaker polling frequency |
| `BOT_ONLINE_RUNNER_INTERVAL_SEC` | `30` | Online game turn polling frequency |
| `BOT_QUEUE_TIMEOUT_SEC` | `30` | Seconds before bot injection |
| `BOT_BR_MIN_BOTS` | `3` | Min bots per BR room |
| `BOT_BR_MAX_BOTS` | `7` | Max bots per BR room |
| `BOT_BR_MIN_WAITING_ROOMS` | `2` | Public waiting rooms to maintain |
| `BOT_STALE_ROOM_MINUTES` | `10` | Stale room cleanup threshold |
| `BOT_LOG_LEVEL` | `warn` | Bot log verbosity (`debug` or `warn`) |

### Cron to Interval Migration
NestJS `@Cron` requires static strings. Replace with `@Interval` for the two configurable crons:
- Matchmaker: `@Interval(BOT_MATCHMAKER_INTERVAL_MS)`
- Online runner: `@Interval(BOT_ONLINE_RUNNER_INTERVAL_MS)`
- Stale cleanup: `@Interval(60_000)` (new, fixed 60s)

Constants read from env at module load time (top of file), not injected via ConfigService, to keep it simple.

**Files:** `bot-matchmaker.service.ts`, `bot-online-game-runner.service.ts`

---

## File Change Summary

| File | Change |
|------|--------|
| `bot-logger.ts` | **NEW** — BotLogger wrapper (~20 lines) |
| `bot-matchmaker.service.ts` | Conditional execution, env var intervals, BotLogger, stale cleanup extraction |
| `bot-online-game-runner.service.ts` | Persist pause/resume, env var interval, BotLogger |
| `bot-duel-runner.service.ts` | BotLogger swap |
| `bot-battle-royale-runner.service.ts` | BotLogger swap |
| `bot.service.ts` | BotLogger swap |

---

## Testing Plan

1. **Pause persistence:** Pause via admin API, restart server, verify both matchmaker and online runner restore paused state
2. **Conditional execution:** With no queued games, verify logs show skipped cycles (set `BOT_LOG_LEVEL=debug`)
3. **Log isolation:** With `BOT_LOG_LEVEL=warn`, verify no bot debug messages appear. Switch to `debug`, verify they appear.
4. **Env var tuning:** Set `BOT_MATCHMAKER_INTERVAL_SEC=10` on Railway, verify slower polling
5. **Full re-enable:** Resume bots via admin API, verify all 3 game modes get bot injection

---

## Out of Scope

- New game mode support (logo duel bots, etc.)
- Bot personality/behavior changes
- Frontend admin dashboard changes
- Bot stat accuracy improvements
- Event-driven architecture (deferred to future iteration)
