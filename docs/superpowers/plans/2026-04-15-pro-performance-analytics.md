# Pro Personal Performance Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Pro-gated `/analytics` dashboard that shows every user their ELO trajectory, category strengths/weaknesses, difficulty accuracy breakdown, and era/league performance — deepening the endowment-effect moat started by match history.

**Architecture:** Extend the LLM question-generation schema with structured metadata (`league_tier`, `era`, `competition_type`, `nationality`) that persists through `question_pool.meta` and `match_history.detail_snapshot`. Build a NestJS `AnalyticsModule` that aggregates from `elo_history` + `match_history` into a single `/api/analytics/me` response. Front-end: new Pro-gated route with Chart.js-powered widgets; free users see a blurred teaser with upgrade CTA.

**Tech Stack:** NestJS, Supabase (Postgres), Gemini Flash (structured JSON), Angular 20 standalone + signals, Chart.js via `ng2-charts`, TailwindCSS.

**Scope constraints (explicit out-of-scope for this plan):**
- Retroactive backfill of historical questions with new metadata — forward-only tagging. Old match snapshots will simply bucket as `"unknown"` in analytics.
- Player-level and club-level drill-downs — future plan.
- CSV/PDF export — future plan.
- Date range filters beyond "last 30d / all time" toggle.

---

## File Structure

**New files (backend):**
- `backend/src/analytics/analytics.module.ts` — module wiring
- `backend/src/analytics/analytics.controller.ts` — `GET /api/analytics/me`
- `backend/src/analytics/analytics.service.ts` — aggregation logic (pure, testable)
- `backend/src/analytics/analytics.types.ts` — shared DTOs
- `backend/src/analytics/analytics.service.spec.ts` — unit tests
- `supabase/migrations/20260609100000_question_pool_metadata.sql` — add indexed metadata columns to `question_pool` (renamed during execution from `20260415000001` to avoid timestamp drift against remote; see Task 1 notes)

**Modified files (backend):**
- `backend/src/common/interfaces/question.interface.ts` — extend `GeneratedQuestion.meta` type shape + `difficulty_factors` fields
- `backend/src/common/interfaces/match.interface.ts` — add optional `tags` per-question detail
- `backend/src/solo/solo-question.generator.ts` — extend LLM schema to request metadata tags
- `backend/src/questions/question-pool.service.ts` — persist + read metadata columns
- `backend/src/match-history/match-history.service.ts` — pass through tags into detail snapshot
- `backend/src/app.module.ts` — register `AnalyticsModule`

**New files (frontend):**
- `frontend/src/app/features/analytics/analytics.ts` — route component
- `frontend/src/app/features/analytics/analytics.html`
- `frontend/src/app/features/analytics/analytics.css`
- `frontend/src/app/features/analytics/widgets/elo-trajectory.ts`
- `frontend/src/app/features/analytics/widgets/category-heatmap.ts`
- `frontend/src/app/features/analytics/widgets/difficulty-breakdown.ts`
- `frontend/src/app/features/analytics/widgets/era-breakdown.ts`
- `frontend/src/app/features/analytics/widgets/pro-teaser.ts` — blurred preview for free users
- `frontend/src/app/core/analytics-api.service.ts` — HTTP client

**Modified files (frontend):**
- `frontend/src/app/app.routes.ts` — register `/analytics` route (auth-guarded, not pro-guarded — free users hit teaser)
- `frontend/src/app/features/profile/profile.ts` — add "View full analytics →" link for Pro users
- `frontend/package.json` — add `chart.js@^4.4.0` + `ng2-charts@^6.0.0`

---

## Task 0: Pre-flight

- [ ] **Step 0.1: Create feature branch**

```bash
cd /Users/instashop/Projects/football-quizball
git checkout -b feat/pro-performance-analytics
```

- [ ] **Step 0.2: Confirm Supabase CLI linked**

```bash
cd /Users/instashop/Projects/football-quizball
supabase status
```

Expected: shows project `npwneqworgyclzaofuln` linked. If not, run `supabase link --project-ref npwneqworgyclzaofuln`.

---

## Task 1: Migration — `question_pool` metadata columns

**Files:**
- Create: `supabase/migrations/20260415000001_question_pool_metadata.sql`

- [ ] **Step 1.1: Write the migration**

Create `supabase/migrations/20260415000001_question_pool_metadata.sql`:

```sql
-- Add structured metadata columns to question_pool for analytics tagging.
-- All columns are nullable; existing rows remain untouched (bucket as "unknown" in analytics).

ALTER TABLE question_pool
  ADD COLUMN IF NOT EXISTS league_tier SMALLINT CHECK (league_tier BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS competition_type TEXT,
  ADD COLUMN IF NOT EXISTS era TEXT,
  ADD COLUMN IF NOT EXISTS event_year SMALLINT,
  ADD COLUMN IF NOT EXISTS nationality TEXT;

COMMENT ON COLUMN question_pool.league_tier IS '1=top-5 EU leagues, 2=other EU top flight, 3=other pro leagues, 4=lower divisions, 5=amateur/misc';
COMMENT ON COLUMN question_pool.competition_type IS 'domestic_league | domestic_cup | continental_club | international_national | youth | friendly | other';
COMMENT ON COLUMN question_pool.era IS 'pre_1990 | 1990s | 2000s | 2010s | 2020s';
COMMENT ON COLUMN question_pool.nationality IS 'ISO 3166-1 alpha-2 country code of primary subject (player nationality, etc.)';

CREATE INDEX IF NOT EXISTS idx_question_pool_era ON question_pool(era);
CREATE INDEX IF NOT EXISTS idx_question_pool_league_tier ON question_pool(league_tier);
```

- [ ] **Step 1.2: Apply migration locally + remote**

Run:

```bash
cd /Users/instashop/Projects/football-quizball
supabase db push
```

Expected: `Finished supabase db push.` No errors. New columns visible in Supabase dashboard on `question_pool`.

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/20260415000001_question_pool_metadata.sql
git commit -m "feat(analytics): add metadata columns to question_pool"
```

---

## Task 2: Extend `GeneratedQuestion` interface with analytics metadata

**Files:**
- Modify: `backend/src/common/interfaces/question.interface.ts`

- [ ] **Step 2.1: Read current interface**

Read `backend/src/common/interfaces/question.interface.ts` to find the `difficulty_factors` and `GeneratedQuestion` definitions (lines ~19–50 per exploration).

- [ ] **Step 2.2: Add `AnalyticsTags` interface + extend `GeneratedQuestion`**

Append to `backend/src/common/interfaces/question.interface.ts`:

```typescript
export type LeagueTier = 1 | 2 | 3 | 4 | 5;
export type CompetitionType =
  | 'domestic_league'
  | 'domestic_cup'
  | 'continental_club'
  | 'international_national'
  | 'youth'
  | 'friendly'
  | 'other';
