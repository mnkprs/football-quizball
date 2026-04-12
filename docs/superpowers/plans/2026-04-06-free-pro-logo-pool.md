# Free/Pro Logo Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict free users to the ~100 most popular logos (by lowest `question_elo`), allow pro users the full 1100+ pool, cap free user logo ELO at the pool ceiling, and add subtle upsell nudges.

**Architecture:** Query-time filtering using a cached ELO cutoff value. The Nth lowest `question_elo` becomes the boundary — free users see only logos at or below it. Two Supabase RPCs gain an optional `p_max_elo` parameter. Frontend gets two subtle upsell triggers: post-duel banner and solo mastery message.

**Tech Stack:** NestJS backend, Supabase RPCs (plpgsql), Angular 20 frontend, CacheService (Redis-backed), TailwindCSS

**Spec:** `docs/superpowers/specs/2026-04-06-free-pro-logo-pool-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/2026XXXX_free_logo_pool_rpc.sql` | Create | Add `p_max_elo` param to both RPCs + new `get_free_logo_cutoff` RPC |
| `backend/src/logo-quiz/logo-quiz.service.ts` | Modify | Add cutoff caching, filter `getQuestion()`, clamp ELO in `submitAnswer()` |
| `backend/src/logo-quiz/logo-quiz.types.ts` | Modify | Add `elo_capped` to `LogoQuizAnswerResult` |
| `backend/src/logo-quiz/logo-quiz.module.ts` | Modify | Import `CacheModule` (already global, but explicit for clarity isn't needed — it's `@Global()`) |
| `backend/src/duel/duel.service.ts` | Modify | Add `is_pro_logo` to question results in `buildPublicView()` |
| `backend/src/duel/duel.types.ts` | Modify | Add `is_pro_logo` to `DuelQuestionResult` |
| `frontend/src/app/core/logo-quiz-api.service.ts` | Modify | Add `elo_capped` to `LogoAnswerResponse` |
| `frontend/src/app/features/logo-quiz/logo-quiz.ts` | Modify | Handle `elo_capped` flag, show mastery upsell |
| `frontend/src/app/features/logo-quiz/logo-quiz.html` | Modify | Add mastery upsell banner markup |
| `frontend/src/app/features/duel/duel-api.service.ts` | Modify | Add `is_pro_logo` to `DuelQuestionResult` |
| `frontend/src/app/features/duel/duel-play.ts` | Modify | Compute whether to show pro upsell banner |
| `frontend/src/app/features/duel/duel-play.html` | Modify | Add subtle Pro collection banner |

---

### Task 1: Supabase Migration — Add `p_max_elo` to RPCs

