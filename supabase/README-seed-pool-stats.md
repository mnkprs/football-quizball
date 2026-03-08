# Seed Pool Stats Script

Calculates unanswered (`used=false`) and answered (`used=true`) question counts per category and per difficulty.

## Output format

```
TOP 5 / EASY
UNANSWERED: 122
ANSWERED: 300

TOP 5 / MEDIUM
UNANSWERED: 45
ANSWERED: 89
...
```

## Option 1: Run in Supabase SQL Editor

1. Open your Supabase project → **SQL Editor**
2. Run the migration first (creates the function):

```sql
-- Copy contents from supabase/migrations/20250308000000_get_seed_pool_stats.sql
```

3. Query the stats:

```sql
SELECT * FROM get_seed_pool_stats();
```

## Option 2: Supabase Edge Function (formatted output)

1. Apply the migration (creates `get_seed_pool_stats`):

```bash
supabase db push
# or run the SQL in Supabase SQL Editor
```

2. Deploy the Edge Function:

```bash
supabase functions deploy seed-pool-stats
```

3. Invoke via HTTP:

```bash
curl https://<your-project-ref>.supabase.co/functions/v1/seed-pool-stats
```

- Plain text: default or `Accept: text/plain`
- JSON: `Accept: application/json`

## Option 3: pg_cron (scheduled on Supabase)

To run the stats periodically and log them, you can use pg_cron (if enabled):

```sql
-- Enable pg_cron extension (Supabase dashboard → Database → Extensions)
-- Then create a job that logs stats (example: every day at 00:00 UTC)
SELECT cron.schedule(
  'log-seed-pool-stats',
  '0 0 * * *',
  $$SELECT * FROM get_seed_pool_stats()$$
);
```
