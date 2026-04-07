# ELO System Redesign

## Summary

Redesign the hardcoded ELO ranges across the entire Stepover codebase into a unified, coherent system with 7 tiers, 4 difficulty levels, and aligned K-factor/bot/minority-scale breakpoints. The goal is a gradual-climb player experience with expanding tier gaps — easy to progress early, elite tiers hard to reach.

## Current Problems

1. **Inconsistent tier definitions** — Frontend has 6 tiers (Iron through Challenger at 0/1000/1200/1400/1600/2000), backend achievements has 6 different tiers (Iron through Diamond at 0/1000/1200/1400/1600/1800). No Platinum in frontend, no Challenger in backend.
2. **MEDIUM difficulty is dead** — `getDifficultyForElo` jumps EASY→HARD at 1200. MEDIUM exists in constants but is never selected.
3. **Misaligned breakpoints** — K-factor (1200/1600), bot skill (900/1100/1400/1600), minority scale (800/1100/1400/1800), and tiers all use different thresholds.
4. **Tiny range below start** — Floor at 100, start at 1000 means 900 points down but unlimited up. Losing streaks feel punishing.
5. **Fast escalation** — Players hit HARD difficulty after just ~6-10 correct EASY answers (1000→1200).

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Player experience curve | Gradual climb | Many tiers, small jumps, always a visible next milestone |
| Number of tiers | 7 | Iron/Bronze/Silver/Gold/Platinum/Diamond/Challenger — proven in competitive games |
| ELO range | 500–2500 | Floor at 500 prevents despair, 2500+ for elite |
| Tier distribution | Expanding gaps | Lower tiers easy to climb, higher tiers require more work |
| Difficulty levels | 4 (EASY/MEDIUM/HARD/EXPERT) | Adds EXPERT for top tiers, reactivates MEDIUM |
| K-factor bands | 4, aligned to difficulty | Coherent system where difficulty and volatility change together |
| Provisional multiplier | Shortened (0-29: 1.5x, 30-99: 1.25x, 100+: 1.0x) | Old 2x on new K=40 would be K=80, too volatile |

## Tier System

| Tier | ELO Range | Width | Color (hex) | Color Name |
|------|-----------|-------|-------------|------------|
| Iron | 500–749 | 250 | `#6b7280` | Gray |
| Bronze | 750–999 | 250 | `#b45309` | Brown |
| Silver | 1000–1299 | 300 | `#94a3b8` | Slate |
| Gold | 1300–1649 | 350 | `#f59e0b` | Amber |
| Platinum | 1650–1999 | 350 | `#06b6d4` | Cyan |
| Diamond | 2000–2399 | 400 | `#a855f7` | Purple |
| Challenger | 2400+ | open | `#e8ff7a` | Yellow |

- **Starting ELO:** 1000 (bottom of Silver)
- **ELO Floor:** 500 (bottom of Iron)
- **No hard ceiling** (Challenger is open-ended)

## Difficulty Zones

| Difficulty | Player ELO Range | Question ELO | Time Limit (seconds) |
|------------|-----------------|--------------|---------------------|
| EASY | 500–899 | 700 | 12 |
| MEDIUM | 900–1299 | 1100 | 15 |
| HARD | 1300–1799 | 1550 | 18 |
| EXPERT | 1800+ | 2100 | 20 |

Question ELOs are set near the midpoint of each zone so the ELO formula produces balanced gains/losses for players in the middle of a bracket.

## K-Factor Bands

| Player ELO | Base K | Feel |
|------------|--------|------|
| 500–899 | 40 | Fast movement, find your level |
| 900–1299 | 32 | Responsive |
| 1300–1799 | 24 | Stabilizing, earned your rank |
| 1800+ | 16 | Precise, elite-level |

## Provisional Multiplier

| Questions Answered | Multiplier | Effective K (EASY zone) |
|-------------------|------------|------------------------|
| 0–29 | 1.5x | 60 |
| 30–99 | 1.25x | 50 |
| 100+ | 1.0x | 40 |

Shortened from the old system (2.0x for 0-49, tapering to 1.0x at 300) because the higher base K-factors already accelerate early placement.

## Bot Skill Mapping