**Files:**
- Create: `supabase/migrations/20260407000000_free_logo_pool_rpc.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Add optional p_max_elo parameter to draw_logo_questions_by_elo
-- When non-null, restricts to logos with question_elo <= p_max_elo (free tier filtering)

CREATE OR REPLACE FUNCTION draw_logo_questions_by_elo(
  p_target_elo integer,
  p_range integer DEFAULT 200,
  p_count integer DEFAULT 1,
  p_exclude_ids text[] DEFAULT NULL,
  p_max_elo integer DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  category text,
  difficulty text,
  question jsonb,
  translations jsonb,
  question_elo integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH drawn AS (
    SELECT qp.id, qp.category, qp.difficulty, qp.question,
           COALESCE(qp.translations, '{}'::jsonb) AS translations,
           qp.question_elo
    FROM question_pool qp
    WHERE qp.used = false
      AND qp.category = 'LOGO_QUIZ'
      AND qp.question_elo IS NOT NULL
      AND qp.question_elo BETWEEN (p_target_elo - p_range) AND (p_target_elo + p_range)
      AND (p_max_elo IS NULL OR qp.question_elo <= p_max_elo)
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0
           OR NOT ((qp.question->>'id') = ANY(p_exclude_ids)))
    ORDER BY ABS(qp.question_elo - p_target_elo), random()
    LIMIT p_count
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE question_pool qp SET used = true FROM drawn d WHERE qp.id = d.id
  )
  SELECT d.id, d.category::text, d.difficulty::text, d.question, d.translations, d.question_elo
  FROM drawn d;
END;
$$;

-- Add optional p_max_elo parameter to draw_questions
-- When non-null, restricts to questions with question_elo <= p_max_elo

CREATE OR REPLACE FUNCTION draw_questions(
  p_category text,
  p_difficulty text,
  p_count int DEFAULT 1,
  p_exclude_ids text[] DEFAULT NULL,
  p_max_elo integer DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  category text,
  difficulty text,
  question jsonb,
  translations jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH drawn AS (
    SELECT qp.id, qp.category, qp.question, COALESCE(qp.translations, '{}'::jsonb) AS translations
    FROM question_pool qp
    WHERE qp.used = false
      AND qp.category = p_category
      AND p_difficulty = ANY(COALESCE(qp.allowed_difficulties, ARRAY[qp.difficulty]))
      AND (p_max_elo IS NULL OR qp.question_elo <= p_max_elo)
      AND (p_exclude_ids IS NULL OR cardinality(p_exclude_ids) = 0 OR (qp.question->>'id') IS NULL OR NOT ((qp.question->>'id') = ANY(p_exclude_ids)))
    ORDER BY random()
    LIMIT p_count
    FOR UPDATE
  ),
  updated AS (
    UPDATE question_pool qp
    SET used = true, used_at = now()
    FROM drawn d
    WHERE qp.id = d.id
      AND qp.category != 'NEWS'
  )
  SELECT d.id, d.category::text, p_difficulty, d.question, d.translations FROM drawn d;
END;
$$;

-- Helper RPC: get the ELO cutoff for the free logo pool
-- Returns the question_elo of the Nth row when ordered ascending
CREATE OR REPLACE FUNCTION get_free_logo_cutoff(p_pool_size integer DEFAULT 100)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT question_elo
  FROM question_pool
  WHERE category = 'LOGO_QUIZ'
    AND question_elo IS NOT NULL
  ORDER BY question_elo ASC
  LIMIT 1
  OFFSET (p_pool_size - 1);
$$;
```

- [ ] **Step 2: Apply the migration locally**

Run: `cd supabase && npx supabase db push`
Expected: Migration applied successfully, no errors.

- [ ] **Step 3: Verify RPCs work**

Run from Supabase SQL editor or psql:
```sql
-- Should return the cutoff ELO for top 100 logos
SELECT get_free_logo_cutoff(100);

-- Should return logos only within the cutoff
SELECT count(*) FROM question_pool
WHERE category = 'LOGO_QUIZ' AND question_elo IS NOT NULL
  AND question_elo <= (SELECT get_free_logo_cutoff(100));
```
Expected: First query returns an integer. Second query returns ~100.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260407000000_free_logo_pool_rpc.sql
git commit -m "feat: add p_max_elo param to logo RPCs + free pool cutoff RPC"
```

---

### Task 2: Backend — Add Cutoff Caching to LogoQuizService

**Files:**
- Modify: `backend/src/logo-quiz/logo-quiz.service.ts` (lines 1-28)

- [ ] **Step 1: Add CacheService injection and cutoff method**

Add `CacheService` import and inject it. Add the `getFreePoolCutoff()` method and the constant.

In `backend/src/logo-quiz/logo-quiz.service.ts`, add the import at the top:

```typescript
import { CacheService } from '../cache/cache.service';
```

Update the constructor to inject `CacheService`:

```typescript
private static readonly FREE_LOGO_POOL_SIZE = 100;
private static readonly CUTOFF_CACHE_KEY = 'logo:free_pool_cutoff';
private static readonly CUTOFF_CACHE_TTL = 3600; // 1 hour in seconds

constructor(
  private readonly supabaseService: SupabaseService,
  private readonly eloService: EloService,
  private readonly achievementsService: AchievementsService,
  private readonly cacheService: CacheService,
) {}