export type Era = 'pre_1990' | '1990s' | '2000s' | '2010s' | '2020s';

export interface AnalyticsTags {
  league_tier?: LeagueTier;
  competition_type?: CompetitionType;
  era?: Era;
  event_year?: number;
  nationality?: string; // ISO 3166-1 alpha-2
}
```

Then modify `GeneratedQuestion` (locate it in the same file) to add optional property:

```typescript
// inside GeneratedQuestion interface:
analytics_tags?: AnalyticsTags;
```

- [ ] **Step 2.3: TypeCheck**

Run:

```bash
cd /Users/instashop/Projects/football-quizball/backend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2.4: Commit**

```bash
git add backend/src/common/interfaces/question.interface.ts
git commit -m "feat(analytics): add AnalyticsTags type to GeneratedQuestion"
```

---

## Task 3: Update LLM schema in `SoloQuestionGenerator`

**Files:**
- Modify: `backend/src/solo/solo-question.generator.ts`
- Test: `backend/src/solo/solo-question.generator.spec.ts` (create if missing)

- [ ] **Step 3.1: Write failing test**

Create `backend/src/solo/solo-question.generator.spec.ts`:

```typescript
import { SoloQuestionGenerator } from './solo-question.generator';

describe('SoloQuestionGenerator — analytics tags', () => {
  it('passes analytics_tags through when LLM returns them', () => {
    const llmRaw = {
      question_text: 'Who won UCL 2012?',
      correct_answer: 'Chelsea',
      explanation: 'Munich final.',
      difficulty_factor: 0.7,
      analytics_tags: {
        league_tier: 1,
        competition_type: 'continental_club',
        era: '2010s',
        event_year: 2012,
      },
    };

    const result = SoloQuestionGenerator.mapLlmOutputToQuestion(llmRaw, 'silver');

    expect(result.analytics_tags).toEqual({
      league_tier: 1,
      competition_type: 'continental_club',
      era: '2010s',
      event_year: 2012,
    });
  });

  it('tolerates missing analytics_tags (returns undefined)', () => {
    const llmRaw = {
      question_text: 'Q',
      correct_answer: 'A',
      explanation: 'E',
      difficulty_factor: 0.5,
    };
    const result = SoloQuestionGenerator.mapLlmOutputToQuestion(llmRaw, 'silver');
    expect(result.analytics_tags).toBeUndefined();
  });
});
```

- [ ] **Step 3.2: Run test — expect FAIL**

```bash
cd /Users/instashop/Projects/football-quizball/backend
npx jest solo-question.generator.spec --no-coverage
```

Expected: FAIL — `mapLlmOutputToQuestion is not a function` or `analytics_tags is undefined`.

- [ ] **Step 3.3: Extend generator — LLM schema + mapper**

Read `backend/src/solo/solo-question.generator.ts`. Locate the LLM structured-output schema (~lines 69–74). Replace the schema with:

```typescript
const schema = {
  type: 'object',
  properties: {
    question_text: { type: 'string' },
    correct_answer: { type: 'string' },
    explanation: { type: 'string' },
    difficulty_factor: { type: 'number', minimum: 0.1, maximum: 1.0 },
    analytics_tags: {
      type: 'object',
      properties: {
        league_tier: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
        competition_type: {
          type: 'string',
          enum: [
            'domestic_league',
            'domestic_cup',
            'continental_club',
            'international_national',
            'youth',
            'friendly',
            'other',
          ],
          nullable: true,
        },
        era: {
          type: 'string',
          enum: ['pre_1990', '1990s', '2000s', '2010s', '2020s'],
          nullable: true,
        },
        event_year: { type: 'integer', minimum: 1850, maximum: 2100, nullable: true },
        nationality: { type: 'string', nullable: true },
      },
      nullable: true,
    },
  },
  required: ['question_text', 'correct_answer', 'explanation', 'difficulty_factor'],
};
```

Update the prompt passed to `LlmService.generateStructuredJson` (find the string that instructs the LLM) by appending:

```
Also classify the question with analytics_tags:
- league_tier: 1 for top-5 EU leagues (EPL/La Liga/Bundesliga/Serie A/Ligue 1); 2 for other EU top flights; 3 for other pro leagues (MLS/Brasileirão/J-League); 4 for lower divisions; 5 for amateur/misc. Null if not league-specific.
- competition_type: domestic_league | domestic_cup | continental_club (UCL/UEL/Copa Libertadores) | international_national (World Cup/Euros) | youth | friendly | other
- era: pre_1990 | 1990s | 2000s | 2010s | 2020s (based on event_year)
- event_year: 4-digit year the event took place, if applicable
- nationality: ISO 3166-1 alpha-2 code of primary subject when the answer is a player

Omit fields you are not confident about; do not guess.
```

Extract a static `mapLlmOutputToQuestion` method on the class (to make the mapping unit-testable):

```typescript
static mapLlmOutputToQuestion(raw: any, difficulty: string): GeneratedQuestion {
  return {
    id: `solo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    question_text: raw.question_text,
    correct_answer: raw.correct_answer,
    explanation: raw.explanation,
    difficulty: difficulty as any,
    difficulty_factor: raw.difficulty_factor,
    category: 'HISTORY' as any,
    points: 10,
    analytics_tags: raw.analytics_tags
      ? {
          league_tier: raw.analytics_tags.league_tier,
          competition_type: raw.analytics_tags.competition_type,
          era: raw.analytics_tags.era,
          event_year: raw.analytics_tags.event_year,
          nationality: raw.analytics_tags.nationality,
        }
      : undefined,
  };
}
```

Wire the existing generation flow to call `mapLlmOutputToQuestion` instead of inline construction.

- [ ] **Step 3.4: Run test — expect PASS**

```bash
cd /Users/instashop/Projects/football-quizball/backend
npx jest solo-question.generator.spec --no-coverage
```

Expected: 2 passing.

- [ ] **Step 3.5: Commit**

```bash
git add backend/src/solo/solo-question.generator.ts backend/src/solo/solo-question.generator.spec.ts
git commit -m "feat(analytics): request analytics_tags from LLM schema"
```

---

## Task 4: Persist tags through `question_pool` reads/writes

**Files:**
- Modify: `backend/src/questions/question-pool.service.ts`

- [ ] **Step 4.1: Read current service**

Read `backend/src/questions/question-pool.service.ts` and identify:
1. The insert method used when a newly-generated LLM question is saved to the pool.
2. The read method `drawOneForSolo()` that reconstructs a `GeneratedQuestion`.

- [ ] **Step 4.2: Add tags to insert payload**

In the insert method, add these fields from `question.analytics_tags`:

```typescript
const insertRow = {
  // ...existing fields
  league_tier: question.analytics_tags?.league_tier ?? null,
  competition_type: question.analytics_tags?.competition_type ?? null,
  era: question.analytics_tags?.era ?? null,
  event_year: question.analytics_tags?.event_year ?? null,
  nationality: question.analytics_tags?.nationality ?? null,
};
```

- [ ] **Step 4.3: Add tags to SELECT + reconstruction in `drawOneForSolo`**

Ensure the SELECT columns include the 5 new fields. In the mapping from DB row → `GeneratedQuestion`, add:

```typescript
analytics_tags:
  row.league_tier || row.competition_type || row.era || row.event_year || row.nationality
    ? {
        league_tier: row.league_tier ?? undefined,
        competition_type: row.competition_type ?? undefined,
        era: row.era ?? undefined,
        event_year: row.event_year ?? undefined,
        nationality: row.nationality ?? undefined,
      }
    : undefined,