| Player ELO | Bot Skill | Tier |
|------------|-----------|------|
| <750 | 0.20 | Iron |
| 750–999 | 0.30 | Bronze |
| 1000–1299 | 0.40 | Silver |
| 1300–1649 | 0.50 | Gold |
| 1650–1999 | 0.60 | Platinum |
| 2000+ | 0.70 | Diamond/Challenger |

## Minority Scale

| Player ELO | Obscurity Range (1-100) | Difficulty Range (1-100) |
|------------|------------------------|-------------------------|
| <900 | 70–90 (popular teams) | 10–35 |
| 900–1299 | 50–75 | 25–50 |
| 1300–1799 | 30–55 | 45–70 |
| 1800+ | 10–35 (obscure teams) | 65–95 |

## Achievements

| Achievement ID | Threshold | Label |
|---------------|-----------|-------|
| `elo_750` | 750 | Reach Bronze |
| `elo_1000` | 1000 | Reach Silver |
| `elo_1300` | 1300 | Reach Gold |
| `elo_1650` | 1650 | Reach Platinum |
| `elo_2000` | 2000 | Reach Diamond |
| `elo_2400` | 2400 | Reach Challenger |

Replaces the current `elo_1200`, `elo_1400`, `elo_1600`, `elo_1800`, `elo_2000` achievements.

## Files That Change

| File | Changes |
|------|---------|
| `backend/src/solo/elo.service.ts` | K-factor bands (4 tiers), difficulty mapping (4 levels), provisional multiplier (shortened), floor 500 |
| `backend/src/solo/solo.types.ts` | DIFFICULTY_ELO values (700/1100/1550/2100), TIME_LIMITS (12/15/18/20), add EXPERT |
| `backend/src/questions/question.types.ts` | Add `EXPERT` to Difficulty union type |
| `frontend/src/app/core/elo-tier.ts` | New thresholds (500/750/1000/1300/1650/2000/2400), add Platinum tier, update colors |
| `backend/src/achievements/achievements.service.ts` | New tier function, new achievement thresholds, aligned tier names/colors |
| `backend/src/bot/bot.service.ts` | New `targetSkillForElo` breakpoints aligned to tiers |
| `backend/src/questions/diversity/minority-scale.ts` | New breakpoints aligned to difficulty zones |
| `backend/src/logo-quiz/logo-quiz.service.ts` | Floor change (100→500) in `applyChange` if called directly |
| `backend/src/admin/admin-user.service.ts` | Reset ELO stays 1000 (Silver, unchanged) |
| `frontend/src/app/shared/auth-card/auth-card.ts` | Align tier display to new system |
| `supabase/migrations/` | New migration: bump existing players below 500 to 500 |

## What Stays The Same

- ELO formula: standard ELO with 400 denominator
- Timeout penalty: -5
- Separate ELO tracks: solo, logo_quiz, logo_quiz_hardcore, mayhem (each uses same formula)
- Free user ELO capping: unchanged logic, respects new floor
- ELO history tracking: unchanged schema
- Starting ELO: 1000 (default in profiles table, unchanged)
- Admin ELO reset: stays at 1000

## Migration Strategy

1. **New migration** bumps all existing players with ELO < 500 to 500 (across all ELO columns: `elo`, `logo_quiz_elo`, `logo_quiz_hardcore_elo`, `user_mode_stats.current_elo`)
2. **No schema changes** — ELO columns remain integers, no new columns needed
3. **Existing players above 500** — tiers re-label around them naturally
4. **Existing achievements** — players who earned old threshold achievements keep them; new achievement IDs are separate entries
5. **Default ELO (1000) unchanged** — new signups still start at 1000, which is now bottom of Silver instead of bottom of Bronze

## ELO Change Examples

To illustrate how the new system feels in practice:

| Scenario | Player ELO | Question ELO | K | Expected | Correct → Change | Wrong → Change |
|----------|-----------|--------------|---|----------|-------------------|----------------|
| New Iron player, EASY Q | 600 | 700 | 60 (40*1.5) | 0.36 | +38 | -22 |
| Silver player, MEDIUM Q | 1100 | 1100 | 32 | 0.50 | +16 | -16 |
| Gold player, HARD Q | 1500 | 1550 | 24 | 0.43 | +14 | -10 |
| Diamond player, EXPERT Q | 2100 | 2100 | 16 | 0.50 | +8 | -8 |

The system rewards risk proportionally — a Gold player answering HARD questions gains/loses moderately, while a Diamond player in EXPERT moves in small, precise increments.
