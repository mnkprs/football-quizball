# Pre-Production Checklist — QuizBall

> Last updated: 2026-03-25
> Target: 400 concurrent players

---

## Must Have (blocks launch)

### 1. Upgrade Supabase to Pro ($25/mo)
- **Why:** Free tier allows 200 concurrent realtime connections. At 400 players with 2 channels each, you need 800 channel subscriptions. Pro gives 500 — still short, but paired with the Broadcast optimization (see #5) it's enough.
- **How:** Supabase Dashboard → Billing → Upgrade to Pro
- **Also unlocks:** More DB connections (free: 60, Pro: ~100+), 8GB storage, daily backups

### 2. Set MAX_WORKERS=4 on Railway
- **Why:** Backend runs NestJS in cluster mode, defaulting to 2 workers. At 133 req/s peak, that's 66 req/s per worker. 4 workers gives comfortable headroom.
- **How:** Railway Dashboard → Backend service → Variables → Add `MAX_WORKERS=4`
- **Verify:** After deploy, check logs for "Primary starting 4 workers"

### 3. Upgrade Upstash Redis (pay-as-you-go)
- **Why:** Free tier is 10K commands/day. Cache reads + leaderboard lookups alone will exhaust this within an hour at 400 players. Pay-as-you-go charges ~$0.20 per 100K commands.
- **How:** Upstash Console → Database → Upgrade plan
- **Cost:** ~$1-5/mo depending on traffic

---

## Should Have (important for stability)

### 4. Add rate limiting to BR answer endpoint
- **Why:** No rate limit on `POST /api/battle-royale/:id/answer`. A misbehaving client could spam answers. The CAS guard prevents double-scoring but doesn't prevent the DB load from repeated attempts.
- **How:** Add `@Throttle(10, 1)` (10 requests per second per user) to the BR answer controller. Already using `@nestjs/throttler` in other controllers.

### 5. Switch BR realtime from postgres_changes to Broadcast
- **Why:** `postgres_changes` creates a DB-level subscription per channel. At 50 concurrent games × 2 channels = 100 DB-level listeners triggering on every row change. Broadcast channels are lighter — the backend pushes data directly to the channel, no DB listener needed.
- **How:**
  1. After a player answers, backend publishes the updated leaderboard to a Supabase Broadcast channel (`br:${roomId}`)
  2. Frontend subscribes to 1 Broadcast channel instead of 2 postgres_changes channels
  3. Frontend receives the leaderboard payload directly — no refreshRoom() API call needed
- **Impact:** Cuts realtime connections from 800 to 400. Eliminates all refreshRoom() DB queries. Leaderboard updates become instant (no 500ms debounce needed).

### 6. Add connection pool monitoring
- **Why:** Supabase free tier has ~60 connections. The backend uses a single `createClient()` with service role — no explicit pool config. Under load, each concurrent request holds a connection.
- **How:** Add Supabase connection count to the `/api/health` endpoint. Set up a Railway alert if connections exceed 80% of limit.

---

## Nice to Have (for >500 players or better UX)

### 7. Add minimum player count for BR games
- **Why:** Currently a game can start with 1 player. Not a bug, but a bad experience for Quick Join if bots don't fill fast enough.
- **How:** Enforce minimum 2 players in `startRoom()`. Quick Join matchmaker should wait up to 15s for more players before auto-starting with bots.

### 8. CDN for question images
- **Why:** Logo quiz images and career path badges are served directly. At 400 players loading image-heavy questions simultaneously, origin bandwidth could spike.
- **How:** Serve images through Supabase Storage (already CDN-backed) or Cloudflare R2.

### 9. Pre-warm question pools before peak hours
- **Why:** If the blitz/question pool runs low during peak, the LLM seeding cron won't keep up. AI generation takes 2-5 seconds per question.
- **How:** Schedule `npm run blitz:seed -- 50` and `npm run pool:seed -- 50` to run 1 hour before expected peak traffic.

### 10. Error tracking (Sentry or similar)
- **Why:** At 400 concurrent players, silent errors become invisible. The stress test showed 0 errors, but production traffic has edge cases the test doesn't cover (network timeouts, stale tokens, race conditions).
- **How:** `npm install @sentry/nestjs` for backend. Add Sentry DSN to Railway env vars.

---

## Verified by stress testing (2026-03-25)

| Test | Result |
|------|--------|
| 10 games × 8 bots (80 concurrent players, 800 submissions) | **0 errors**, 108 req/s, p50=98ms, p99=219ms |
| 4 bots × 1 game with browser watching live leaderboard | Realtime updates delivered correctly, all scores reflected |
| Supabase REST latency under load | p50=98ms, p90=116ms (localhost → cloud) |
| refreshRoom debounce | Implemented — collapses multiple realtime events into 1 fetch per 500ms window |
| NG0956 DOM recreation fix | Implemented — `track $index` on all MC choice loops |
| Bot FK constraint fix | Fixed — auth.users + profiles created for all 30 dummy_users |

---

## Infrastructure summary

| Component | Current | Production recommendation |
|-----------|---------|--------------------------|
| Frontend | Vercel (free) | Vercel (free is fine — static CDN) |
| Backend | Railway (starter) | Railway ($5/mo) + MAX_WORKERS=4 |
| Database | Supabase (free) | **Supabase Pro ($25/mo)** |
| Cache | Upstash Redis (free) | **Upstash pay-as-you-go (~$1-5/mo)** |
| Realtime | Supabase postgres_changes | **Supabase Broadcast** (code change) |
| Monitoring | None | Sentry ($0 free tier) |

**Estimated monthly cost at 400 players: ~$35/mo**