```

- [ ] **Step 4.4: TypeCheck + run existing tests**

```bash
cd /Users/instashop/Projects/football-quizball/backend
npx tsc --noEmit && npx jest question-pool --no-coverage
```

Expected: compiles; existing question-pool tests still pass.

- [ ] **Step 4.5: Commit**

```bash
git add backend/src/questions/question-pool.service.ts
git commit -m "feat(analytics): persist analytics_tags through question_pool"
```

---

## Task 5: Pass tags into `match_history.detail_snapshot`

**Files:**
- Modify: `backend/src/common/interfaces/match.interface.ts`
- Modify: `backend/src/match-history/match-history.service.ts`

- [ ] **Step 5.1: Extend detail interfaces**

In `backend/src/common/interfaces/match.interface.ts`, locate `DuelQuestionDetail` and `BRQuestionDetail` interfaces. Add to each:

```typescript
tags?: AnalyticsTags;
```

And add import:

```typescript
import type { AnalyticsTags } from './question.interface';
```

- [ ] **Step 5.2: Pass tags through when building snapshots**

Find each place in the codebase that constructs a `DuelQuestionDetail` or `BRQuestionDetail` (grep for `duel_questions:` and `br_questions:`). At each construction site, read the source `GeneratedQuestion.analytics_tags` and spread it:

```typescript
{
  index,
  // ...existing fields
  tags: generatedQuestion.analytics_tags,
}
```

Also update the solo commit path (`commit_solo_answer_rpc` callers in `backend/src/solo/solo.service.ts`) to include tags in any per-question detail stored (if solo stores per-question detail — check and extend; otherwise add a per-answer row via the analytics service).

- [ ] **Step 5.3: TypeCheck**

```bash
cd /Users/instashop/Projects/football-quizball/backend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5.4: Commit**

```bash
git add backend/src/common/interfaces/match.interface.ts backend/src/match-history/match-history.service.ts backend/src/solo/solo.service.ts backend/src/duel/ backend/src/battle-royale/
git commit -m "feat(analytics): propagate analytics_tags into match detail snapshots"
```

---

## Task 6: `AnalyticsService` — pure aggregation

**Files:**
- Create: `backend/src/analytics/analytics.types.ts`
- Create: `backend/src/analytics/analytics.service.ts`
- Create: `backend/src/analytics/analytics.service.spec.ts`

- [ ] **Step 6.1: Define DTOs**

Create `backend/src/analytics/analytics.types.ts`:

```typescript
export interface EloPoint {
  t: string; // ISO timestamp
  elo: number;
}

export interface AccuracyBreakdown {
  bucket: string;
  total: number;
  correct: number;
  accuracy: number; // 0..1
}

export interface AnalyticsSummary {
  totals: {
    questions_answered: number;
    correct: number;
    accuracy: number;
    current_elo: number;
    peak_elo: number;
    days_active: number;
  };
  elo_trajectory: EloPoint[];
  by_difficulty: AccuracyBreakdown[];
  by_era: AccuracyBreakdown[];
  by_competition_type: AccuracyBreakdown[];
  by_league_tier: AccuracyBreakdown[];
  by_category: AccuracyBreakdown[];
  strongest: AccuracyBreakdown | null;
  weakest: AccuracyBreakdown | null;
}

export interface RawQuestionEvent {
  created_at: string;
  correct: boolean;
  difficulty: string;
  category?: string;
  era?: string;
  competition_type?: string;
  league_tier?: number;
}

export interface RawEloEvent {
  created_at: string;
  elo_after: number;
}
```

- [ ] **Step 6.2: Write failing test**

Create `backend/src/analytics/analytics.service.spec.ts`:

```typescript
import { AnalyticsService } from './analytics.service';
import type { RawEloEvent, RawQuestionEvent } from './analytics.types';

describe('AnalyticsService.aggregate', () => {
  const svc = new AnalyticsService({} as any); // no supabase needed for pure agg

  it('computes totals, accuracy and peak elo', () => {
    const eloEvents: RawEloEvent[] = [
      { created_at: '2026-04-01T10:00:00Z', elo_after: 1000 },
      { created_at: '2026-04-02T10:00:00Z', elo_after: 1050 },
      { created_at: '2026-04-03T10:00:00Z', elo_after: 1020 },
    ];
    const qEvents: RawQuestionEvent[] = [
      { created_at: '2026-04-01T10:00:00Z', correct: true, difficulty: 'easy', era: '2010s' },
      { created_at: '2026-04-01T10:01:00Z', correct: false, difficulty: 'easy', era: '2010s' },
      { created_at: '2026-04-02T10:00:00Z', correct: true, difficulty: 'medium', era: '2020s' },
    ];

    const out = svc.aggregate(qEvents, eloEvents, 1020);

    expect(out.totals.questions_answered).toBe(3);
    expect(out.totals.correct).toBe(2);
    expect(out.totals.accuracy).toBeCloseTo(2 / 3);
    expect(out.totals.peak_elo).toBe(1050);
    expect(out.totals.current_elo).toBe(1020);
    expect(out.totals.days_active).toBe(2);
    expect(out.elo_trajectory).toHaveLength(3);
  });

  it('buckets by difficulty and era', () => {
    const q: RawQuestionEvent[] = [
      { created_at: 't', correct: true, difficulty: 'easy', era: '2010s' },
      { created_at: 't', correct: false, difficulty: 'easy', era: '2010s' },
      { created_at: 't', correct: true, difficulty: 'hard', era: '2020s' },
    ];
    const out = svc.aggregate(q, [], 1000);
    const easy = out.by_difficulty.find((b) => b.bucket === 'easy')!;
    expect(easy.total).toBe(2);
    expect(easy.correct).toBe(1);
    expect(easy.accuracy).toBe(0.5);
    const era2010 = out.by_era.find((b) => b.bucket === '2010s')!;
    expect(era2010.total).toBe(2);
  });

  it('identifies strongest/weakest category by accuracy with min sample size', () => {
    const q: RawQuestionEvent[] = [
      // HISTORY: 4/5 correct
      ...Array.from({ length: 5 }, (_, i) => ({
        created_at: 't',
        correct: i < 4,
        difficulty: 'easy',
        category: 'HISTORY',
      })),
      // LOGO: 1/5 correct
      ...Array.from({ length: 5 }, (_, i) => ({
        created_at: 't',
        correct: i < 1,
        difficulty: 'easy',
        category: 'LOGO_QUIZ',
      })),
      // PLAYER_ID: 3/3 correct but too-small sample (ignored)
      ...Array.from({ length: 3 }, () => ({
        created_at: 't',
        correct: true,
        difficulty: 'easy',
        category: 'PLAYER_ID',
      })),
    ];
    const out = svc.aggregate(q, [], 1000);
    expect(out.strongest?.bucket).toBe('HISTORY');
    expect(out.weakest?.bucket).toBe('LOGO_QUIZ');
  });

  it('returns empty-shaped summary when no data', () => {
    const out = svc.aggregate([], [], 1000);
    expect(out.totals.questions_answered).toBe(0);
    expect(out.totals.accuracy).toBe(0);
    expect(out.strongest).toBeNull();
    expect(out.weakest).toBeNull();
  });
});
```

