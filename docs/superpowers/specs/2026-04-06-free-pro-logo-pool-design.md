# Free/Pro Logo Pool & Matchmaking Design

**Date**: 2026-04-06
**Status**: Draft
**Problem**: Free and pro users share the same logo question pool. No content gating exists — the old 150-play counter gate doesn't restrict *which* logos free users see, just how many times they can play. Duels leak the entire pool to free users.

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Free pool selection | Top N logos by lowest `question_elo` | Popularity correlates with low ELO; no schema changes needed |
| Free pool size | `FREE_LOGO_POOL_SIZE = 100` (hard constant) | Start conservative, tune later |
| Duel question pool | Always full (1100+) | Pro users shouldn't be penalized; unfamiliar logos nudge free users to upgrade |
| Matchmaking segmentation | None — free and pro match together | Keeps matchmaking pool large for a new app |
| Free user ELO cap | Cap at max `question_elo` in free pool | Prevents leaderboard inflation from grinding recycled logos |
| Upsell strategy | Subtle, two triggers | Post-duel banner + mastery upsell in solo |

## Architecture

### 1. ELO Cutoff Computation

Compute the `question_elo` value of the Nth logo (ordered ascending) from `question_pool WHERE category = 'LOGO_QUIZ'`. This value becomes the **cutoff** — any logo with `question_elo <= cutoff` is in the free pool.

- Query: `SELECT question_elo FROM question_pool WHERE category = 'LOGO_QUIZ' ORDER BY question_elo ASC LIMIT 1 OFFSET (FREE_LOGO_POOL_SIZE - 1)`
- Cache in `NodeCache` with 1-hour TTL (pool changes rarely)
- Expose via a method on `LogoQuizService` (e.g., `getFreePoolCutoff(): Promise<number>`)

### 2. Solo Logo Quiz (LogoQuizService.getQuestion)

**Free users**:
- Remove the old `totalPlayed >= 150` counter check
- Add `p_max_elo` parameter to the `draw_logo_questions_by_elo` RPC (Supabase migration required) to filter `question_elo <= cutoff`
- Add same `p_max_elo` parameter to the `draw_questions` RPC for the fallback categorical draw
- Pass `null` for pro users (no filter) and the cutoff value for free users
- Logos recycle indefinitely — free users can play forever within the restricted pool

**Pro users**:
- No change — full pool, no filter

### 3. ELO Cap for Free Users (LogoQuizService.submitAnswer)

When a free user's logo ELO would exceed the cutoff value after an answer:
- Clamp `newElo` to the cutoff value
- Return `elo_capped: true` alongside the normal answer result

This applies to both normal and hardcore logo ELO.

### 4. Duel Logo Questions (DuelService)

**No change needed.** `drawLogosForTeamMode()` already draws from the full pool with no tier filter. This is the desired behavior — duels always use the full 1100+ pool regardless of player tiers.

### 5. Battle Royale Logo Questions

**No change needed.** Battle Royale is already pro-gated (with 1 free trial). Uses `drawLogosForTeamMode()` which draws from the full pool.

### 6. Post-Duel Subtle Upsell

**Backend (DuelService)**:
- When returning duel results, compute whether each question's `question_elo` exceeds the free pool cutoff
- Include `is_pro_logo: boolean` per question in the results payload

**Frontend (DuelPlayComponent)**:
- On duel results screen, if the user is free and any `is_pro_logo: true` questions appeared, show a subtle banner: *"You faced logos from the Pro collection. Unlock 1000+ logos with Pro."*
- Dismiss/upgrade CTA
- Show once per duel, not per question
- **Do not show if the free user won** — celebrate the win instead

### 7. Solo Mastery Upsell

**Backend**: Return `elo_capped: true` from `submitAnswer` when the ELO cap is hit.

**Frontend (LogoQuizComponent)**:
- When `elo_capped: true` is received, show a one-time message: *"You've mastered the free logos! Unlock 1000+ more with Pro."*
- Persist dismissal in `localStorage` so it doesn't nag every game

## Changes Summary

| File | Change |
|------|--------|
| `backend/src/logo-quiz/logo-quiz.service.ts` | Add `getFreePoolCutoff()` with NodeCache. Modify `getQuestion()` to filter by cutoff for free users. Remove `totalPlayed >= 150` gate. Modify `submitAnswer()` to clamp ELO and return `elo_capped`. |
| `supabase/migrations/` | New migration: add optional `p_max_elo` parameter to `draw_logo_questions_by_elo` and `draw_questions` RPCs. When non-null, filter `question_elo <= p_max_elo`. |
| `backend/src/logo-quiz/logo-quiz.types.ts` | Add `elo_capped?: boolean` to `LogoQuizAnswerResult`. Add `is_pro_logo?: boolean` to duel question type. |
| `backend/src/duel/duel.service.ts` | Add `is_pro_logo` flag to duel result questions based on cutoff comparison. |
| `frontend/src/app/features/duel-play/` | Show subtle Pro collection banner on results screen for free users (skip if won). |
| `frontend/src/app/features/logo-quiz/` | Handle `elo_capped` flag — show one-time mastery upsell. |

## Constants

```typescript
const FREE_LOGO_POOL_SIZE = 100; // Number of logos in the free tier pool
```

## What Stays the Same

- Duel matchmaking: FIFO by game_type, no tier segmentation
- DuelProGuard: 1 free duel per day for free users
- Battle Royale: pro-gated with 1 free trial
- `drawLogosForTeamMode()`: always draws from full pool (used by duels + battle-royale)
- Logo quiz ELO system: same K-factors, difficulty brackets, timeout penalties

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Free user's ELO rises above free pool range | ELO capped at cutoff; mastery upsell triggered |
| Free user upgrades to pro mid-session | Next `getQuestion()` call uses full pool; ELO cap lifted |
| Pro user downgrades to free | Next `getQuestion()` restricts to free pool; ELO is NOT reset (may be above cap, will naturally decay) |
| New logos added to pool | Cutoff recalculates on next cache miss (1hr); free pool may shift slightly |
| Fewer than 100 logos in pool | Cutoff = max `question_elo` in pool (all logos are free) |
| Duel with two free users | Full pool — same rule, no special case |
