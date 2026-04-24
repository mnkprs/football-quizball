# Analytics Mode Split — Separate Solo / Logo Quiz / Hardcore ELO Views

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the `/analytics` dashboard so it shows the right ELO per mode. Currently it mixes rows from Solo / Logo Quiz / Logo Hardcore into a single blended view — which means "Current ELO" and "Peak ELO" are wrong, and the trajectory chart jumps between unrelated ELO systems.

**Architecture:** Add a `mode` discriminator to `elo_history`. Every ELO-writing RPC sets it on insert. The analytics endpoint takes `?mode=solo|logo_quiz|logo_quiz_hardcore` and filters. UI gets a mode picker. Legacy rows have `mode = NULL` and are excluded from per-mode views (user still sees aggregate counts).

**Tech Stack:** Supabase, NestJS, Angular 20. No new dependencies.

**Context:** Builds on PR #57 (shipped 2026-04-15, v0.5.1.0) which wired up category/era/tier breakdowns. Bug surfaced after ship: `elo_history` has no mode column, so `getEloHistoryRaw` / `getQuestionEventsRaw` return rows mixed across 3 ELO systems. This plan closes that gap.

---

## Scope

**In scope:**
1. `elo_history.mode` column with CHECK constraint
2. 3 RPC migrations (or one combined) — solo + logo quiz + logo quiz hardcore RPCs pass mode
3. Backend — analytics endpoint accepts mode param, defaults to 'solo', filters queries
4. Frontend — mode picker at top of `/analytics`, per-mode `current_elo` from correct profile column

**Out of scope:**
- Backfilling `mode` on legacy rows (leave as NULL — users see partial history for past-mode play; new plays populate correctly)
- Cross-mode comparison view (future)
- Logo Quiz Hardcore-specific aggregation tweaks (uses same pipeline as Logo Quiz)

---

## File Structure

**New files:**
- `supabase/migrations/20260611000000_elo_history_mode.sql` — mode column + CHECK
- `supabase/migrations/20260611000001_solo_and_logo_rpcs_mode.sql` — extend all 3 RPCs to accept `p_mode TEXT`

**Modified files:**
- `backend/src/common/interfaces/elo.interface.ts` — add `mode?: string` to insert params
- `backend/src/supabase/supabase.service.ts` — `getEloHistoryRaw(userId, mode)`, `getQuestionEventsRaw(userId, mode)`, new `getCurrentEloByMode(userId, mode)` helper
- `backend/src/analytics/analytics.controller.ts` — accept `@Query('mode')` with validation, default 'solo'
- `backend/src/analytics/analytics.service.ts` — `getForUser(userId, mode)`
- `backend/src/supabase/elo.repository.ts` — pass `p_mode: 'solo'`
- `backend/src/logo-quiz/logo-quiz.service.ts` — pass `p_mode: 'logo_quiz'` or `'logo_quiz_hardcore'` depending on which RPC
- `backend/src/supabase/supabase.service.ts` (second solo call path) — pass `p_mode: 'solo'`
- `frontend/src/app/core/analytics-api.service.ts` — `getMySummary(mode)` takes mode arg
- `frontend/src/app/features/analytics/analytics.ts` — mode signal + picker + refetch on change
- `frontend/src/app/features/analytics/analytics.html` — mode picker UI
- `frontend/src/app/features/analytics/analytics.css` — picker styles

---

## Task 0: Pre-flight

- [ ] Create worktree + link supabase + install deps

```bash
cd /Users/instashop/Projects/football-quizball
git worktree add ../football-quizball-analytics-modes -b feat/analytics-mode-split
cd ../football-quizball-analytics-modes
supabase link --project-ref npwneqworgyclzaofuln
cd backend && npm install
cd ../frontend && npm install
```

---

## Task 1: Migration — add `mode` column

**File:** `supabase/migrations/20260611000000_elo_history_mode.sql`

