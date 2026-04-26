# TODOS

Deferred work tracked for future PRs. Each item lists the trigger condition that should re-prioritize it.

---

## [PENDING] Migrate standard-duel Random Opponent to widget pattern

**Source:** `/plan-eng-review` 2026-04-26 (decision 2A=B, T1)
**Trigger:** Floating duel queue widget shipped + 1-2 weeks of logo-duel telemetry showing the pattern works.

### What
Wire `frontend/src/app/features/duel/duel-lobby.ts` Random Opponent button to call `QueueStateService.startQueue('standard')` instead of `joinQueue()` + immediate navigation. Mirror the same flow logo duel uses post-launch.

### Why
2A=B in the queue-widget eng review locked logo-only scope to ship the widget pattern faster. This leaves the codebase with two matchmaking UX patterns (logo via widget, standard via dedicated lobby). One-release inconsistency is acceptable; long-term inconsistency is debt.

### Pros
- Consistent matchmaking UX across modes
- Deletes the `duel-lobby.ts` Random Opponent code path entirely (~30 lines)
- Lets future matchmaking improvements ship once instead of twice

### Cons
- Re-validates standard-duel-specific edge cases (invite codes, Active Duels list)
- Touches `duel-lobby.ts` which other features import from

### Context
Standard duel still has Create Duel + Join With Code paths in its bottom sheet — those stay in the lobby. Only the Random Opponent path gets migrated to the widget. The lobby itself remains for invite-flow access.

### Depends on
- Queue widget PR shipped to production
- 1-2 weeks of widget telemetry confirming the pattern

---

## [PENDING] Forfeit rate-limiting / anti-griefing

**Source:** `/plan-eng-review` 2026-04-26 (outside voice finding #10, T2)
**Trigger:** Daily logo-duel queue volume crosses ~500 matches OR support ticket about repeated forfeits.

### What
Detect repeated reservation forfeits per user. Apply temporary queue ban (e.g., >3 forfeits in 1 hour = 15-min queue cooldown). Surface the cooldown clearly in the widget when it triggers.

### Why
OV1=B locked -5 ELO per forfeit. A determined troll can forfeit 100 times in a row, hit the ELO floor (500), and continue griefing matched opponents from there with no escalating consequence. Each forfeit wastes another player's 10s reservation window. At low scale this is noise; at moderate scale it degrades matchmaking quality.

### Pros
- Defends queue quality from clearly abusive patterns
- Only kicks in for repeated forfeits, not one-offs
- Existing `elo_history` writes give us the data source for free

### Cons
- New service surface (`ForfeitRateLimitService`)
- False-positive risk: a player having a bad day (3 phone-died scenarios in an hour) gets banned
- Temp-ban UX in the widget is new design surface

### Context
Forfeit detection is a server-side concern — the cron sweep already counts forfeits. Add a query: `SELECT user_id, COUNT(*) FROM elo_history WHERE elo_change = -5 AND reason = 'reservation_forfeit' AND created_at > NOW() - INTERVAL '1 hour' GROUP BY user_id HAVING COUNT(*) >= 3`. Cooldown stored in a new `queue_cooldowns` table or as a column on `profiles`.

### Depends on
- Queue widget PR shipped
- Production telemetry on forfeit rate per user

---

## [PENDING] Reopen bot fallback decision

**Source:** `/plan-eng-review` 2026-04-26 (decision S0=B, T3)
**Trigger:** Logo duel retention telemetry shows off-peak queue abandonment > 40% OR product team identifies "lonely hours" as a growth blocker.

### What
Run `/office-hours` session on "should bots return for matchmaking, in what form?" Re-evaluate the bot-purge decision (migrations 20260503000000 + 20260503300000) against the floating queue widget UX.

### Why
S0=B shipped the widget without bots. Lonely-hours queues sit indefinitely with "still searching" copy. Outside voice flagged this as a "feature partly DOA" framing. The bot-purge was deliberate — but the new widget UX changes the cost-benefit calculation. Off-peak players who join queue and walk away may never return.

### Pros
- Forces clean product re-evaluation rather than silent drift
- Considers narrower bot scope (e.g., bot fallback after 60s only, never as primary opponent)
- Captures the original purge reasoning before re-litigating

### Cons
- A real session of work, not a 30-min tweak
- Re-opens a decision that was made deliberately and may be re-affirmed

### Context
Bot-purge migrations:
- `supabase/migrations/20260503000000_purge_bot_activity.sql`
- `supabase/migrations/20260503300000_remove_bots_from_profiles.sql`

Read these before reopening to understand what was removed and why.

### Depends on
- Production telemetry on logo duel retention by hour-of-day
- 4+ weeks of widget data
