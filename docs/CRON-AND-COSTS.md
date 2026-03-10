# Cron Jobs & Manual Seeding

## What Runs in the Cloud Backend

Only **News** and **Daily** run automatically. **Question pool** and **Blitz pool** are seeded manually via local scripts.

| Service | Schedule | What it does | LLM cost |
|---------|----------|--------------|----------|
| NewsService.scheduledIngest | Every 6 hours | Fetches headlines, generates NEWS questions (target 10). | Low (~3 calls) |
| DailyService | Daily 1 AM + onModuleInit | Pre-generates "on this day" questions (8/day). | Low (1 call) |

## Manual Seeding (Run Locally)

You seed `question_pool` and `blitz_question_pool` yourself. No cron or onModuleInit touches these tables in the cloud.

### Question pool (Solo mode)

```bash
cd backend
# Single slot: add N questions to CATEGORY/DIFFICULTY
npm run seed-pool -- GUESS_SCORE/MEDIUM 50

# All slots: add N questions to each slot
npm run seed-pool -- 50
```

- Slots: `HISTORY`, `PLAYER_ID`, `HIGHER_OR_LOWER`, `GUESS_SCORE`, `TOP_5`, `GEOGRAPHY`, `GOSSIP` + `EASY`/`MEDIUM`/`HARD`
- Requires `.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.

### Blitz pool

```bash
cd backend
npm run seed-blitz-pool -- 20
```

- `20` = target per band. Omit for per-band defaults (20 each).
- Same env vars as above.

### Cleanup (remove invalid/duplicates)

```bash
cd backend
npm run cleanup
```

## Database Stats

Run in Supabase SQL Editor. Use `supabase/scripts/pool_counts_all_slots.sql` to see all expected slots including TOP_5.
