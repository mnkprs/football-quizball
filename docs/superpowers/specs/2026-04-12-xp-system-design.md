# XP System Design

**Date:** 2026-04-12
**Status:** Draft
**Author:** Claude + Emmanouil

## Overview

Add an XP (experience points) system as an engagement reward layer on top of the existing ELO skill-based progression. ELO measures skill and can go down; XP measures effort and only goes up. Every action in the app earns XP, players level up over time, and level-up moments provide feel-good celebrations.

**Purpose:** Visual-only engagement metric. No gameplay unlocks, no gating. Level badge + number on profile + level-up animations.

## Architecture

**Approach:** Centralized XpService (synchronous). A single `XpService` that every game mode calls directly after awarding points. Fits the existing pattern where game services call `SupabaseService` methods for stat updates. Synchronous so level-up state is immediately available in API responses for client-side celebrations.

## Database Schema

### profiles table additions

```sql
ALTER TABLE profiles
  ADD COLUMN xp integer NOT NULL DEFAULT 0,
  ADD COLUMN level integer NOT NULL DEFAULT 1;
```

### xp_history table (new)

```sql
CREATE TABLE xp_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) NOT NULL,
  amount integer NOT NULL,
  source text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_xp_history_user ON xp_history(user_id);
```

**Sources:** `correct_answer`, `wrong_answer`, `duel_win`, `br_win`, `solo_complete`, `blitz_complete`, `streak_bonus`, `daily_streak`

**RLS:** `xp_history` own-read only, service role for inserts (same pattern as `elo_history`).

## XP Values

| Activity | XP | Notes |
|---|---|---|
| Correct answer (any mode) | +10 | Base reward |
| Wrong answer (any mode) | +2 | Participation reward |
| Win a Duel | +50 | Bonus on top of per-answer XP |
| Win Battle Royale | +75 | Hardest competitive win |
| Complete Solo session | +20 | Session completion incentive |
| Complete Blitz round | +15 | Finished the 60s challenge |
| Daily login streak (per day) | +25 | Retention hook, awarded once per day on first activity |

### Streak Bonuses

Per-answer bonus while streak is active (on top of base correct answer XP):

| Streak Length | Bonus XP |
|---|---|
| 3 | +5 |
| 5 | +10 |
| 10 | +20 |
| 15+ | +30 (cap) |

Example: correct answer at a 10-streak = 10 (base) + 20 (streak bonus) = 30 XP.

## Leveling Curve

**Formula:** `XP_needed(level) = floor(100 * level^1.5)`

| Level | Total XP | Approx. Effort |
|---|---|---|
| 2 | 100 | ~8 correct answers |
| 5 | 800 | A few sessions |
| 10 | 2,500 | ~1 week regular play |
| 25 | 12,000 | ~1 month active |
| 50 | 40,000 | Dedicated player |
| 100 | 150,000 | Long-term grinder |

No level cap. Early levels come fast for instant gratification; later levels slow down but remain achievable.

## Backend Design

### Module Structure

```
backend/src/xp/
  xp.module.ts        — imports SupabaseModule
  xp.service.ts        — core award logic
  xp.constants.ts      — XP values table & leveling formula
```

### xp.constants.ts

All tunable values in one file:

```typescript
export const XP_VALUES = {
  CORRECT_ANSWER: 10,
  WRONG_ANSWER: 2,
  DUEL_WIN: 50,
  BR_WIN: 75,
  SOLO_COMPLETE: 20,
  BLITZ_COMPLETE: 15,
  DAILY_STREAK: 25,
  STREAK_BONUS: { 3: 5, 5: 10, 10: 20, 15: 30 },
};

export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

export function levelFromXp(totalXp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}
```

### XpService

Single entry point:

```typescript
async award(userId: string, source: string, amount: number, metadata?: object)
  → { xpGained: number, totalXp: number, level: number, leveledUp: boolean, newLevel?: number }
```

Flow:
1. Read current `xp` and `level` from profile
2. Calculate `newXp = currentXp + amount`
3. Calculate `newLevel = levelFromXp(newXp)`
4. Update `profiles` — set `xp = newXp, level = newLevel`
5. Insert row into `xp_history`
6. Return result with `leveledUp: newLevel > oldLevel`

Convenience method for streaks:

```typescript
async awardStreakBonus(userId: string, currentStreak: number, mode: string)
  → XpAwardResult | null
```

Looks up the highest matching streak threshold and awards the bonus. Returns null if streak < 3.

### XpModule

```typescript
@Module({
  imports: [SupabaseModule],
  providers: [XpService],
  exports: [XpService],
})
export class XpModule {}
```

Imported by: SoloModule, DuelModule, BattleRoyaleModule, BlitzModule, MayhemModule, LogoQuizModule.

## Integration Points

XP calls are appended to existing game logic — no changes to game mechanics.

### Solo (solo.service.ts)
- After answer validation: `award(userId, 'correct_answer', 10)` or `award(userId, 'wrong_answer', 2)`
- After correct answer: `awardStreakBonus(userId, currentStreak, 'solo')` if streak >= 3
- On session end: `award(userId, 'solo_complete', 20)`

### Duel (duel.service.ts)
- After answer validation: correct/wrong XP
- Streak bonus on correct answers
- On game end for winner: `award(winnerId, 'duel_win', 50)`

### Battle Royale (battle-royale.service.ts)
- After answer validation: correct/wrong XP + streak bonus
- On last survivor: `award(winnerId, 'br_win', 75)`

### Blitz (blitz.service.ts)
- After answer validation: correct/wrong XP + streak bonus
- On round end: `award(userId, 'blitz_complete', 15)`

### Mayhem (mayhem-session.service.ts)
- After answer validation: correct/wrong XP + streak bonus

### Logo Quiz (logo-quiz.service.ts)
- After answer validation: correct/wrong XP + streak bonus

### Daily Streak
- Awarded once per day on first activity
- Hook into existing `updateDailyStreak()` in `supabase.service.ts`
- When streak is incremented: `award(userId, 'daily_streak', 25)`

### API Response Augmentation
All answer/game-end responses include XP result so the frontend can react immediately:

```json
{
  "correct": true,
  "elo": { ... },
  "xp": {
    "xpGained": 10,
    "totalXp": 1250,
    "level": 7,
    "leveledUp": false,
    "streakBonus": null
  }
}
```

When `leveledUp: true`, include `newLevel` for the celebration screen.

## Frontend Design

### Profile Page (profile.ts)
- XP progress bar: current XP within level → next level threshold
- Level number displayed prominently next to username
- Level badge (reuse tier badge visual pattern)

### Top Nav (top-nav)
- Small level badge/number next to user avatar

### Level-Up Celebration
- Triggered when any API response includes `leveledUp: true`
- Full-screen overlay: level number scales up with glow effect + "Level X!" text
- Auto-dismisses after 2 seconds
- More prominent than achievement toasts

### XP Gain Feedback (in-game)
- Floating "+10 XP" text near answer area on correct/wrong answers
- Streak bonus shows as separate "+20 XP Streak!" in accent color
- Brief animation, does not block gameplay

### No New Routes
XP is surfaced within existing screens. No new pages needed.

## Existing Users Migration

All existing users start with `xp = 0, level = 1` regardless of prior activity. XP is forward-looking — it measures engagement from the point the system goes live.