/**
 * Get the ELO cutoff for the free logo pool.
 * Cached for 1 hour since the pool changes rarely.
 * Returns null if the pool is too small (all logos are free).
 */
async getFreePoolCutoff(): Promise<number | null> {
  const cached = await this.cacheService.get<number>(LogoQuizService.CUTOFF_CACHE_KEY);
  if (cached !== undefined) return cached;

  const { data, error } = await this.supabaseService.client.rpc('get_free_logo_cutoff', {
    p_pool_size: LogoQuizService.FREE_LOGO_POOL_SIZE,
  });

  if (error || data === null || data === undefined) return null;
  const cutoff = data as number;
  await this.cacheService.set(LogoQuizService.CUTOFF_CACHE_KEY, cutoff, LogoQuizService.CUTOFF_CACHE_TTL);
  return cutoff;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/logo-quiz/logo-quiz.service.ts
git commit -m "feat: add free pool cutoff caching to LogoQuizService"
```

---

### Task 3: Backend — Filter `getQuestion()` for Free Users

**Files:**
- Modify: `backend/src/logo-quiz/logo-quiz.service.ts` (lines 35-87)

- [ ] **Step 1: Rewrite `getQuestion()` to use cutoff filtering**

Replace the entire `getQuestion()` method body (lines 35-87) with:

```typescript
async getQuestion(
  userId: string,
  difficulty?: Difficulty,
  hardcore = false,
): Promise<LogoQuestion> {
  const profile = await this.supabaseService.getProfile(userId);
  if (!profile) throw new NotFoundException('Profile not found');

  // Determine if user is pro — if not, restrict to free pool
  const proStatus = await this.supabaseService.getProStatus(userId);
  const isPro = proStatus?.is_pro ?? false;
  const maxElo = isPro ? null : await this.getFreePoolCutoff();

  const logoElo = hardcore ? profile.logo_quiz_hardcore_elo : profile.logo_quiz_elo;
  const client = this.supabaseService.client;

  // Try ELO-range-based draw with widening ranges
  for (const range of [200, 400, 800]) {
    const { data, error } = await client.rpc('draw_logo_questions_by_elo', {
      p_target_elo: logoElo,
      p_range: range,
      p_count: 1,
      p_max_elo: maxElo,
    });

    if (!error && data?.length) {
      const row = data[0];
      const q = row.question;
      return {
        ...this.mapQuestion(q, row.difficulty as Difficulty, hardcore),
        question_elo: row.question_elo,
      };
    }
  }

  // Fallback: categorical difficulty draw
  const diff = difficulty ?? this.eloService.getDifficultyForElo(logoElo);
  for (const fallback of [diff, 'EASY', 'HARD'] as Difficulty[]) {
    const { data: fb } = await client.rpc('draw_questions', {
      p_category: 'LOGO_QUIZ',
      p_difficulty: fallback,
      p_count: 1,
      p_max_elo: maxElo,
    });
    if (fb?.length) {
      const q = fb[0].question;
      return this.mapQuestion(q, fallback, hardcore);
    }
  }
  throw new NotFoundException('No logo questions available');
}
```

Key changes:
- Replaced `totalPlayed >= 150` counter check with `getProStatus()` + `getFreePoolCutoff()`
- Pass `p_max_elo` to both RPCs (null for pro = no filter, cutoff value for free)

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/logo-quiz/logo-quiz.service.ts
git commit -m "feat: filter solo logo questions by free pool cutoff for non-pro users"
```

---

### Task 4: Backend — Clamp Free User ELO in `submitAnswer()`

**Files:**
- Modify: `backend/src/logo-quiz/logo-quiz.service.ts` (lines 92-166)
- Modify: `backend/src/logo-quiz/logo-quiz.types.ts`

- [ ] **Step 1: Add `elo_capped` to the answer result type**

In `backend/src/logo-quiz/logo-quiz.types.ts`, update `LogoQuizAnswerResult`:

```typescript
export interface LogoQuizAnswerResult {
  correct: boolean;
  timed_out: boolean;
  correct_answer: string;
  elo_before: number;
  elo_after: number;
  elo_change: number;
  elo_capped?: boolean;
}
```

- [ ] **Step 2: Update `submitAnswer()` to clamp ELO and return `elo_capped`**

In `backend/src/logo-quiz/logo-quiz.service.ts`, replace the `submitAnswer()` method (lines 92-166) with:

```typescript
async submitAnswer(
  userId: string,
  questionId: string,
  answer: string,
  timedOut = false,
  hardcore = false,
): Promise<LogoQuizAnswerResult> {
  const profile = await this.supabaseService.getProfile(userId);
  if (!profile) throw new ForbiddenException('Profile not found');

  const logoElo = hardcore ? profile.logo_quiz_hardcore_elo : profile.logo_quiz_elo;

  // Look up the question to get correct answer and question_elo
  const client = this.supabaseService.client;
  const { data } = await client
    .from('question_pool')
    .select('question, difficulty, question_elo')
    .eq('category', 'LOGO_QUIZ')
    .filter('question->>id', 'eq', questionId)
    .limit(1)
    .single();

  if (!data) throw new NotFoundException('Question not found');

  const correctAnswer = data.question.correct_answer;
  const difficulty = data.difficulty as Difficulty;
  const correct = !timedOut && this.fuzzyMatch(answer, correctAnswer);

  // Calculate ELO change — use composite question_elo when available
  const gamesPlayed = hardcore ? profile.logo_quiz_hardcore_games_played : profile.logo_quiz_games_played;
  const eloChange = data.question_elo
    ? this.eloService.calculateWithQuestionElo(logoElo, data.question_elo, correct, timedOut, gamesPlayed)
    : this.eloService.calculate(logoElo, difficulty, correct, timedOut, gamesPlayed);
  let newElo = this.eloService.applyChange(logoElo, eloChange);

  // Clamp ELO at free pool cutoff for non-pro users
  let eloCapped = false;
  const proStatus = await this.supabaseService.getProStatus(userId);
  const isPro = proStatus?.is_pro ?? false;
  if (!isPro) {
    const cutoff = await this.getFreePoolCutoff();
    if (cutoff !== null && newElo > cutoff) {
      newElo = cutoff;
      eloCapped = true;
    }
  }

  // Atomic DB update — use the correct RPC for normal vs hardcore
  const rpcName = hardcore ? 'commit_logo_quiz_hardcore_answer' : 'commit_logo_quiz_answer';
  const { error: rpcError } = await client.rpc(rpcName, {
    p_user_id: userId,
    p_elo_before: logoElo,
    p_elo_after: newElo,
    p_elo_change: newElo - logoElo,
    p_difficulty: difficulty,
    p_correct: correct,
    p_timed_out: timedOut,
  });

  if (rpcError) {
    console.error(`${rpcName} RPC failed:`, rpcError);
    // Fallback: direct update if RPC fails
    const eloCol = hardcore ? 'logo_quiz_hardcore_elo' : 'logo_quiz_elo';
    const gamesCol = hardcore ? 'logo_quiz_hardcore_games_played' : 'logo_quiz_games_played';
    await client
      .from('profiles')
      .update({ [eloCol]: newElo, [gamesCol]: gamesPlayed + 1 })
      .eq('id', userId);
  }

  // Increment profile-level questions_answered / correct_answers
  await this.supabaseService.incrementQuestionStats(userId, correct ? 1 : 0);

  // Track logo quiz correct count for achievements
  if (correct) {
    void this.supabaseService.incrementLogoQuizCorrect(userId).catch(() => {});
  }

  return {
    correct,
    timed_out: timedOut,
    correct_answer: correctAnswer,
    elo_before: logoElo,
    elo_after: newElo,
    elo_change: newElo - logoElo,
    ...(eloCapped ? { elo_capped: true } : {}),
  };
}
```

Key changes:
- After calculating `newElo`, check if user is free and clamp to cutoff
- Return `elo_capped: true` when clamped
- Use `newElo - logoElo` for `elo_change` (reflects the clamped value)

- [ ] **Step 3: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/logo-quiz/logo-quiz.service.ts backend/src/logo-quiz/logo-quiz.types.ts
git commit -m "feat: clamp free user logo ELO at pool cutoff and return elo_capped flag"
```

---

### Task 5: Backend — Add `is_pro_logo` to Duel Question Results

**Files:**
- Modify: `backend/src/duel/duel.types.ts` (line 52-58)
- Modify: `backend/src/duel/duel.service.ts` (lines 567-589)

- [ ] **Step 1: Add `is_pro_logo` to `DuelQuestionResult`**

In `backend/src/duel/duel.types.ts`, update the `DuelQuestionResult` interface:

```typescript
export interface DuelQuestionResult {
  index: number;
  winner: 'host' | 'guest' | null;
  question_text: string;
  correct_answer: string;
  is_pro_logo?: boolean;
}
```

- [ ] **Step 2: Inject LogoQuizService into DuelService and compute `is_pro_logo` in `buildPublicView()`**

First check if `LogoQuizService` is already injected in `DuelService`. It is — it's used in `drawQuestionsForType()` (line 541). So we just need to modify `buildPublicView()`.

In `backend/src/duel/duel.service.ts`, update the `buildPublicView()` method. The method currently builds `questionResults` directly from `row.question_results`. We need to enrich it with `is_pro_logo` when the game is a logo duel.

Change the method signature to accept `freePoolCutoff`:

```typescript
private buildPublicView(
  row: DuelGameRow,
  myUserId: string,
  hostUsername: string,
  guestUsername: string | null,
  freePoolCutoff?: number | null,
): DuelPublicView {
  const myRole: 'host' | 'guest' = row.host_id === myUserId ? 'host' : 'guest';

  const isLogo = row.game_type === 'logo';
  const currentQuestion = this.toPublicQuestion(row.questions, row.current_question_index, isLogo);

  // Enrich question results with is_pro_logo for logo duels
  const questionResults = isLogo && freePoolCutoff != null
    ? row.question_results.map((r, i) => {
        const q = row.questions[i] as any;
        const qElo = q?.question_elo as number | undefined;
        return {
          ...r,
          is_pro_logo: qElo != null ? qElo > freePoolCutoff : false,
        };
      })
    : row.question_results;

  return {
    id: row.id,
    status: row.status,
    inviteCode: row.invite_code,
    myRole,
    myUserId,
    hostUsername,
    guestUsername,
    scores: row.scores,
    currentQuestion,
    currentQuestionIndex: row.current_question_index,
    questionResults,
    hostReady: row.host_ready,
    guestReady: row.guest_ready,
    gameType: row.game_type,
  };
}
```

- [ ] **Step 3: Update all callers of `buildPublicView` to pass the cutoff**

Search for all call sites of `buildPublicView` in `duel.service.ts`. Each one needs to fetch and pass the cutoff. Since the cutoff is cached, the overhead is minimal.

At the top of `DuelService`, add a helper:

```typescript
private async getLogoPoolCutoff(): Promise<number | null> {
  return this.logoQuizService.getFreePoolCutoff();
}
```

Then update each caller to pass the cutoff. For each `buildPublicView(row, userId, hostName, guestName)` call, change to:

```typescript
const freePoolCutoff = row.game_type === 'logo' ? await this.getLogoPoolCutoff() : null;
return this.buildPublicView(row, userId, hostName, guestName, freePoolCutoff);
```

There are ~6 call sites: `createGame`, `joinByCode`, `joinQueue`, `getGame`, `markReady`, and the polling/SSE method. Each needs this one-line addition before the `buildPublicView` call.

- [ ] **Step 4: Store `question_elo` in logo duel questions for cutoff comparison**

In `drawQuestionsForType()` (line 539-555), the logo questions need to carry their `question_elo` so `buildPublicView` can compare against the cutoff. The `drawLogosForTeamMode` result doesn't currently include `question_elo`.

In `backend/src/logo-quiz/logo-quiz.service.ts`, update `drawLogosForTeamMode()` to also select and return `question_elo`:

Add to the return type:
```typescript
async drawLogosForTeamMode(count: number): Promise<
  Array<{
    id: string;
    correct_answer: string;
    image_url: string;
    original_image_url: string;
    difficulty: string;
    question_elo?: number;
    meta: { slug: string; league: string; country: string };
  }>
>
```

In the select query (line 238), change to:
```typescript
.select('id, question, question_elo')
```

In the return map (line 265), add:
```typescript
question_elo: row.question_elo ?? undefined,
```

Then in `duel.service.ts` `drawQuestionsForType()`, carry `question_elo` through:
```typescript
return logos.map((l) => ({
  id: l.id,
  question_text: 'Identify this football club',
  correct_answer: l.correct_answer,
  explanation: '',
  category: 'LOGO_QUIZ',
  difficulty: l.difficulty,
  image_url: l.image_url,
  original_image_url: l.original_image_url,
  question_elo: l.question_elo,
} as GeneratedQuestion & { image_url: string; original_image_url: string; question_elo?: number }));
```

- [ ] **Step 5: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/duel/duel.types.ts backend/src/duel/duel.service.ts backend/src/logo-quiz/logo-quiz.service.ts
git commit -m "feat: add is_pro_logo flag to duel question results for upsell"
```

---

### Task 6: Frontend — Solo Mastery Upsell

**Files:**
- Modify: `frontend/src/app/core/logo-quiz-api.service.ts` (line 18-25)
- Modify: `frontend/src/app/features/logo-quiz/logo-quiz.ts` (lines 163-190)
- Modify: `frontend/src/app/features/logo-quiz/logo-quiz.html`

- [ ] **Step 1: Add `elo_capped` to the frontend response type**

In `frontend/src/app/core/logo-quiz-api.service.ts`, update `LogoAnswerResponse`:

```typescript
export interface LogoAnswerResponse {
  correct: boolean;
  timed_out: boolean;
  correct_answer: string;
  elo_before: number;
  elo_after: number;
  elo_change: number;
  elo_capped?: boolean;
}
```

- [ ] **Step 2: Add mastery upsell state to the logo quiz component**

In `frontend/src/app/features/logo-quiz/logo-quiz.ts`, add a signal and localStorage check:

```typescript
// Add to component class properties
showMasteryUpsell = signal(false);
private readonly MASTERY_DISMISSED_KEY = 'logo_mastery_upsell_dismissed';
```

Then in the `submitAnswer()` method, after setting `revealResultData`, add:

```typescript
// Check for ELO cap mastery upsell
if (result.elo_capped && !localStorage.getItem(this.MASTERY_DISMISSED_KEY)) {
  this.showMasteryUpsell.set(true);
}
```

Add a dismiss method:

```typescript
dismissMasteryUpsell(): void {
  localStorage.setItem(this.MASTERY_DISMISSED_KEY, 'true');
  this.showMasteryUpsell.set(false);
}
```

- [ ] **Step 3: Add mastery upsell banner to the template**

In `frontend/src/app/features/logo-quiz/logo-quiz.html`, add after the reveal result section (where ELO change is shown):

```html
@if (showMasteryUpsell()) {
  <div class="mx-4 mt-3 p-4 rounded-xl bg-purple-500/15 border border-purple-500/30">
    <p class="text-sm text-purple-300 font-medium mb-2">You've mastered the free logos! Unlock 1,000+ more with Pro.</p>
    <div class="flex gap-2">
      <button
        (click)="openProUpgrade()"
        class="px-4 py-2 rounded-lg bg-purple-500 text-white text-xs font-bold hover:bg-purple-400 transition"
      >
        Upgrade
      </button>
      <button
        (click)="dismissMasteryUpsell()"
        class="px-4 py-2 rounded-lg bg-transparent text-purple-400 text-xs font-medium hover:text-purple-300 transition"
      >
        Dismiss
      </button>
    </div>
  </div>
}
```

Note: `openProUpgrade()` should call the existing ProService paywall trigger. Check if there's already a method for this in the component — if the component already has a reference to `ProService`, call `proService.showPaywall('general')` or equivalent. If not, inject `ProService` and add:

```typescript
openProUpgrade(): void {
  this.proService.showPaywall('general');
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/logo-quiz-api.service.ts frontend/src/app/features/logo-quiz/logo-quiz.ts frontend/src/app/features/logo-quiz/logo-quiz.html
git commit -m "feat: add solo logo quiz mastery upsell when free user ELO is capped"
```

---

### Task 7: Frontend — Post-Duel Subtle Upsell

**Files:**
- Modify: `frontend/src/app/features/duel/duel-api.service.ts` (line 35-40)
- Modify: `frontend/src/app/features/duel/duel-play.ts`
- Modify: `frontend/src/app/features/duel/duel-play.html` (lines 262-263)

- [ ] **Step 1: Add `is_pro_logo` to the frontend duel types**

In `frontend/src/app/features/duel/duel-api.service.ts`, find the `DuelQuestionResult` interface and add:

```typescript
export interface DuelQuestionResult {
  index: number;
  winner: 'host' | 'guest' | null;
  question_text: string;
  correct_answer: string;
  is_pro_logo?: boolean;
}
```

- [ ] **Step 2: Add upsell logic to duel-play component**

In `frontend/src/app/features/duel/duel-play.ts`, add a computed signal that determines whether to show the pro collection banner:

```typescript
// Add imports
import { ProService } from '../../core/pro.service';

// Inject ProService
private proService = inject(ProService);

// Add computed signal — show only if: game is logo type, user is free, user lost or drew, and any question was pro
showProLogoBanner = computed(() => {
  const view = this.store.gameView();
  if (!view || view.gameType !== 'logo') return false;
  if (this.proService.isPro()) return false;
  if (this.store.gameWinner() === 'me') return false;
  return view.questionResults.some(r => r.is_pro_logo);
});
```

Add the upgrade method (if not already present):

```typescript
openProUpgrade(): void {
  this.proService.showPaywall('duel');
}
```

- [ ] **Step 3: Add subtle banner to duel results template**

In `frontend/src/app/features/duel/duel-play.html`, add after the question breakdown section (after the closing `</div>` of the breakdown at ~line 261) and before the "Play Again" button:

```html
@if (showProLogoBanner()) {
  <div class="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-between gap-3">
    <p class="text-xs text-purple-300/80">You faced logos from the Pro collection. Unlock 1,000+ logos with Pro.</p>
    <button
      (click)="openProUpgrade()"
      class="shrink-0 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 text-xs font-bold hover:bg-purple-500/30 transition"
    >
      Upgrade
    </button>
  </div>
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/duel/duel-api.service.ts frontend/src/app/features/duel/duel-play.ts frontend/src/app/features/duel/duel-play.html
git commit -m "feat: add subtle Pro collection upsell banner on duel results for free users"
```

---

### Task 8: Verification & Cleanup

**Files:** None new — verify existing changes work together.

- [ ] **Step 1: Full backend build**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Full frontend build**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Verify the old counter gate is fully removed**

Run: `grep -r "totalPlayed" backend/src/logo-quiz/`
Expected: No matches (the old `totalPlayed >= 150` check should be gone).

Run: `grep -r "Free logo limit" backend/src/logo-quiz/`
Expected: No matches (the old error message should be gone).

- [ ] **Step 4: Verify `p_max_elo` is passed in all logo question draws**

Run: `grep -n "p_max_elo" backend/src/logo-quiz/logo-quiz.service.ts`
Expected: At least 2 matches (one in `draw_logo_questions_by_elo` call, one in `draw_questions` call).

- [ ] **Step 5: Final commit**

If any cleanup was needed:
```bash
git add -A
git commit -m "chore: cleanup after free/pro logo pool implementation"
```