```sql
-- Add mode discriminator to elo_history so analytics can filter per ELO track.
-- Legacy rows (before this migration) have mode = NULL and are treated as
-- "unknown mode" — excluded from per-mode views.

ALTER TABLE elo_history
  ADD COLUMN IF NOT EXISTS mode TEXT CHECK (mode IN ('solo', 'logo_quiz', 'logo_quiz_hardcore'));

CREATE INDEX IF NOT EXISTS idx_elo_history_user_mode ON elo_history(user_id, mode);
CREATE INDEX IF NOT EXISTS idx_elo_history_user_mode_created ON elo_history(user_id, mode, created_at DESC);

COMMENT ON COLUMN elo_history.mode IS 'ELO track: solo | logo_quiz | logo_quiz_hardcore. Null for pre-migration rows.';
```

Apply with the same drift workaround as previous tasks.

---

## Task 2: Extend the 3 RPCs

**File:** `supabase/migrations/20260611000001_solo_and_logo_rpcs_mode.sql`

Add `p_mode TEXT DEFAULT NULL` to these three RPCs and pass it into the INSERT:

1. `commit_solo_answer` — latest version at `20260610000001_commit_solo_answer_question_id.sql`
2. `commit_logo_quiz_answer` — first half of `20260610000002_commit_logo_quiz_answer_question_id.sql`
3. `commit_logo_quiz_hardcore_answer` — second half of `20260610000002_commit_logo_quiz_answer_question_id.sql`

Copy each function body verbatim from its latest migration, add `p_mode TEXT DEFAULT NULL` as the new final parameter, and add `mode` to the `INSERT INTO elo_history (...)` column list + `p_mode` to the VALUES.

---

## Task 3: TypeScript callers pass mode

### Step 3.1: Extend `CommitSoloAnswerParams`

`backend/src/common/interfaces/elo.interface.ts`:

```typescript
export interface CommitSoloAnswerParams {
  // ...existing...
  mode?: 'solo' | 'logo_quiz' | 'logo_quiz_hardcore';
}
```

### Step 3.2: Update callers

- `backend/src/supabase/elo.repository.ts` → `p_mode: 'solo'`
- `backend/src/supabase/supabase.service.ts` (second solo call path) → `p_mode: 'solo'`
- `backend/src/logo-quiz/logo-quiz.service.ts` → `p_mode: 'logo_quiz'` (normal) or `'logo_quiz_hardcore'` (hardcore)

### Step 3.3: tsc + apply migrations

```bash
cd backend && npx tsc --noEmit
cd .. && supabase db push  # with drift workaround
```

---

## Task 4: Backend — filter analytics by mode

### Step 4.1: `supabase.service.ts`

```typescript
async getEloHistoryRaw(userId: string, mode: string): Promise<Array<{ created_at: string; elo_after: number }>> {
  const { data, error } = await this.client
    .from('elo_history')
    .select('created_at, elo_after')
    .eq('user_id', userId)
    .eq('mode', mode)
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return data ?? [];
}

async getQuestionEventsRaw(userId: string, mode: string): Promise<RawQuestionEvent[]> {
  const { data, error } = await this.client
    .from('elo_history')
    .select(`
      created_at,
      correct,
      question_difficulty,
      question_pool:question_id (
        category,
        era,
        competition_type,
        league_tier
      )
    `)
    .eq('user_id', userId)
    .eq('mode', mode)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    created_at: r.created_at,
    correct: r.correct,
    difficulty: r.question_difficulty,
    category: r.question_pool?.category ?? undefined,
    era: r.question_pool?.era ?? undefined,
    competition_type: r.question_pool?.competition_type ?? undefined,
    league_tier: r.question_pool?.league_tier ?? undefined,
  }));
}

async getCurrentEloByMode(userId: string, mode: string): Promise<number> {
  const col = mode === 'logo_quiz' ? 'logo_quiz_elo' : mode === 'logo_quiz_hardcore' ? 'logo_quiz_hardcore_elo' : 'elo';
  const { data, error } = await this.client
    .from('profiles')
    .select(col)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.[col] ?? 1000;
}
```

### Step 4.2: `analytics.service.ts`

```typescript
async getForUser(userId: string, mode: string): Promise<AnalyticsSummary> {
  const [eloEvents, questionEvents, currentElo] = await Promise.all([
    this.supabase.getEloHistoryRaw(userId, mode),
    this.supabase.getQuestionEventsRaw(userId, mode),
    this.supabase.getCurrentEloByMode(userId, mode),
  ]);
  return this.aggregate(questionEvents, eloEvents, currentElo);
}
```