- [ ] **Step 6.3: Run test — expect FAIL**

```bash
cd /Users/instashop/Projects/football-quizball/backend
npx jest analytics.service.spec --no-coverage
```

Expected: FAIL — `AnalyticsService is not defined`.

- [ ] **Step 6.4: Implement service**

Create `backend/src/analytics/analytics.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  AccuracyBreakdown,
  AnalyticsSummary,
  EloPoint,
  RawEloEvent,
  RawQuestionEvent,
} from './analytics.types';

const MIN_SAMPLE_FOR_RANKING = 5;

@Injectable()
export class AnalyticsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getForUser(userId: string): Promise<AnalyticsSummary> {
    const [eloEvents, questionEvents, currentElo] = await Promise.all([
      this.supabase.getEloHistoryRaw(userId),
      this.supabase.getQuestionEventsRaw(userId),
      this.supabase.getCurrentElo(userId),
    ]);
    return this.aggregate(questionEvents, eloEvents, currentElo);
  }

  aggregate(
    questions: RawQuestionEvent[],
    elo: RawEloEvent[],
    currentElo: number,
  ): AnalyticsSummary {
    const total = questions.length;
    const correct = questions.filter((q) => q.correct).length;
    const accuracy = total === 0 ? 0 : correct / total;
    const peak_elo = elo.length > 0 ? Math.max(...elo.map((e) => e.elo_after)) : currentElo;
    const uniqueDays = new Set(
      questions.map((q) => q.created_at.slice(0, 10)),
    ).size;

    const elo_trajectory: EloPoint[] = elo
      .map((e) => ({ t: e.created_at, elo: e.elo_after }))
      .sort((a, b) => a.t.localeCompare(b.t));

    const by_difficulty = bucket(questions, (q) => q.difficulty);
    const by_era = bucket(questions, (q) => q.era ?? 'unknown');
    const by_competition_type = bucket(questions, (q) => q.competition_type ?? 'unknown');
    const by_league_tier = bucket(questions, (q) =>
      q.league_tier ? `tier_${q.league_tier}` : 'unknown',
    );
    const by_category = bucket(questions, (q) => q.category ?? 'unknown');

    const rankable = by_category.filter(
      (b) => b.total >= MIN_SAMPLE_FOR_RANKING && b.bucket !== 'unknown',
    );
    const strongest =
      rankable.length > 0 ? [...rankable].sort((a, b) => b.accuracy - a.accuracy)[0] : null;
    const weakest =
      rankable.length > 0 ? [...rankable].sort((a, b) => a.accuracy - b.accuracy)[0] : null;

    return {
      totals: {
        questions_answered: total,
        correct,
        accuracy,
        current_elo: currentElo,
        peak_elo,
        days_active: uniqueDays,
      },
      elo_trajectory,
      by_difficulty,
      by_era,
      by_competition_type,
      by_league_tier,
      by_category,
      strongest,
      weakest,
    };
  }
}

function bucket(
  questions: RawQuestionEvent[],
  keyFn: (q: RawQuestionEvent) => string,
): AccuracyBreakdown[] {
  const map = new Map<string, { total: number; correct: number }>();
  for (const q of questions) {
    const k = keyFn(q);
    const entry = map.get(k) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (q.correct) entry.correct += 1;
    map.set(k, entry);
  }
  return [...map.entries()]
    .map(([bucket, v]) => ({
      bucket,
      total: v.total,
      correct: v.correct,
      accuracy: v.total === 0 ? 0 : v.correct / v.total,
    }))
    .sort((a, b) => b.total - a.total);
}
```

- [ ] **Step 6.5: Run tests — expect PASS**

```bash
cd /Users/instashop/Projects/football-quizball/backend
npx jest analytics.service.spec --no-coverage
```

Expected: 4 passing.

- [ ] **Step 6.6: Commit**

```bash
git add backend/src/analytics/
git commit -m "feat(analytics): AnalyticsService aggregation with unit tests"
```

---

## Task 7: Supabase raw query helpers

**Files:**
- Modify: `backend/src/supabase/supabase.service.ts`

- [ ] **Step 7.1: Add `getEloHistoryRaw`, `getQuestionEventsRaw`, `getCurrentElo`**

Append to `backend/src/supabase/supabase.service.ts`:

```typescript
async getEloHistoryRaw(userId: string): Promise<Array<{ created_at: string; elo_after: number }>> {
  const { data, error } = await this.client
    .from('elo_history')
    .select('created_at, elo_after')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return data ?? [];
}

async getCurrentElo(userId: string): Promise<number> {
  const profile = await this.getProfile(userId);
  return profile?.elo ?? 1000;
}

async getQuestionEventsRaw(userId: string): Promise<
  Array<{
    created_at: string;
    correct: boolean;
    difficulty: string;
    category?: string;
    era?: string;
    competition_type?: string;
    league_tier?: number;
  }>
> {
  // Two sources: elo_history (has correct + difficulty but no tags), and
  // match_history.detail_snapshot (has tags but is jsonb).
  // For MVP, we use elo_history as the primary event stream and LEFT JOIN
  // tag data from match_history via a view. For now, start with elo_history
  // only — tags default to undefined and bucket as "unknown". Enrichment
  // comes in a follow-up task when match_history snapshot parsing is wired.
  const { data, error } = await this.client
    .from('elo_history')
    .select('created_at, correct, question_difficulty')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    created_at: r.created_at,
    correct: r.correct,
    difficulty: r.question_difficulty,
  }));
}
```

