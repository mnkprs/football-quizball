# ELO System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all hardcoded ELO ranges into a coherent 7-tier, 4-difficulty system with aligned K-factors, bot skill, and minority scale breakpoints.

**Architecture:** Central constants file for all ELO thresholds. Every consumer (elo.service, bot.service, minority-scale, achievements, frontend tiers) references these constants instead of having independent magic numbers. The Difficulty type gains an EXPERT variant.

**Tech Stack:** NestJS (backend), Angular (frontend), Supabase (migrations), TypeScript throughout.

**Spec:** `docs/superpowers/specs/2026-04-08-elo-system-redesign.md`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `backend/src/common/interfaces/question.interface.ts` | Difficulty type definition | Modify — add `EXPERT` |
| `backend/src/solo/solo.types.ts` | DIFFICULTY_ELO, TIME_LIMITS | Modify — update values, add EXPERT |
| `backend/src/solo/elo.service.ts` | K-factor, difficulty mapping, floor, provisional | Modify — all ranges |
| `backend/src/solo/elo.service.spec.ts` | Tests for ELO service | Create |
| `backend/src/questions/config/points.config.ts` | DIFFICULTY_POINTS | Modify — add EXPERT |
| `backend/src/questions/config/difficulty-prompts.config.ts` | DEFAULT_DIFFICULTY_RANGES, CATEGORY_DIFFICULTY_OVERRIDES | Modify — add EXPERT |
| `backend/src/questions/config/category.config.ts` | CATEGORY_DIFFICULTY_SLOTS | No change (pool seeding uses EASY/MEDIUM/HARD, EXPERT is runtime-only for now) |
| `backend/src/questions/difficulty-scorer.service.ts` | getAllowedDifficulties, resolveDynamicDifficulty | Modify — add EXPERT thresholds |
| `backend/src/questions/config/difficulty-scoring.config.ts` | RAW_THRESHOLD_EXPERT | Modify — add threshold |
| `backend/src/questions/diversity/minority-scale.ts` | minorityScaleForElo, difficultyRangeForElo, minorityScaleForDifficulty | Modify — new breakpoints, add EXPERT |
| `backend/src/bot/bot.service.ts` | targetSkillForElo, DIFFICULTY_MULTIPLIER | Modify — new breakpoints, add EXPERT |
| `backend/src/achievements/achievements.service.ts` | getEloTier, checkAndAward, progressMap | Modify — new thresholds |
| `backend/src/solo/solo-question.generator.ts` | difficultyGuide | Modify — add EXPERT |
| `frontend/src/app/core/elo-tier.ts` | getEloTier, TIER_THRESHOLDS, tierProgress | Modify — new tiers |
| `frontend/src/app/shared/auth-card/auth-card.ts` | tierColor, tierLabel | Modify — new tiers |
| `backend/src/logo-quiz/logo-quiz.service.ts` | applyChange floor reference | No change (uses eloService.applyChange) |
| `supabase/migrations/` | Bump ELO floor for existing players | Create migration |

---

### Task 1: Add EXPERT to Difficulty type

**Files:**
- Modify: `backend/src/common/interfaces/question.interface.ts:14`

- [ ] **Step 1: Update the Difficulty type**

In `backend/src/common/interfaces/question.interface.ts`, change line 14:

```typescript
// Before
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

// After
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
```

- [ ] **Step 2: Verify no TypeScript errors from the type addition**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit 2>&1 | head -30`

Expected: No new errors (adding a union member is backwards-compatible — existing switch/if-else may get incomplete-match warnings, which we'll fix in later tasks).

- [ ] **Step 3: Commit**

```bash
git add backend/src/common/interfaces/question.interface.ts
git commit -m "feat(elo): add EXPERT to Difficulty type"
```

---

### Task 2: Update ELO constants (DIFFICULTY_ELO, TIME_LIMITS, DIFFICULTY_POINTS)

**Files:**
- Modify: `backend/src/solo/solo.types.ts:6-16`
- Modify: `backend/src/questions/config/points.config.ts:6-10`

- [ ] **Step 1: Update DIFFICULTY_ELO and TIME_LIMITS**

In `backend/src/solo/solo.types.ts`, replace lines 6-16:

```typescript
export const DIFFICULTY_ELO: Record<Difficulty, number> = {
  EASY: 700,
  MEDIUM: 1100,
  HARD: 1550,
  EXPERT: 2100,
};

