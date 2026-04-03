# News Daily Rounds: Wordle-Model Retention System

**Date:** 2026-04-03
**Status:** Implemented

## Problem

Current news pipeline has zero urgency. Questions sit in a personal 20-question queue for 7 days. No FOMO, no reason to come back now, no streaks, no shared experience between users.

## Design: Daily Rounds (Wordle Model)

### Core Concept

Every day at midnight UTC, a new round of 10 questions is generated from BBC Sport headlines. All users see the same 10 questions. If you don't play that day, those questions are gone forever.

### Round Lifecycle

```
00:00 UTC  [Round] 10 questions generated, expires_at = 23:59:59 UTC
23:59 UTC  Round expires (10-min grace on answer submission)
00:00 UTC  New round generated
```

### What Users See

- **Active round:** 10 questions + countdown timer ("Xh Ym until tomorrow's round")
- **Mid-round (partially answered):** remaining unanswered questions + score so far
- **Missed/no round:** "No round right now" + countdown + streak info
- **Finished round:** Score card "You got 7/10" + streak badge + "See you tomorrow!"

---

## Database Changes

### New tables
- `news_rounds` (id, created_at, expires_at, question_count)
- `user_news_streaks` (user_id PK, current_streak, max_streak, last_round_id, total_rounds_played, total_correct, total_answered)

### Schema changes
- `news_questions`: added `round_id uuid` column, `expires_at` default changed to 24 hours
- `user_news_progress`: added `correct boolean` column

### Functions updated
- `expire_news_questions()`: also cleans up empty rounds

Migration: `supabase/migrations/20260602000000_news_daily_rounds.sql`

---

## Backend Changes

### `NewsService` (`backend/src/news/news.service.ts`)
- `ingestNews()`: creates a round, caps at 10 questions, checks for active round first, retries RSS 3x
- `getNewsQuestions()`: returns current round's unanswered questions (no personal queue)
- `checkNewsAnswer()`: 10-min grace period, increments profiles + user_mode_stats, updates streaks
- `getMetadata()`: returns { round_id, questions_total, questions_remaining, expires_at, streak, max_streak }
- Cron: `EVERY_DAY_AT_MIDNIGHT` (was EVERY_6_HOURS)
- Auth guards added to POST /api/news/ingest and POST /api/news/expire

### Streak Logic
- "Played" = answered at least 1 question in a round
- Streak continues if last_round was yesterday's round
- Streak resets on skip days

---

## Frontend Changes

### `NewsModeComponent` (`frontend/src/app/features/news-mode/`)
- New phases: loading, empty, question, result, finished
- Countdown timer (setInterval, shows time until next round)
- Streak display (flame icon + "X day streak")
- Score card on finish (X/10, streak badge, "See you tomorrow")
- Empty state with countdown and streak info

### `NewsApiService` (`frontend/src/app/core/news-api.service.ts`)
- Updated metadata interface to match new backend response

### Updated consumers
- `today.ts`: uses `questions_remaining` and `expires_at` instead of `count` and `updatesAt`
- `notification-banner.ts`: same field mapping update

---

## Global Stat Audit (SEPARATE TICKET)

Only Solo and Mayhem currently increment `profiles.questions_answered`. 7 other modes (Duel, BR, Board, Blitz, Logo Quiz, News, Online) don't. This is tracked separately.

---

## Retention Hooks Enabled

1. **Daily streak counter**: visible in News Mode and profile
2. **Round score card**: "You got 7/10" with streak badge
3. **Countdown timer**: always visible, creates anticipation
4. **FOMO**: miss the day, miss the round

## Future (not in scope)
- Push notification: "Today's round is live"
- Social sharing card
- Weekly accuracy leaderboard
- Streak rewards (XP, badges)