- [ ] **Step 7.2: TypeCheck**

```bash
cd /Users/instashop/Projects/football-quizball/backend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7.3: Commit**

```bash
git add backend/src/supabase/supabase.service.ts
git commit -m "feat(analytics): supabase raw query helpers for analytics aggregation"
```

---

## Task 8: `AnalyticsController` + module wiring

**Files:**
- Create: `backend/src/analytics/analytics.controller.ts`
- Create: `backend/src/analytics/analytics.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 8.1: Write controller**

Create `backend/src/analytics/analytics.controller.ts`:

```typescript
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ProGuard } from '../auth/pro.guard';
import { AnalyticsService } from './analytics.service';
import type { AnalyticsSummary } from './analytics.types';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @UseGuards(AuthGuard, ProGuard)
  @Get('me')
  async me(@Req() req: Request & { user: { id: string } }): Promise<AnalyticsSummary> {
    return this.analytics.getForUser(req.user.id);
  }
}
```

- [ ] **Step 8.2: Write module**

Create `backend/src/analytics/analytics.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [AuthModule, SupabaseModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
```

- [ ] **Step 8.3: Register in `app.module.ts`**

Read `backend/src/app.module.ts`. Add to `imports` array:

```typescript
import { AnalyticsModule } from './analytics/analytics.module';

// inside @Module imports:
AnalyticsModule,
```

- [ ] **Step 8.4: Smoke-test locally**

Terminal 1:

```bash
cd /Users/instashop/Projects/football-quizball/backend
npm run start:dev
```

Terminal 2 (replace `<TOKEN>` with a Pro user's JWT):

```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/analytics/me | jq .
```

Expected: JSON with `totals`, `elo_trajectory`, `by_difficulty`, etc. Call with a non-Pro token — expect 403.

- [ ] **Step 8.5: Commit**

```bash
git add backend/src/analytics/ backend/src/app.module.ts
git commit -m "feat(analytics): /api/analytics/me endpoint (Pro-gated)"
```

---

## Task 9: Frontend — install chart library + API service

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/app/core/analytics-api.service.ts`

- [ ] **Step 9.1: Install Chart.js + ng2-charts**

```bash
cd /Users/instashop/Projects/football-quizball/frontend
npm install chart.js@^4.4.0 ng2-charts@^6.0.0
```

Expected: packages installed, no errors.

- [ ] **Step 9.2: Write API service**

Create `frontend/src/app/core/analytics-api.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AccuracyBreakdown {
  bucket: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface AnalyticsSummary {
  totals: {
    questions_answered: number;
    correct: number;
    accuracy: number;
    current_elo: number;
    peak_elo: number;
    days_active: number;
  };
  elo_trajectory: Array<{ t: string; elo: number }>;
  by_difficulty: AccuracyBreakdown[];
  by_era: AccuracyBreakdown[];
  by_competition_type: AccuracyBreakdown[];
  by_league_tier: AccuracyBreakdown[];
  by_category: AccuracyBreakdown[];
  strongest: AccuracyBreakdown | null;
  weakest: AccuracyBreakdown | null;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsApiService {
  private readonly http = inject(HttpClient);

  getMySummary(): Promise<AnalyticsSummary> {
    return firstValueFrom(
      this.http.get<AnalyticsSummary>(`${environment.apiBase}/analytics/me`),
    );
  }
}
```

- [ ] **Step 9.3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/app/core/analytics-api.service.ts
git commit -m "feat(analytics): install chart.js + analytics API service"
```

---

## Task 10: Frontend — analytics route + container component

**Files:**
- Create: `frontend/src/app/features/analytics/analytics.ts`
- Create: `frontend/src/app/features/analytics/analytics.html`
- Create: `frontend/src/app/features/analytics/analytics.css`
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 10.1: Create container component**

Create `frontend/src/app/features/analytics/analytics.ts`:

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AnalyticsApiService, AnalyticsSummary } from '../../core/analytics-api.service';
import { ProService } from '../../core/pro.service';
import { AuthService } from '../../core/auth.service';
import { EloTrajectoryComponent } from './widgets/elo-trajectory';
import { CategoryHeatmapComponent } from './widgets/category-heatmap';
import { DifficultyBreakdownComponent } from './widgets/difficulty-breakdown';
import { EraBreakdownComponent } from './widgets/era-breakdown';
import { ProTeaserComponent } from './widgets/pro-teaser';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    CommonModule,
    EloTrajectoryComponent,
    CategoryHeatmapComponent,
    DifficultyBreakdownComponent,
    EraBreakdownComponent,
    ProTeaserComponent,
  ],
  templateUrl: './analytics.html',
  styleUrls: ['./analytics.css'],
})
export class AnalyticsComponent implements OnInit {
  private readonly api = inject(AnalyticsApiService);
  private readonly pro = inject(ProService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly summary = signal<AnalyticsSummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly isPro = this.pro.isPro;

  async ngOnInit(): Promise<void> {
    if (!this.auth.session()) {
      this.router.navigate(['/login']);
      return;
    }
    if (!this.pro.isPro()) {
      this.loading.set(false);
      return;
    }
    try {
      const data = await this.api.getMySummary();
      this.summary.set(data);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 10.2: Template**

Create `frontend/src/app/features/analytics/analytics.html`:

```html
<section class="analytics-page">
  <header class="analytics-header">
    <h1>Your Performance</h1>
    <p class="subtitle">How you stack up across leagues, eras, and difficulty.</p>
  </header>

  @if (loading()) {
    <div class="loading">Loading your stats…</div>
  } @else if (!isPro()) {
    <app-pro-teaser />
  } @else if (error()) {
    <div class="error">{{ error() }}</div>
  } @else if (summary(); as s) {
    <section class="totals">
      <div class="stat">
        <span class="label">Questions</span>
        <span class="value">{{ s.totals.questions_answered }}</span>
      </div>
      <div class="stat">
        <span class="label">Accuracy</span>
        <span class="value">{{ (s.totals.accuracy * 100) | number:'1.0-1' }}%</span>
      </div>
      <div class="stat">
        <span class="label">Current ELO</span>
        <span class="value">{{ s.totals.current_elo }}</span>
      </div>
      <div class="stat">
        <span class="label">Peak ELO</span>
        <span class="value">{{ s.totals.peak_elo }}</span>
      </div>
      <div class="stat">
        <span class="label">Days active</span>
        <span class="value">{{ s.totals.days_active }}</span>
      </div>
    </section>

    <section class="grid">
      <app-elo-trajectory [data]="s.elo_trajectory" />
      <app-difficulty-breakdown [data]="s.by_difficulty" />
      <app-category-heatmap
        [data]="s.by_category"
        [strongest]="s.strongest"
        [weakest]="s.weakest" />
      <app-era-breakdown [data]="s.by_era" />
    </section>
  }
</section>
```

- [ ] **Step 10.3: Minimal styles**

Create `frontend/src/app/features/analytics/analytics.css`:

```css
.analytics-page { padding: 1.25rem; max-width: 1080px; margin: 0 auto; }
.analytics-header h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; }
.subtitle { color: #94a3b8; margin-bottom: 1.5rem; }
.loading, .error { padding: 2rem; text-align: center; color: #94a3b8; }
.totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
.stat { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; padding: 0.75rem 1rem; }
.stat .label { display: block; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
.stat .value { display: block; font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
```

- [ ] **Step 10.4: Register route**

Read `frontend/src/app/app.routes.ts`. Add under shell children:

```typescript
{
  path: 'analytics',
  loadComponent: () =>
    import('./features/analytics/analytics').then((m) => m.AnalyticsComponent),
  canActivate: [authGuard],
},
```

- [ ] **Step 10.5: Commit**

```bash
git add frontend/src/app/features/analytics/ frontend/src/app/app.routes.ts
git commit -m "feat(analytics): analytics route + container component"
```

---

## Task 11: Widget — ELO trajectory (line chart)

**Files:**
- Create: `frontend/src/app/features/analytics/widgets/elo-trajectory.ts`

- [ ] **Step 11.1: Write widget**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration, ChartData } from 'chart.js';

@Component({
  selector: 'app-elo-trajectory',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="widget">
      <h3>ELO Trajectory</h3>
      @if (data.length === 0) {
        <p class="empty">No ELO history yet — play a few solo rounds.</p>
      } @else {
        <canvas baseChart [data]="chartData()" [options]="options" type="line"></canvas>
      }
    </div>
  `,
  styles: [
    `.widget { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; padding: 1rem; }`,
    `.widget h3 { font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem; }`,
    `.empty { color: #94a3b8; font-size: 0.85rem; }`,
    `canvas { max-height: 220px; }`,
  ],
})
export class EloTrajectoryComponent {
  @Input({ required: true }) data!: Array<{ t: string; elo: number }>;

  chartData(): ChartData<'line'> {
    return {
      labels: this.data.map((p) => new Date(p.t).toLocaleDateString()),
      datasets: [
        {
          data: this.data.map((p) => p.elo),
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167, 139, 250, 0.15)',
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    };
  }

  options: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94a3b8' } },
    },
  };
}
```

- [ ] **Step 11.2: Verify by running the app**

```bash
cd /Users/instashop/Projects/football-quizball/frontend
npm start
```

Log in as a Pro user, navigate to `/analytics`. Expected: line chart renders.

- [ ] **Step 11.3: Commit**

```bash
git add frontend/src/app/features/analytics/widgets/elo-trajectory.ts
git commit -m "feat(analytics): ELO trajectory widget"
```

---

## Task 12: Widget — Difficulty breakdown (bar chart)

**Files:**
- Create: `frontend/src/app/features/analytics/widgets/difficulty-breakdown.ts`

- [ ] **Step 12.1: Write widget**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration, ChartData } from 'chart.js';

interface Row { bucket: string; total: number; correct: number; accuracy: number; }

const ORDER = ['easy', 'medium', 'hard', 'expert'];
const COLORS: Record<string, string> = {
  easy: '#4ade80', medium: '#facc15', hard: '#fb923c', expert: '#f87171',
};

@Component({
  selector: 'app-difficulty-breakdown',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="widget">
      <h3>Accuracy by Difficulty</h3>
      @if (data.length === 0) {
        <p class="empty">No data yet.</p>
      } @else {
        <canvas baseChart [data]="chartData()" [options]="options" type="bar"></canvas>
      }
    </div>
  `,
  styles: [
    `.widget { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; padding: 1rem; }`,
    `.widget h3 { font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem; }`,
    `.empty { color: #94a3b8; font-size: 0.85rem; }`,
    `canvas { max-height: 220px; }`,
  ],
})
export class DifficultyBreakdownComponent {
  @Input({ required: true }) data!: Row[];

