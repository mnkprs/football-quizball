# Cron Jobs & LLM Cost Analysis

## What's Running (Backend Crons)

These run automatically when your NestJS backend is deployed (e.g. on Railway):

| Cron | Schedule | What it does | LLM cost |
|------|----------|--------------|----------|
| **QuestionPoolService.scheduledRefill** | **Every 5 minutes** | Refills `question_pool` for Solo mode. Targets **50 questions per slot**. 18 slots (HISTORY×3, PLAYER_ID×3, etc.). Each question = 1 generate + 1 translate (Greek). | **HIGH** – main cost driver |
| BlitzPoolSeederService.scheduledTopUp | Daily 3 AM | Refills `blitz_question_pool`. 9 bands × 20 questions. HISTORY has 3 bands (60 questions). | Medium |
| NewsService.scheduledIngest | Every 6 hours | Fetches headlines, generates NEWS questions (target 10). | Low |
| DailyService | Daily 1 AM | Pre-generates daily "on this day" questions. | Low |

## Why You Have Thousands of History Questions

- **question_pool**: Solo mode. HISTORY has 3 slots (EASY, MEDIUM, HARD). Target = 50 each → 150 HISTORY questions minimum.
- **blitz_question_pool**: Blitz mode. HISTORY has 3 bands (10–35, 40–65, 70–95). Target = 20 each → 60 HISTORY questions per band cycle.
- The **every-5-minute** refill keeps topping up any slot below 50. If games consume questions slowly, the pool grows. If `get_seed_pool_stats` ever undercounts (e.g. `used` not set correctly), it will keep generating.

## Cost Source

- **Gemini API** (Google GenAI): every `generateOne()` and `translateToGreek()` call costs tokens.
- 288 runs/day × multiple LLM calls per run = significant usage.

## Recommended Fixes

### 1. Slow down the pool refill (immediate)

Change `EVERY_5_MINUTES` to `EVERY_HOUR` or `EVERY_DAY_AT_3AM` in `question-pool.service.ts`:

```ts
@Cron(CronExpression.EVERY_HOUR)  // was EVERY_5_MINUTES
async scheduledRefill() { ... }
```

### 2. Lower the pool target

In `question-pool.service.ts`, reduce `DEFAULT_TARGET` from 50 to 10–20:

```ts
const DEFAULT_TARGET = 15;  // was 50
```

### 3. Disable pool cron entirely

Set `DISABLE_POOL_CRON=1` in your environment. This skips both the hourly refill and the startup refill.

**Where to set it (Railway):**
- **Shared Variables**: Project Settings → Shared Variables → Add `DISABLE_POOL_CRON` = `1`, then share it with your backend service.
- **Service Variables**: Open your backend service → Variables tab → New Variable → `DISABLE_POOL_CRON` = `1`.

For local dev, add to your `.env` file.

### 4. Check your database

Run in Supabase SQL Editor. Use `supabase/scripts/pool_counts_all_slots.sql` to see **all** expected slots including TOP_5 (even when zero):

```sql
-- All expected slots including TOP_5 (see supabase/scripts/pool_counts_all_slots.sql)
-- Or quick counts (only slots that have rows):
SELECT category, difficulty, COUNT(*) AS total, COUNT(*) FILTER (WHERE used = false) AS unanswered
FROM question_pool
GROUP BY category, difficulty
ORDER BY category, difficulty;

-- blitz_question_pool counts (Blitz does NOT use TOP_5 — only HISTORY, GEOGRAPHY, GOSSIP, PLAYER_ID)
SELECT category, COUNT(*) AS total, COUNT(*) FILTER (WHERE used = false) AS unanswered
FROM blitz_question_pool
GROUP BY category
ORDER BY category;
```

**Note:** The Solo pool refill *does* include TOP_5/HARD (2 questions per board). If TOP_5 doesn't appear in the first query, you have no TOP_5 questions yet — the refill will generate them when that slot is below target. Blitz mode does not use TOP_5 by design.

If you see thousands of HISTORY rows with `unanswered` high, the refill is over-generating.

### 5. Clean up excess questions (optional)

If you want to trim the pool, you can delete questions above a cap per slot. Do this carefully and test first.
