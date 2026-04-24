# Analytics Data Pipeline — Un-hide "Coming Soon" Widgets

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn off the "Coming soon" card on `/analytics` by wiring the real data pipeline for 3 breakdowns: category, era, and league tier. Ship when at least one breakdown has real data flowing end-to-end; the other two can land incrementally.

**Architecture:** Extend `elo_history` with a foreign key into `question_pool`, join on read, and reconstruct `analytics_tags` from the joined row. This is a single data-flow fix — not three — because all 3 widgets consume the same `RawQuestionEvent` DTO. Once the FK lands and the join works, all 3 widgets light up together.

**Tech Stack:** Supabase (Postgres), NestJS, Angular 20. No new dependencies.

**Context:** Builds on PR #56 (shipped 2026-04-15, v0.5.0.0). That PR shipped the analytics dashboard + metadata schema on `question_pool` + LLM-side tagging, but the data never reaches `AnalyticsService.aggregate()` because `elo_history` has no category column and no FK back to `question_pool`. This plan closes the gap.

---

## Scope decisions

**In scope:**
1. `elo_history.question_id` FK + backfill strategy (forward-only for new rows, null for legacy)
2. Join `elo_history` → `question_pool` in `getQuestionEventsRaw` so `analytics_tags` flows through
3. Extend `RawQuestionEvent` back to full shape (category + era + league_tier + competition_type)
4. Un-hide the 3 widgets in `analytics.html` + remove the "Coming soon" card
5. One-shot LLM backfill script for existing `question_pool` rows (optional — runs separately, doesn't block the shipped widgets)

**Out of scope (separate plans if needed):**
- Battle Royale (`BlitzQuestion`) tag propagation — BR uses a different draw path and rarely happens compared to solo/duel; tackle when BR usage justifies
- Player nationality breakdown — requires richer source data; not currently surfaced in the UI
- Per-game-mode analytics splits (solo vs duel vs BR) — different feature
- Advanced charts (heat maps, calendar views) — UI polish, do later
- Fixing Supabase migration tracking drift — separate concern

---

## File Structure

**New files:**
- `supabase/migrations/20260610000000_elo_history_question_id.sql` — FK + index
- `backend/scripts/backfill-question-pool-tags.ts` — optional one-shot LLM tagger for legacy pool rows

**Modified files:**
- `backend/src/supabase/supabase.service.ts` — `getQuestionEventsRaw` joins against `question_pool`
- `backend/src/analytics/analytics.types.ts` — un-narrow `RawQuestionEvent` to include tag fields
- `backend/src/analytics/analytics.service.spec.ts` — update test fixtures
- `backend/src/solo/solo.service.ts` (and any other RPC callers writing `elo_history` rows) — pass `question_id` into the insert
- Solo answer RPC migration: `commit_solo_answer_rpc` or whichever RPC writes `elo_history` — accept a `question_id` parameter
- `frontend/src/app/features/analytics/analytics.ts` — re-import the 3 widgets
- `frontend/src/app/features/analytics/analytics.html` — replace "Coming soon" card with the 3 widgets
- `frontend/src/app/features/analytics/widgets/category-heatmap.ts` — resurrect from git (was deleted in commit `a530ac7`)
- `frontend/src/app/features/analytics/widgets/era-breakdown.ts` — resurrect from git (was deleted in commit `a530ac7`)

**Shipped in PR #56, keep as-is:**
- `question_pool` metadata columns (migration `20260609100000`)
- `AnalyticsTags` interface + LLM tagger
- Aggregator (`AnalyticsService.aggregate`) — already handles all 5 tag fields

---

## Task 0: Pre-flight

- [ ] **Step 0.1: Create feature branch + worktree**

```bash
cd /Users/instashop/Projects/football-quizball
git worktree add ../football-quizball-analytics-data -b feat/analytics-data-pipeline
```

- [ ] **Step 0.2: Link Supabase in worktree**

```bash
cd /Users/instashop/Projects/football-quizball-analytics-data
supabase link --project-ref npwneqworgyclzaofuln
```

- [ ] **Step 0.3: Install deps**

```bash
cd backend && npm install
cd ../frontend && npm install
```

---

## Task 1: Migration — `elo_history.question_id` FK

**Files:**
- Create: `supabase/migrations/20260610000000_elo_history_question_id.sql`

- [ ] **Step 1.1: Write migration**

```sql
-- Add nullable FK from elo_history to question_pool so analytics can join
-- on question metadata (category, era, league_tier, competition_type, etc).
-- Nullable because legacy rows predate this column; they will bucket as "unknown".

ALTER TABLE elo_history
  ADD COLUMN IF NOT EXISTS question_id UUID REFERENCES question_pool(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_elo_history_question_id ON elo_history(question_id);
CREATE INDEX IF NOT EXISTS idx_elo_history_user_question ON elo_history(user_id, question_id);

COMMENT ON COLUMN elo_history.question_id IS 'Links the rated question back to question_pool for category/era/tier analytics. Null for legacy rows or LLM-fallback questions that never hit the pool.';
```

- [ ] **Step 1.2: Apply migration**

If timestamp drift still exists on remote (check `supabase migration list`), rename to a post-remote-head timestamp (same workaround as PR #56). Otherwise:

```bash
cd /Users/instashop/Projects/football-quizball-analytics-data
supabase db push
```

Expected: `Finished supabase db push.`

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/20260610000000_elo_history_question_id.sql
git commit -m "feat(analytics): add question_id FK to elo_history"
```

---

## Task 2: Write-side — pass `question_id` when inserting `elo_history` rows

**Files:**
- Modify: the SQL function that inserts into `elo_history` (find via `grep -r "INSERT INTO elo_history" supabase/migrations/`)
- Modify: `backend/src/solo/solo.service.ts` (and any other caller that triggers the RPC)
- Modify: any duel / game-end service that writes `elo_history`

- [ ] **Step 2.1: Audit existing write sites**

```bash
cd /Users/instashop/Projects/football-quizball-analytics-data
grep -rn "INSERT INTO elo_history\|insertEloHistory\|elo_history" backend/src/ | grep -i "insert\|rpc\|commit" | head -20
grep -rn "INSERT INTO elo_history\|insert_elo_history" supabase/migrations/ | head -10
```

List every insert site. At minimum expect: solo answer RPC, duel result processing, possibly battle royale.

- [ ] **Step 2.2: Extend the RPC signature**

Whichever SQL RPC writes `elo_history` (likely `commit_solo_answer_rpc` — see migration `20260318100000_commit_solo_answer_rpc.sql`), add a new parameter `p_question_id UUID DEFAULT NULL` and include it in the INSERT. New migration:

```sql
-- supabase/migrations/20260610000001_commit_solo_answer_rpc_question_id.sql
-- Extends the solo answer RPC to accept question_id so elo_history rows can join back to question_pool.
CREATE OR REPLACE FUNCTION commit_solo_answer_rpc(
  -- ... existing params ...
  p_question_id UUID DEFAULT NULL
) RETURNS ...
AS $$
BEGIN
  -- ... existing logic ...
  INSERT INTO elo_history (user_id, elo_before, elo_after, elo_change, question_difficulty, correct, timed_out, question_id)
  VALUES (p_user_id, v_elo_before, v_elo_after, v_elo_change, p_question_difficulty, p_correct, p_timed_out, p_question_id);
  -- ... existing logic ...
END;
$$ LANGUAGE plpgsql;
```

**⚠ CAREFUL:** Copy the EXISTING function body from its current migration and only add the new parameter + column in the INSERT. Don't drop unrelated logic.

- [ ] **Step 2.3: Update callers**

Every call site passes the current question's `id`. For solo (`backend/src/solo/solo.service.ts`):

```typescript
// Before the answer commit, session.currentQuestion.id is available.
await this.supabase.rpc('commit_solo_answer_rpc', {
  // ...existing params...
  p_question_id: session.currentQuestion.id,
});
```

Do the same for duel and any other caller. If a caller processes LLM-fallback questions that never went through the pool, pass `null` — that's the safe default.

- [ ] **Step 2.4: Commit**

```bash
git add supabase/migrations/20260610000001_commit_solo_answer_rpc_question_id.sql backend/src/solo/solo.service.ts backend/src/duel/
git commit -m "feat(analytics): write question_id to elo_history for tag join"
```

---

## Task 3: Read-side — join in `getQuestionEventsRaw`

**Files:**
- Modify: `backend/src/supabase/supabase.service.ts`
- Modify: `backend/src/analytics/analytics.types.ts`

- [ ] **Step 3.1: Restore full `RawQuestionEvent` shape**

In `analytics.types.ts`, re-add the optional tag fields that were narrowed in PR #56's /review fix:

```typescript
export interface RawQuestionEvent {
  created_at: string;
  correct: boolean;
  difficulty: string;
  category?: string;
  era?: string;
  competition_type?: string;
  league_tier?: number;
}
```

- [ ] **Step 3.2: Rewrite `getQuestionEventsRaw` with join**

In `supabase.service.ts`, replace the current implementation. Supabase's PostgREST syntax nests foreign-key joins — use it:

```typescript
async getQuestionEventsRaw(userId: string): Promise<RawQuestionEvent[]> {
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
```

**Note:** Supabase's nested select requires the FK to be declared in the schema (done in Task 1). If the FK isn't picked up, run `supabase db lint` or check the dashboard's API docs for the correct nested name.

- [ ] **Step 3.3: Update unit tests**

In `backend/src/analytics/analytics.service.spec.ts`, the existing tests already pass category/era values in the `RawQuestionEvent[]` — they just need to keep working with the extended interface. Run:

```bash
cd backend && npx jest analytics.service --no-coverage
```

Expected: 4/4 passing. If any test fails due to the re-added optional fields, fix the fixture.

- [ ] **Step 3.4: Integration smoke test**

Run the backend locally, hit `/api/analytics/me` with a Pro JWT, check the response shape:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/analytics/me | jq '.by_category, .by_era, .by_league_tier'
```

Expected: At least one bucket populated per breakdown (not all "unknown") for a Pro user with recent matches.

- [ ] **Step 3.5: Commit**

```bash
git add backend/src/supabase/supabase.service.ts backend/src/analytics/analytics.types.ts
git commit -m "feat(analytics): join question_pool metadata in getQuestionEventsRaw"
```

---

## Task 4: Frontend — un-hide the 3 widgets

**Files:**
- Resurrect: `frontend/src/app/features/analytics/widgets/category-heatmap.ts` (deleted in commit `a530ac7`)
- Resurrect: `frontend/src/app/features/analytics/widgets/era-breakdown.ts` (deleted in commit `a530ac7`)
- Modify: `frontend/src/app/features/analytics/analytics.ts`
- Modify: `frontend/src/app/features/analytics/analytics.html`
- Modify: `frontend/src/app/features/analytics/analytics.css` (remove `.coming-soon` block)

- [ ] **Step 4.1: Resurrect deleted widgets**

```bash
cd /Users/instashop/Projects/football-quizball-analytics-data
git show 857cae9:frontend/src/app/features/analytics/widgets/category-heatmap.ts > frontend/src/app/features/analytics/widgets/category-heatmap.ts
git show 857cae9:frontend/src/app/features/analytics/widgets/era-breakdown.ts > frontend/src/app/features/analytics/widgets/era-breakdown.ts
```

(Commit `857cae9` is the last commit before the widgets were deleted — the pre-/review state.)

- [ ] **Step 4.2: Re-import in container**

In `analytics.ts`, restore the full imports array:

```typescript
import { EloTrajectoryComponent } from './widgets/elo-trajectory';
import { CategoryHeatmapComponent } from './widgets/category-heatmap';
import { DifficultyBreakdownComponent } from './widgets/difficulty-breakdown';
import { EraBreakdownComponent } from './widgets/era-breakdown';
import { ProTeaserComponent } from './widgets/pro-teaser';

@Component({
  // ...
  imports: [
    CommonModule,
    EloTrajectoryComponent,
    CategoryHeatmapComponent,
    DifficultyBreakdownComponent,
    EraBreakdownComponent,
    ProTeaserComponent,
  ],
  // ...
})
```

**Note:** League tier breakdown uses the same `EraBreakdownComponent`-style horizontal bar. Either:
- **(A)** Create a new `LeagueTierBreakdownComponent` (copy `era-breakdown.ts`, swap the `LABELS` + `ORDER` constants for `tier_1`..`tier_5`), OR
- **(B)** Generalise `EraBreakdownComponent` to take `LABELS` / `ORDER` as inputs.

Recommend **(A)** — less abstraction, easier to read.

- [ ] **Step 4.3: Update template**

In `analytics.html`, replace the "Coming soon" section with the real widgets:

```html
<section class="grid">
  <app-elo-trajectory [data]="s.elo_trajectory" />
  <app-difficulty-breakdown [data]="s.by_difficulty" />
  <app-category-heatmap
    [data]="s.by_category"
    [strongest]="s.strongest"
    [weakest]="s.weakest" />
  <app-era-breakdown [data]="s.by_era" />
  <app-league-tier-breakdown [data]="s.by_league_tier" />
</section>
```

Delete the `<section class="coming-soon">` block entirely.

- [ ] **Step 4.4: Clean CSS**

In `analytics.css`, delete the `.coming-soon` and related selectors added in PR #56.

- [ ] **Step 4.5: Build + commit**

```bash
cd frontend && npm run build 2>&1 | tail -5
git add frontend/src/app/features/analytics/
git commit -m "feat(analytics): un-hide category, era, and league tier widgets"
```

---

## Task 5 (optional): LLM backfill for legacy `question_pool` rows

**Goal:** Tag the existing ~1000+ questions in `question_pool` that predate the tagging pipeline, so analytics has richer historical data.

**Trade-off:** ~$5–10 in Gemini Flash API cost. Can skip entirely — new questions populate organically, old ones stay "Uncategorized".

**Files:**
- Create: `backend/scripts/backfill-question-pool-tags.ts`

- [ ] **Step 5.1: Write the backfill script**

Batch-fetches untagged pool rows, runs each through the same prompt used in `solo-question.generator.ts`, writes tags back to the row. Resumable — only processes rows with all 5 tag columns NULL.

```typescript
// Pseudocode — implement following the pattern from generate-launch-post.ts
const untagged = await supabase.from('question_pool')
  .select('id, question_text, correct_answer, explanation')
  .is('league_tier', null)
  .is('era', null)
  .limit(100);

for (const row of untagged) {
  const tags = await callGeminiForTags(row);
  await supabase.from('question_pool')
    .update({ league_tier: tags.league_tier, era: tags.era, ... })
    .eq('id', row.id);
}
```

- [ ] **Step 5.2: Dry-run on 10 rows**

```bash
cd backend && npx ts-node scripts/backfill-question-pool-tags.ts --limit 10 --dry-run
```

Spot-check the LLM's tag assignments.

- [ ] **Step 5.3: Run full backfill**

```bash
npx ts-node scripts/backfill-question-pool-tags.ts --limit 5000
```

Monitor cost. Expect 20–60 min runtime + ~$5–10 cost at 1000 rows.

- [ ] **Step 5.4: Commit script + note results**

```bash
git add backend/scripts/backfill-question-pool-tags.ts
git commit -m "chore(analytics): one-shot LLM backfill for legacy question_pool tags"
```

---

## Task 6: Ship

- [ ] **Step 6.1: Run full test suite + build**

```bash
cd backend && npx jest --no-coverage 2>&1 | tail -5
cd ../frontend && npm run build 2>&1 | tail -5
```

Zero new regressions.

- [ ] **Step 6.2: Manual QA**

Play a few solo rounds to generate fresh `elo_history` rows with `question_id` populated. Visit `/analytics`. All 3 previously-hidden widgets should now show real data for those new rounds (older rounds bucket as "unknown" until backfill runs).

- [ ] **Step 6.3: Update version + CHANGELOG**

Bump VERSION to `0.5.1.0` (MICRO — data pipeline hookup, no new user-facing feature). Add a CHANGELOG entry:

```markdown
## [0.5.1.0] - YYYY-MM-DD

### Added
- **Category, era, and league tier breakdowns** now appear on the Pro Analytics dashboard. New rounds played from this version forward contribute to the breakdowns; older rounds bucket as "Uncategorized".

### Changed
- Removed the "Coming soon" placeholder card on `/analytics`.
```

- [ ] **Step 6.4: Open PR + deploy**

```bash
git push -u origin feat/analytics-data-pipeline
gh pr create --title "feat(analytics): un-hide category, era, and league tier widgets" --body "..."
```

Merge, wait for deploy, verify `/api/analytics/me` returns non-unknown buckets for `by_category`, `by_era`, `by_league_tier` for an active Pro user.

---

## Self-Review Checklist

- **Data flow:** Every `elo_history` insert site now passes `question_id`? Grep for `INSERT INTO elo_history` and any `insertEloHistory` helper calls, confirm 100% coverage.
- **Null safety:** Legacy rows have `question_id = NULL` — does the join gracefully degrade? Yes — LEFT JOIN semantics via the optional `.question_pool?.category` access. Legacy rows bucket as "unknown".
- **Supabase nested select:** The `question_pool:question_id (...)` syntax requires the FK. Verify via `supabase db lint` or the dashboard API inspector before running in prod.
- **BR still broken:** BR (`BlitzQuestion`) questions still don't carry `analytics_tags`. This plan does NOT fix BR. BR rounds continue to contribute "unknown" buckets. Future plan.
- **Backfill is optional:** Shipping without Task 5 is fine — analytics just lights up gradually as new rounds play. Task 5 is cheap insurance for faster UX for users who've already played a lot.

---

## Success criteria

- ✅ Any Pro user who plays at least 5 ranked rounds after this ships sees non-empty category/era/tier breakdowns on `/analytics`
- ✅ "Coming soon" card is gone
- ✅ No regressions on existing analytics (totals, ELO trajectory, difficulty)
- ✅ No schema drift on Supabase tracking after the 2 new migrations land