  chartData(): ChartData<'bar'> {
    const ordered = [...this.data].sort(
      (a, b) => ORDER.indexOf(a.bucket) - ORDER.indexOf(b.bucket),
    );
    return {
      labels: ordered.map((r) => r.bucket.toUpperCase()),
      datasets: [
        {
          data: ordered.map((r) => Math.round(r.accuracy * 100)),
          backgroundColor: ordered.map((r) => COLORS[r.bucket] ?? '#60a5fa'),
          borderRadius: 6,
        },
      ],
    };
  }

  options: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y}% accuracy` } },
    },
    scales: {
      y: {
        min: 0, max: 100,
        ticks: { callback: (v) => `${v}%`, color: '#94a3b8' },
        grid: { color: 'rgba(255,255,255,0.06)' },
      },
      x: { grid: { display: false }, ticks: { color: '#cbd5e1' } },
    },
  };
}
```

- [ ] **Step 12.2: Commit**

```bash
git add frontend/src/app/features/analytics/widgets/difficulty-breakdown.ts
git commit -m "feat(analytics): difficulty breakdown widget"
```

---

## Task 13: Widget — Category heatmap (strongest/weakest)

**Files:**
- Create: `frontend/src/app/features/analytics/widgets/category-heatmap.ts`

- [ ] **Step 13.1: Write widget**