### Step 4.3: `analytics.controller.ts`

```typescript
const VALID_MODES = ['solo', 'logo_quiz', 'logo_quiz_hardcore'] as const;

@UseGuards(AuthGuard)
@Get('me')
async me(
  @Req() req: Request & { user: { id: string } },
  @Query('mode') mode?: string,
): Promise<AnalyticsSummary> {
  const resolvedMode = VALID_MODES.includes(mode as any) ? mode! : 'solo';
  const status = await this.supabase.getProStatus(req.user.id);
  if (!status?.is_pro) throw new ForbiddenException('Pro subscription required');
  return this.analytics.getForUser(req.user.id, resolvedMode);
}
```

### Step 4.4: Tests

Update `analytics.service.spec.ts` to pass valid ISO dates (already done in PR #56) — the tests are mode-agnostic and should still pass.

---

## Task 5: Frontend — mode picker

### Step 5.1: `analytics-api.service.ts`

```typescript
getMySummary(mode: 'solo' | 'logo_quiz' | 'logo_quiz_hardcore' = 'solo'): Promise<AnalyticsSummary> {
  return firstValueFrom(
    this.http.get<AnalyticsSummary>(`${environment.apiUrl}/api/analytics/me?mode=${mode}`, {
      headers: { Authorization: `Bearer ${this.auth.session()?.access_token}` },
    }),
  );
}
```

### Step 5.2: `analytics.ts`

```typescript
type AnalyticsMode = 'solo' | 'logo_quiz' | 'logo_quiz_hardcore';

readonly mode = signal<AnalyticsMode>('solo');

async loadForMode(mode: AnalyticsMode): Promise<void> {
  this.loading.set(true);
  this.error.set(null);
  try {
    const data = await this.api.getMySummary(mode);
    this.summary.set(data);
  } catch (e: unknown) {
    this.error.set(e instanceof Error ? e.message : 'Failed to load analytics');
  } finally {
    this.loading.set(false);
  }
}

async ngOnInit(): Promise<void> {
  if (!this.auth.session()) { this.router.navigate(['/login']); return; }
  await this.pro.ensureLoaded();
  if (!this.pro.isPro()) { this.loading.set(false); return; }
  await this.loadForMode(this.mode());
}

selectMode(m: AnalyticsMode): void {
  if (m === this.mode()) return;
  this.mode.set(m);
  this.loadForMode(m);
}
```

### Step 5.3: `analytics.html`

Add mode picker above the totals section (inside the Pro branch):

```html
<nav class="mode-picker" role="tablist" aria-label="Analytics mode">
  <button
    type="button"
    role="tab"
    [class.active]="mode() === 'solo'"
    (click)="selectMode('solo')">Solo Ranked</button>
  <button
    type="button"
    role="tab"
    [class.active]="mode() === 'logo_quiz'"
    (click)="selectMode('logo_quiz')">Logo Quiz</button>
  <button
    type="button"
    role="tab"
    [class.active]="mode() === 'logo_quiz_hardcore'"
    (click)="selectMode('logo_quiz_hardcore')">Hardcore</button>
</nav>
```

### Step 5.4: `analytics.css`

```css
.mode-picker { display: flex; gap: 0.25rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 999px; padding: 0.25rem; margin-bottom: 1rem; width: fit-content; }
.mode-picker button { background: transparent; border: 0; color: #94a3b8; padding: 0.5rem 1rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease; }
.mode-picker button:hover { color: #e2e8f0; }
.mode-picker button.active { background: linear-gradient(135deg, #a78bfa, #818cf8); color: white; }
```

---

## Task 6: Ship

- [ ] Bump VERSION to `0.5.2.0`
- [ ] CHANGELOG entry (Changed — analytics now mode-specific)
- [ ] Push, open PR, merge, verify deploy

---

## Success criteria

- ✅ `/api/analytics/me?mode=solo` returns only solo rows; `?mode=logo_quiz` returns only logo quiz rows
- ✅ `current_elo` in the response matches the mode-specific column on profiles
- ✅ `peak_elo` is per-mode, not mixed
- ✅ UI picker defaults to Solo, switching triggers refetch
- ✅ Legacy rows (NULL mode) are excluded from per-mode views — shown as zero/empty if user only played pre-migration