export const TIME_LIMITS: Record<Difficulty, number> = {
  EASY: 12,
  MEDIUM: 15,
  HARD: 18,
  EXPERT: 20,
};
```

- [ ] **Step 2: Update DIFFICULTY_POINTS**

In `backend/src/questions/config/points.config.ts`, replace lines 6-10:

```typescript
export const DIFFICULTY_POINTS: Record<Difficulty, number> = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
  EXPERT: 4,
};
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors (Record<Difficulty, number> now requires all 4 keys, which we've provided).

- [ ] **Step 4: Commit**

```bash
git add backend/src/solo/solo.types.ts backend/src/questions/config/points.config.ts
git commit -m "feat(elo): update difficulty ELO values and add EXPERT tier"
```

---

### Task 3: Rewrite ELO service (K-factors, difficulty mapping, floor, provisional)

**Files:**
- Modify: `backend/src/solo/elo.service.ts` (full rewrite of methods)
- Create: `backend/src/solo/elo.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/solo/elo.service.spec.ts`:

```typescript
import { EloService } from './elo.service';

describe('EloService', () => {
  let service: EloService;

  beforeEach(() => {
    service = new EloService();
  });

  describe('getDifficultyForElo', () => {
    it('returns EASY for ELO below 900', () => {
      expect(service.getDifficultyForElo(500)).toBe('EASY');
      expect(service.getDifficultyForElo(899)).toBe('EASY');
    });

    it('returns MEDIUM for ELO 900-1299', () => {
      expect(service.getDifficultyForElo(900)).toBe('MEDIUM');
      expect(service.getDifficultyForElo(1299)).toBe('MEDIUM');
    });

    it('returns HARD for ELO 1300-1799', () => {
      expect(service.getDifficultyForElo(1300)).toBe('HARD');
      expect(service.getDifficultyForElo(1799)).toBe('HARD');
    });

    it('returns EXPERT for ELO 1800+', () => {
      expect(service.getDifficultyForElo(1800)).toBe('EXPERT');
      expect(service.getDifficultyForElo(2500)).toBe('EXPERT');
    });
  });

  describe('applyChange', () => {
    it('applies positive change', () => {
      expect(service.applyChange(1000, 16)).toBe(1016);
    });

    it('floors at 500', () => {
      expect(service.applyChange(510, -20)).toBe(500);
      expect(service.applyChange(500, -100)).toBe(500);
    });
  });

  describe('getK (via calculate)', () => {
    // Test K-factor indirectly via calculate output magnitude
    it('produces larger changes at low ELO (K=40)', () => {
      const change = service.calculate(600, 'EASY', true, false, 100);
      // K=40, expected ~0.36 for 600 vs 700 question => change ~ +26
      expect(change).toBeGreaterThan(20);
    });

    it('produces smaller changes at high ELO (K=16)', () => {
      const change = service.calculate(2000, 'EXPERT', true, false, 100);
      // K=16, expected ~0.36 for 2000 vs 2100 => change ~ +10
      expect(change).toBeLessThan(15);
    });
  });

  describe('provisional multiplier', () => {
    it('applies 1.5x for < 30 questions', () => {
      const provisionalChange = service.calculate(1000, 'MEDIUM', true, false, 10);
      const settledChange = service.calculate(1000, 'MEDIUM', true, false, 200);
      // provisional should be larger
      expect(provisionalChange).toBeGreaterThan(settledChange);
    });

    it('applies 1.25x for 30-99 questions', () => {
      const midChange = service.calculate(1000, 'MEDIUM', true, false, 50);
      const settledChange = service.calculate(1000, 'MEDIUM', true, false, 200);
      expect(midChange).toBeGreaterThan(settledChange);
    });

    it('applies 1.0x for 100+ questions', () => {
      const a = service.calculate(1000, 'MEDIUM', true, false, 100);
      const b = service.calculate(1000, 'MEDIUM', true, false, 500);
      expect(a).toBe(b);
    });
  });

  describe('timeout penalty', () => {
    it('subtracts 5 on timeout', () => {
      const normal = service.calculate(1000, 'MEDIUM', false, false, 100);
      const timedOut = service.calculate(1000, 'MEDIUM', false, true, 100);
      expect(timedOut).toBe(normal - 5);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx jest --testPathPattern='elo.service.spec' --no-coverage 2>&1 | tail -20`

Expected: Multiple failures (old thresholds don't match new expectations).

- [ ] **Step 3: Rewrite elo.service.ts**

Replace the full content of `backend/src/solo/elo.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Difficulty } from '../questions/question.types';
import { DIFFICULTY_ELO } from './solo.types';

@Injectable()
export class EloService {
  private getProvisionalMultiplier(totalAnswered: number): number {
    if (totalAnswered < 30) return 1.5;
    if (totalAnswered < 100) return 1.25;
    return 1.0;
  }

  private getK(elo: number, totalAnswered: number): number {
    const base = elo < 900 ? 40 : elo < 1300 ? 32 : elo < 1800 ? 24 : 16;
    return Math.round(base * this.getProvisionalMultiplier(totalAnswered));
  }

  calculate(playerElo: number, difficulty: Difficulty, correct: boolean, timedOut: boolean, totalQuestionsAnswered: number): number {
    const questionElo = DIFFICULTY_ELO[difficulty];
    return this.calculateWithQuestionElo(playerElo, questionElo, correct, timedOut, totalQuestionsAnswered);
  }

  calculateWithQuestionElo(playerElo: number, questionElo: number, correct: boolean, timedOut: boolean, totalQuestionsAnswered: number): number {
    const K = this.getK(playerElo, totalQuestionsAnswered);
    const expected = 1 / (1 + Math.pow(10, (questionElo - playerElo) / 400));
    const actual = correct ? 1 : 0;
    let change = Math.round(K * (actual - expected));
    if (timedOut) change -= 5;
    return change;
  }

  applyChange(playerElo: number, change: number): number {
    return Math.max(500, playerElo + change);
  }

  getDifficultyForElo(elo: number): Difficulty {
    if (elo < 900) return 'EASY';
    if (elo < 1300) return 'MEDIUM';
    if (elo < 1800) return 'HARD';
    return 'EXPERT';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx jest --testPathPattern='elo.service.spec' --no-coverage 2>&1 | tail -20`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/solo/elo.service.ts backend/src/solo/elo.service.spec.ts
git commit -m "feat(elo): rewrite ELO service with new K-factors, difficulty zones, floor=500"
```

---

### Task 4: Update difficulty scorer for EXPERT

**Files:**
- Modify: `backend/src/questions/config/difficulty-scoring.config.ts:24-28`
- Modify: `backend/src/questions/difficulty-scorer.service.ts:91-130`
- Modify: `backend/src/questions/config/difficulty-prompts.config.ts:21-37`

- [ ] **Step 1: Add RAW_THRESHOLD_EXPERT to scoring config**

In `backend/src/questions/config/difficulty-scoring.config.ts`, after line 27 (`RAW_THRESHOLD_MEDIUM`), add:

```typescript
/** Raw score above this → EXPERT (hardest tier) */
export const RAW_THRESHOLD_EXPERT = 0.62;
```

Also update `REJECTED_RESULT_DIFFICULTY` on line 151 — it should remain `'HARD'` (not EXPERT, rejected questions are hard but not elite):

```typescript
/** Difficulty returned when question is rejected. */
export const REJECTED_RESULT_DIFFICULTY = 'HARD' as const;
```

No change needed for rejected result — already correct.

- [ ] **Step 2: Update DEFAULT_DIFFICULTY_RANGES in difficulty-prompts.config.ts**

In `backend/src/questions/config/difficulty-prompts.config.ts`, replace lines 21-37:

```typescript
export const DEFAULT_DIFFICULTY_RANGES: Record<Difficulty, DifficultyScoreRanges> = {
  EASY: {
    fame_score: [7, 9],
    specificity_score: [2, 3],
    combinational_thinking_score: [2, 4],
  },
  MEDIUM: {
    fame_score: [6, 8],
    specificity_score: [2, 4],
    combinational_thinking_score: [2, 5],
  },
  HARD: {
    fame_score: [5, 7],
    specificity_score: [4, 5],
    combinational_thinking_score: [5, 10],
  },
  EXPERT: {
    fame_score: [2, 4],
    specificity_score: [5, 5],
    combinational_thinking_score: [7, 10],
  },
};
```

- [ ] **Step 3: Update resolveDynamicDifficulty and getAllowedDifficulties**

In `backend/src/questions/difficulty-scorer.service.ts`, add the import for the new threshold:

```typescript
// Add to the import block from difficulty-scoring.config (around line 56)
import {
  // ... existing imports ...
  RAW_THRESHOLD_EXPERT,
} from './config/difficulty-scoring.config';
```

Then update `resolveDynamicDifficulty` (lines 125-130):

```typescript
function resolveDynamicDifficulty(raw: number, tier: number, category: QuestionCategory, t: ScoreThresholds): Difficulty {
  if (raw < t.rawThresholdEasy) return 'EASY';
  if (raw < t.rawThresholdMedium) return 'MEDIUM';
  if (tier > TIER_DOWNGRADE_THRESHOLD && category !== 'GUESS_SCORE') return 'MEDIUM';
  if (raw < RAW_THRESHOLD_EXPERT) return 'HARD';
  return 'EXPERT';
}
```

Update `getAllowedDifficulties` (lines 95-112):

```typescript
function getAllowedDifficulties(raw: number, primaryDifficulty: Difficulty, t: ScoreThresholds): Difficulty[] {
  const allowed: Difficulty[] = [primaryDifficulty];
  if (primaryDifficulty === 'EASY') return allowed;
  if (raw < t.rawThresholdEasy) {
    allowed.unshift('EASY');
    return allowed;
  }
  if (primaryDifficulty === 'MEDIUM') {
    if (raw < t.rawThresholdEasy + t.boundaryTolerance) allowed.unshift('EASY');
    if (raw >= t.rawThresholdMedium - t.boundaryTolerance) allowed.push('HARD');
    return allowed;
  }
  if (primaryDifficulty === 'HARD') {
    if (raw < t.rawThresholdMedium + t.boundaryTolerance) allowed.unshift('MEDIUM');
    if (raw >= RAW_THRESHOLD_EXPERT - t.boundaryTolerance) allowed.push('EXPERT');
    return allowed;
  }
  if (primaryDifficulty === 'EXPERT') {
    if (raw < RAW_THRESHOLD_EXPERT + t.boundaryTolerance) allowed.unshift('HARD');
    return allowed;
  }
  return allowed;
}
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/questions/config/difficulty-scoring.config.ts backend/src/questions/config/difficulty-prompts.config.ts backend/src/questions/difficulty-scorer.service.ts
git commit -m "feat(elo): add EXPERT difficulty to scorer and prompt config"
```

---

### Task 5: Update minority scale and bot service

**Files:**
- Modify: `backend/src/questions/diversity/minority-scale.ts` (full file)
- Modify: `backend/src/bot/bot.service.ts:22-35`

- [ ] **Step 1: Rewrite minority-scale.ts**

Replace the full content of `backend/src/questions/diversity/minority-scale.ts`:

```typescript
import type { Difficulty } from '../../common/interfaces/question.interface';

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Maps a target difficulty to a minority scale range (1–100).
 * Scale: 1 = extremely obscure, 100 = universally famous.
 */
export function minorityScaleForDifficulty(difficulty: Difficulty): number {
  switch (difficulty) {
    case 'EASY': return randomInRange(70, 95);
    case 'MEDIUM': return randomInRange(45, 65);
    case 'HARD': return randomInRange(25, 45);
    case 'EXPERT': return randomInRange(10, 30);
  }
}

/**
 * Maps a player ELO to a minority scale. Higher ELO → more obscure entities.
 */
export function minorityScaleForElo(elo: number): number {
  const bands = [
    { max: 900, range: [70, 90] as const },
    { max: 1300, range: [50, 75] as const },
    { max: 1800, range: [30, 55] as const },
  ];
  const band = bands.find((entry) => elo < entry.max);
  const [min, max] = band?.range ?? [10, 35];
  return randomInRange(min, max);
}

/**
 * Maps a player ELO to the difficulty_score range for blitz question selection.
 */
export function difficultyRangeForElo(elo: number): { min: number; max: number } {
  if (elo < 900) return { min: 10, max: 35 };
  if (elo < 1300) return { min: 25, max: 50 };
  if (elo < 1800) return { min: 45, max: 70 };
  return { min: 65, max: 95 };
}
```

- [ ] **Step 2: Update bot.service.ts DIFFICULTY_MULTIPLIER and targetSkillForElo**

In `backend/src/bot/bot.service.ts`, replace lines 22-35:

```typescript
/** Difficulty multipliers for answer accuracy. */
const DIFFICULTY_MULTIPLIER: Record<string, number> = {
  EASY:   1.2,
  MEDIUM: 1.0,
  HARD:   0.8,
  EXPERT: 0.65,
};

/** Skill thresholds by player ELO — aligned to tier system. */
function targetSkillForElo(playerElo: number): number {
  if (playerElo < 750)  return 0.20;  // Iron
  if (playerElo < 1000) return 0.30;  // Bronze
  if (playerElo < 1300) return 0.40;  // Silver
  if (playerElo < 1650) return 0.50;  // Gold
  if (playerElo < 2000) return 0.60;  // Platinum
  return 0.70;                         // Diamond/Challenger
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/questions/diversity/minority-scale.ts backend/src/bot/bot.service.ts
git commit -m "feat(elo): align minority scale and bot skill to new ELO tiers"
```

---

### Task 6: Update solo question generator (EXPERT difficulty guide)

**Files:**
- Modify: `backend/src/solo/solo-question.generator.ts:44-48`

- [ ] **Step 1: Add EXPERT to difficultyGuide**

In `backend/src/solo/solo-question.generator.ts`, replace lines 44-48:

```typescript
    const difficultyGuide: Record<Difficulty, string> = {
      EASY: 'well-known fact, easily recalled (e.g., which club did Messi win the 2015 Champions League with?)',
      MEDIUM: 'moderate difficulty, requires real football knowledge (e.g., year of a specific title win, top scorer in a specific season)',
      HARD: 'highly specific, niche fact only a true enthusiast would know (e.g., exact transfer fee, squad number in a specific year, obscure stat)',
      EXPERT: 'extremely niche, elite-level football trivia that only the most dedicated fans would know (e.g., specific substitute appearance minutes, youth academy transfer details, obscure continental cup records)',
    };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/solo/solo-question.generator.ts
git commit -m "feat(elo): add EXPERT difficulty guide for LLM fallback generation"
```

---

### Task 7: Update achievements service

**Files:**
- Modify: `backend/src/achievements/achievements.service.ts:25-32, 86-102, 172-193`

- [ ] **Step 1: Update getEloTier function**

In `backend/src/achievements/achievements.service.ts`, replace lines 25-32:

```typescript
export function getEloTier(elo: number): { tier: string; color: string; label: string } {
  if (elo >= 2400) return { tier: 'challenger', color: '#e8ff7a', label: 'Challenger' };
  if (elo >= 2000) return { tier: 'diamond', color: '#a855f7', label: 'Diamond' };
  if (elo >= 1650) return { tier: 'platinum', color: '#06b6d4', label: 'Platinum' };
  if (elo >= 1300) return { tier: 'gold', color: '#f59e0b', label: 'Gold' };
  if (elo >= 1000) return { tier: 'silver', color: '#94a3b8', label: 'Silver' };
  if (elo >= 750) return { tier: 'bronze', color: '#b45309', label: 'Bronze' };
  return { tier: 'iron', color: '#6b7280', label: 'Iron' };
}
```

- [ ] **Step 2: Update progressMap ELO keys**

In `backend/src/achievements/achievements.service.ts`, replace the ELO entries in progressMap (lines 98-102):

```typescript
      elo_750: profile.elo,
      elo_1000: profile.elo,
      elo_1300: profile.elo,
      elo_1650: profile.elo,
      elo_2000: profile.elo,
      elo_2400: profile.elo,
```

Also keep the old keys so existing achievements still show progress:

```typescript
      elo_1200: profile.elo,
      elo_1400: profile.elo,
      elo_1600: profile.elo,
      elo_1800: profile.elo,
```

- [ ] **Step 3: Update checkAndAward ELO thresholds**

In `backend/src/achievements/achievements.service.ts`, replace lines 172-176 and 193:

```typescript
    // ELO rank thresholds (new tier system)
    check('elo_750', (ctx.currentElo ?? 0) >= 750);
    check('elo_1000', (ctx.currentElo ?? 0) >= 1000);
    check('elo_1300', (ctx.currentElo ?? 0) >= 1300);
    check('elo_1650', (ctx.currentElo ?? 0) >= 1650);
    check('elo_2000', (ctx.currentElo ?? 0) >= 2000);
    check('elo_2400', (ctx.currentElo ?? 0) >= 2400);

    // Legacy thresholds — still award if reached (backwards compat)
    check('elo_1200', (ctx.currentElo ?? 0) >= 1200);
    check('elo_1400', (ctx.currentElo ?? 0) >= 1400);
    check('elo_1600', (ctx.currentElo ?? 0) >= 1600);
    check('elo_1800', (ctx.currentElo ?? 0) >= 1800);
```

Remove the standalone `elo_2000` check on line 193 (it's now in the block above).

- [ ] **Step 4: Verify build**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/achievements/achievements.service.ts
git commit -m "feat(elo): update achievements to new 7-tier ELO thresholds"
```

---

### Task 8: Update frontend tier system

**Files:**
- Modify: `frontend/src/app/core/elo-tier.ts` (full rewrite)
- Modify: `frontend/src/app/shared/auth-card/auth-card.ts:37-55`

- [ ] **Step 1: Rewrite elo-tier.ts**

Replace the full content of `frontend/src/app/core/elo-tier.ts`:

```typescript
export interface EloTier {
  tier: 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'challenger';
  label: string;
  color: string;
  /** Hex color used for glow/shadow */
  glow: string;
  /** Border width in px — increases with rank */
  borderWidth: number;
}

export function getEloTier(elo: number): EloTier {
  if (elo >= 2400) return { tier: 'challenger', label: 'Challenger', color: '#e8ff7a', glow: '#e8ff7a', borderWidth: 5 };
  if (elo >= 2000) return { tier: 'diamond',    label: 'Diamond',    color: '#a855f7', glow: '#a855f7', borderWidth: 4 };
  if (elo >= 1650) return { tier: 'platinum',   label: 'Platinum',   color: '#06b6d4', glow: '#06b6d4', borderWidth: 4 };
  if (elo >= 1300) return { tier: 'gold',       label: 'Gold',       color: '#f59e0b', glow: '#f59e0b', borderWidth: 3 };
  if (elo >= 1000) return { tier: 'silver',     label: 'Silver',     color: '#94a3b8', glow: '#94a3b8', borderWidth: 2 };
  if (elo >= 750)  return { tier: 'bronze',     label: 'Bronze',     color: '#b45309', glow: '#b45309', borderWidth: 2 };
  return                   { tier: 'iron',       label: 'Iron',       color: '#6b7280', glow: '#6b7280', borderWidth: 2 };
}

const TIER_THRESHOLDS = [500, 750, 1000, 1300, 1650, 2000, 2400];

export function nextTierThreshold(elo: number): number | null {
  for (const t of TIER_THRESHOLDS) {
    if (elo < t) return t;
  }
  return null; // Challenger — no next tier
}

export function tierProgress(elo: number): number {
  const next = nextTierThreshold(elo);
  if (next === null) return 100; // Challenger — full bar
  const floor = [...TIER_THRESHOLDS].reverse().find(t => t <= elo) ?? 500;
  if (next === floor) return 0;
  return Math.min(100, Math.max(0, ((elo - floor) / (next - floor)) * 100));
}
```

- [ ] **Step 2: Update auth-card.ts tier computation**

In `frontend/src/app/shared/auth-card/auth-card.ts`, replace lines 37-55:

```typescript
  tierColor = computed(() => {
    const elo = this.elo();
    if (elo >= 2400) return '#e8ff7a';
    if (elo >= 2000) return '#a855f7';
    if (elo >= 1650) return '#06b6d4';
    if (elo >= 1300) return '#f59e0b';
    if (elo >= 1000) return '#94a3b8';
    if (elo >= 750)  return '#b45309';
    return '#6b7280';
  });

  tierLabel = computed(() => {
    const elo = this.elo();
    if (elo >= 2400) return 'Challenger';
    if (elo >= 2000) return 'Diamond';
    if (elo >= 1650) return 'Platinum';
    if (elo >= 1300) return 'Gold';
    if (elo >= 1000) return 'Silver';
    if (elo >= 750)  return 'Bronze';
    return 'Iron';
  });
```

- [ ] **Step 3: Verify frontend build**

Run: `cd /Users/instashop/Projects/football-quizball/frontend && npx ng build 2>&1 | tail -10`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/core/elo-tier.ts frontend/src/app/shared/auth-card/auth-card.ts
git commit -m "feat(elo): update frontend to 7-tier system with Platinum"
```

---

### Task 9: Fix remaining TypeScript errors (exhaustive switches/Records)

**Files:**
- Potentially multiple files where `Record<Difficulty, ...>` or `switch(difficulty)` exist

- [ ] **Step 1: Find all incomplete Difficulty records and switches**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit 2>&1`

Look for errors about missing `EXPERT` property or non-exhaustive switch/if.

- [ ] **Step 2: Fix each error**

Common patterns to fix:

- `Record<Difficulty, ...>` — add EXPERT key
- `switch (difficulty)` — add `case 'EXPERT':` 
- `if/else` chains on difficulty — add EXPERT branch

For `CATEGORY_DIFFICULTY_OVERRIDES` in `difficulty-prompts.config.ts`, add EXPERT overrides for categories that have HARD overrides (copy HARD config and intensify):

```typescript
// Inside each category that has HARD overrides, add EXPERT:
EXPERT: {
  fame_score: [1, 3],
  specificity_score: [5, 5],
  combinational_thinking_score: [8, 10],
  extraInstructions: 'Ultra-niche — obscure records, forgotten players, stats only a dedicated fan would recall.',
},
```

For `pool-seed.service.ts` where `addedTotals` is `Record<Difficulty, number>`:

```typescript
const addedTotals: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0, EXPERT: 0 };
```

- [ ] **Step 3: Verify clean build**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "fix(elo): resolve all EXPERT exhaustiveness errors across codebase"
```

---

### Task 10: Create Supabase migration for ELO floor bump

**Files:**
- Create: `supabase/migrations/20260408100000_bump_elo_floor.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260408100000_bump_elo_floor.sql`:

```sql
-- Bump ELO floor from 100 to 500 for all existing players
-- New tier system: Iron starts at 500, no player should be below floor

-- Solo ELO
UPDATE profiles SET elo = 500 WHERE elo < 500;

-- Logo quiz ELO
UPDATE profiles SET logo_quiz_elo = 500 WHERE logo_quiz_elo < 500;

-- Hardcore logo quiz ELO
UPDATE profiles SET logo_quiz_hardcore_elo = 500 WHERE logo_quiz_hardcore_elo < 500;

-- Mode stats (mayhem etc)
UPDATE user_mode_stats SET current_elo = 500 WHERE current_elo < 500;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260408100000_bump_elo_floor.sql
git commit -m "feat(elo): add migration to bump ELO floor from 100 to 500"
```

---

### Task 11: Create Supabase migration for new achievement rows

**Files:**
- Create: `supabase/migrations/20260408100001_add_new_elo_achievements.sql`

- [ ] **Step 1: Check existing achievements table schema**

Run: `cd /Users/instashop/Projects/football-quizball && grep -r 'create table.*achievements' supabase/migrations/ | head -5`

Then read the relevant migration to understand the schema.

- [ ] **Step 2: Write the achievement rows migration**

Create `supabase/migrations/20260408100001_add_new_elo_achievements.sql`:

```sql
-- Add new ELO tier achievements (750, 1300, 1650, 2400)
-- Existing achievements (1200, 1400, 1600, 1800, 2000) are kept for backwards compat

INSERT INTO achievements (id, name, description, icon, category, target)
VALUES
  ('elo_750',  'Bronze League',     'Reach Bronze tier (750 ELO)',     '🥉', 'rank', 750),
  ('elo_1000', 'Silver League',     'Reach Silver tier (1000 ELO)',    '🥈', 'rank', 1000),
  ('elo_1300', 'Gold League',       'Reach Gold tier (1300 ELO)',      '🥇', 'rank', 1300),
  ('elo_1650', 'Platinum League',   'Reach Platinum tier (1650 ELO)',  '💎', 'rank', 1650),
  ('elo_2400', 'Challenger League', 'Reach Challenger tier (2400 ELO)','🏆', 'rank', 2400)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target = EXCLUDED.target;

-- Update existing achievements to match new tier names
UPDATE achievements SET name = 'Silver League', description = 'Reach 1200 ELO', target = 1200 WHERE id = 'elo_1200';
UPDATE achievements SET name = 'Gold Contender', description = 'Reach 1400 ELO', target = 1400 WHERE id = 'elo_1400';
UPDATE achievements SET name = 'Platinum Contender', description = 'Reach 1600 ELO', target = 1600 WHERE id = 'elo_1600';
UPDATE achievements SET name = 'Diamond Contender', description = 'Reach 1800 ELO', target = 1800 WHERE id = 'elo_1800';
UPDATE achievements SET name = 'Diamond League', description = 'Reach 2000 ELO', target = 2000 WHERE id = 'elo_2000';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260408100001_add_new_elo_achievements.sql
git commit -m "feat(elo): add new tier achievement rows and update existing labels"
```

---

### Task 12: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run backend tests**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx jest --no-coverage 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 2: Run backend build**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit 2>&1`

Expected: No errors.

- [ ] **Step 3: Run frontend build**

Run: `cd /Users/instashop/Projects/football-quizball/frontend && npx ng build 2>&1 | tail -10`

Expected: Build succeeds.

- [ ] **Step 4: Verify ELO service tests specifically**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx jest --testPathPattern='elo.service.spec' --verbose 2>&1`

Expected: All 9 tests pass with descriptions matching spec thresholds.