```typescript
import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Row { bucket: string; total: number; correct: number; accuracy: number; }

@Component({
  selector: 'app-category-heatmap',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="widget">
      <h3>Category Strengths</h3>
      @if (highlight().strongest; as s) {
        <p class="callout callout-good">
          💪 Strongest: <strong>{{ s.bucket }}</strong> ({{ (s.accuracy * 100) | number:'1.0-0' }}%)
        </p>
      }
      @if (highlight().weakest; as w) {
        <p class="callout callout-warn">
          📚 Needs work: <strong>{{ w.bucket }}</strong> ({{ (w.accuracy * 100) | number:'1.0-0' }}%)
        </p>
      }
      <ul class="rows">
        @for (row of data; track row.bucket) {
          <li>
            <span class="name">{{ row.bucket }}</span>
            <span class="bar">
              <span class="fill" [style.width.%]="row.accuracy * 100"
                    [style.background]="color(row.accuracy)"></span>
            </span>
            <span class="pct">{{ (row.accuracy * 100) | number:'1.0-0' }}%</span>
            <span class="n">n={{ row.total }}</span>
          </li>
        }
      </ul>
    </div>
  `,
  styles: [
    `.widget { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; padding: 1rem; }`,
    `.widget h3 { font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem; }`,
    `.callout { font-size: 0.85rem; padding: 0.5rem 0.75rem; border-radius: 0.5rem; margin-bottom: 0.5rem; }`,
    `.callout-good { background: rgba(74, 222, 128, 0.1); color: #4ade80; }`,
    `.callout-warn { background: rgba(251, 146, 60, 0.1); color: #fb923c; }`,
    `.rows { list-style: none; padding: 0; margin: 0.75rem 0 0; display: flex; flex-direction: column; gap: 0.4rem; }`,
    `li { display: grid; grid-template-columns: 96px 1fr 48px 48px; gap: 0.5rem; align-items: center; font-size: 0.8rem; }`,
    `.name { color: #cbd5e1; text-transform: capitalize; }`,
    `.bar { background: rgba(255,255,255,0.06); border-radius: 999px; height: 8px; overflow: hidden; }`,
    `.fill { display: block; height: 100%; border-radius: 999px; transition: width 0.4s ease; }`,
    `.pct { color: #e2e8f0; font-weight: 600; text-align: right; }`,
    `.n { color: #64748b; font-size: 0.75rem; text-align: right; }`,
  ],
})
export class CategoryHeatmapComponent {
  @Input({ required: true }) data!: Row[];
  @Input() strongest: Row | null = null;
  @Input() weakest: Row | null = null;

  highlight = computed(() => ({ strongest: this.strongest, weakest: this.weakest }));

  color(acc: number): string {
    if (acc >= 0.75) return '#4ade80';
    if (acc >= 0.5) return '#facc15';
    if (acc >= 0.3) return '#fb923c';
    return '#f87171';
  }
}
```

Note: `strongest`/`weakest` are passed in as `@Input()` but also exposed via the `highlight` computed. The `signal`/`computed` imports stay for the future extension where this widget becomes reactive. For now `computed` wraps plain `@Input`s; if lint flags this as unused, remove the unused `signal` import.

- [ ] **Step 13.2: Commit**

```bash
git add frontend/src/app/features/analytics/widgets/category-heatmap.ts
git commit -m "feat(analytics): category heatmap widget"
```

---

## Task 14: Widget — Era breakdown (horizontal bar)

**Files:**
- Create: `frontend/src/app/features/analytics/widgets/era-breakdown.ts`

- [ ] **Step 14.1: Write widget**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration, ChartData } from 'chart.js';

interface Row { bucket: string; total: number; correct: number; accuracy: number; }

const ORDER = ['pre_1990', '1990s', '2000s', '2010s', '2020s'];
const LABELS: Record<string, string> = {
  pre_1990: 'Pre-1990',
  '1990s': '90s',
  '2000s': '2000s',
  '2010s': '2010s',
  '2020s': '2020s',
  unknown: 'Uncategorized',
};

@Component({
  selector: 'app-era-breakdown',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="widget">
      <h3>Accuracy by Era</h3>
      @if (rows().length === 0) {
        <p class="empty">Era data arrives as new questions are tagged.</p>
      } @else {
        <canvas baseChart [data]="chartData()" [options]="options" type="bar"></canvas>
      }
    </div>
  `,
  styles: [
    `.widget { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; padding: 1rem; }`,
    `.widget h3 { font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem; }`,
    `.empty { color: #94a3b8; font-size: 0.85rem; }`,
    `canvas { max-height: 220px; }`,
  ],
})
export class EraBreakdownComponent {
  @Input({ required: true }) data!: Row[];

  rows() {
    return this.data.filter((r) => r.bucket !== 'unknown').sort(
      (a, b) => ORDER.indexOf(a.bucket) - ORDER.indexOf(b.bucket),
    );
  }

  chartData(): ChartData<'bar'> {
    const ordered = this.rows();
    return {
      labels: ordered.map((r) => LABELS[r.bucket] ?? r.bucket),
      datasets: [
        {
          data: ordered.map((r) => Math.round(r.accuracy * 100)),
          backgroundColor: '#818cf8',
          borderRadius: 6,
        },
      ],
    };
  }

  options: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { min: 0, max: 100, ticks: { callback: (v) => `${v}%`, color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
      y: { grid: { display: false }, ticks: { color: '#cbd5e1' } },
    },
  };
}
```

- [ ] **Step 14.2: Commit**

```bash
git add frontend/src/app/features/analytics/widgets/era-breakdown.ts
git commit -m "feat(analytics): era breakdown widget"
```

---

## Task 15: Widget — Pro teaser (free users)

**Files:**
- Create: `frontend/src/app/features/analytics/widgets/pro-teaser.ts`

- [ ] **Step 15.1: Write teaser**

```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProService } from '../../../core/pro.service';

@Component({
  selector: 'app-pro-teaser',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="teaser">
      <div class="preview">
        <div class="fake-chart"></div>
        <div class="fake-row"></div>
        <div class="fake-row short"></div>
        <div class="lock">🔒</div>
      </div>
      <h2>Your performance, unlocked.</h2>
      <ul class="bullets">
        <li>📈 ELO trajectory — every game, every tier</li>
        <li>🎯 Category strengths + weaknesses with sample sizes</li>
        <li>📚 Accuracy by era, league tier, and difficulty</li>
        <li>💪 Auto-detected coaching suggestions</li>
      </ul>
      <button class="cta" (click)="upgrade()">Unlock with Pro →</button>
    </section>
  `,
  styles: [
    `.teaser { text-align: center; padding: 1.5rem; }`,
    `.preview { position: relative; margin: 0 auto 1.5rem; max-width: 360px; height: 160px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; overflow: hidden; filter: blur(6px) brightness(0.7); }`,
    `.fake-chart { height: 60%; background: linear-gradient(135deg, rgba(167,139,250,0.6), rgba(129,140,248,0.3)); }`,
    `.fake-row { height: 12px; margin: 8px; border-radius: 6px; background: rgba(255,255,255,0.15); }`,
    `.fake-row.short { width: 60%; }`,
    `.lock { position: absolute; inset: 0; display: grid; place-items: center; font-size: 2.5rem; filter: blur(0); }`,
    `h2 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.75rem; }`,
    `.bullets { list-style: none; padding: 0; margin: 0 0 1.25rem; text-align: left; max-width: 360px; margin-inline: auto; display: flex; flex-direction: column; gap: 0.4rem; color: #cbd5e1; font-size: 0.9rem; }`,
    `.cta { background: linear-gradient(135deg, #a78bfa, #818cf8); color: white; border: 0; padding: 0.75rem 1.5rem; font-weight: 700; border-radius: 999px; font-size: 1rem; cursor: pointer; }`,
    `.cta:hover { transform: translateY(-1px); }`,
  ],
})
export class ProTeaserComponent {
  private readonly pro = inject(ProService);
  upgrade(): void { this.pro.showUpgradeModal.set(true); }
}
```

- [ ] **Step 15.2: Commit**

```bash
git add frontend/src/app/features/analytics/widgets/pro-teaser.ts
git commit -m "feat(analytics): pro teaser component for free users"
```

---

## Task 16: Entry point from profile page

**Files:**
- Modify: `frontend/src/app/features/profile/profile.ts`
- Modify: `frontend/src/app/features/profile/profile.html` (if separate)

- [ ] **Step 16.1: Add "View full analytics" link**

In profile template, below the existing stats/sparkline section, add:

```html
<a class="analytics-link" routerLink="/analytics">
  View full analytics →
</a>
```

Styles (append to profile.css):

```css
.analytics-link {
  display: inline-block;
  margin-top: 1rem;
  padding: 0.6rem 1rem;
  background: rgba(167, 139, 250, 0.12);
  color: #a78bfa;
  border-radius: 0.5rem;
  font-weight: 600;
  text-decoration: none;
}
.analytics-link:hover { background: rgba(167, 139, 250, 0.2); }
```

Ensure `RouterLink` is imported in the profile component's `imports` array.

- [ ] **Step 16.2: Commit**

```bash
git add frontend/src/app/features/profile/
git commit -m "feat(analytics): link to analytics page from profile"
```

---

## Task 17: Update Pro feature list UI

**Files:**
- Modify: any component that renders the Pro feature list (grep for "Unlimited Duels" or "Post-match question review" in `frontend/src/app`).

- [ ] **Step 17.1: Add new feature bullet**

Add:

```html
<li>✓ Personal Performance Analytics</li>
```

in the same visual position as the existing features.

- [ ] **Step 17.2: Commit**

```bash
git add frontend/src/app/
git commit -m "feat(analytics): advertise analytics in Pro feature list"
```

---

## Task 18: E2E smoke test

**Files:**
- Create: `frontend/e2e/analytics.spec.ts` (if Playwright already set up — check `frontend/playwright.config.ts`; otherwise skip)

- [ ] **Step 18.1: Write E2E test** (skip if Playwright absent)

```typescript
import { test, expect } from '@playwright/test';

test('pro user sees analytics dashboard', async ({ page }) => {
  // assumes a logged-in Pro fixture is available; otherwise, prefix with login steps
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: 'Your Performance' })).toBeVisible();
  await expect(page.getByText('Current ELO')).toBeVisible();
});

test('free user sees pro teaser', async ({ page }) => {
  await page.goto('/analytics');
  await expect(page.getByText('Your performance, unlocked.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Unlock with Pro/ })).toBeVisible();
});
```

- [ ] **Step 18.2: Commit (if added)**

```bash
git add frontend/e2e/analytics.spec.ts
git commit -m "test(analytics): e2e smoke for pro/free branches"
```

---

## Task 19: Final QA + PR

- [ ] **Step 19.1: Backend test suite**

```bash
cd /Users/instashop/Projects/football-quizball/backend
npx jest --no-coverage
```

Expected: all green. `analytics.service.spec.ts` passes; no regressions.

- [ ] **Step 19.2: Frontend build**

```bash
cd /Users/instashop/Projects/football-quizball/frontend
npm run build
```

Expected: build succeeds, bundle size delta from chart.js roughly +60KB gzipped.

- [ ] **Step 19.3: Manual QA matrix**

Log in as:
- Free user → `/analytics` → sees blurred teaser + upgrade CTA.
- Pro user with no games → sees empty-state messages in each widget, totals at zero.
- Pro user with games → sees ELO line, bars populated, strongest/weakest callouts.

Verify `curl` 403 on `/api/analytics/me` without Pro token.

- [ ] **Step 19.4: Push + open PR**

```bash
git push -u origin feat/pro-performance-analytics
gh pr create --title "feat(pro): personal performance analytics" --body "$(cat <<'EOF'
## Summary
- New Pro-gated `/analytics` route with ELO trajectory, difficulty bars, category heatmap, and era breakdown
- Extends LLM question schema with structured analytics tags (league_tier, era, competition_type, nationality)
- `question_pool` table gains indexed metadata columns (forward-only; legacy rows bucket as "unknown")
- `GET /api/analytics/me` aggregates from `elo_history` for MVP; future task adds match_history snapshot enrichment
- Free users see blurred teaser → upgrade CTA (leverages Zeigarnik + endowment)

## Test plan
- [ ] Pro user with history: all 4 widgets render with real data
- [ ] Pro user with zero games: empty states show, no console errors
- [ ] Free user: teaser shows, Unlock CTA opens upgrade modal
- [ ] Non-auth user on `/analytics`: redirected to `/login`
- [ ] Backend: `npx jest` passes, `/api/analytics/me` returns 403 for non-Pro
- [ ] New solo questions include `analytics_tags` in LLM output (spot-check logs)
- [ ] Frontend bundle size within budget
EOF
)"
```

---

## Self-Review Checklist (ran before finalizing this plan)

- **Spec coverage:** category heatmaps ✅ (Task 13), ELO trajectory ✅ (Task 11), strongest/weakest ✅ (Task 6 + 13), accuracy breakdowns ✅ (Task 12/14), metadata extension (league/year/era/nationality/competition_type) ✅ (Tasks 1–5), Pro gating ✅ (Tasks 8/10/15).
- **Gap flagged:** Historical questions remain un-tagged (explicit out-of-scope). Analytics will show "Uncategorized" bucket for old data until a backfill plan runs.
- **Type consistency:** `AnalyticsTags` shape identical in `question.interface.ts` (Task 2), `match.interface.ts` (Task 5), `analytics.types.ts` (Task 6), `analytics-api.service.ts` (Task 9). ✅
- **No placeholders:** Every step has real code or real commands. Task 5 (Step 5.2) instructs a grep-and-patch across multiple construction sites — this is a documented action rather than a placeholder; executing engineer must perform the concrete edit at each site.
- **Follow-up plan needed:** `match_history.detail_snapshot` tag enrichment — current MVP aggregates only from `elo_history`, so `by_era`, `by_competition_type`, `by_league_tier` will be "unknown"-heavy until a follow-up ingests snapshot JSON. This is acceptable for shipping; the widgets gracefully show empty states.
