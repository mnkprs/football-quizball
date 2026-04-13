# Pro History & Question Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate match-history depth (10 free / 100 pro) and post-match question review (BR / 2-Player / Duel) on `profiles.is_pro`, stripping question data server-side and showing a shared upsell modal on free-tier clients.

**Architecture:** Backend resolves `is_pro` on every list/detail request and either expands `limit` or strips `detail_snapshot.questions` before returning. Frontend reads server-provided `questionsLocked` / `questionsAvailable` flags to choose between rendering content, showing a blurred/locked state with an upsell modal, or showing a neutral empty state for snapshot-less matches. New per-mode snapshot capture tasks extend `buildSnapshot` so BR and Duel match detail include questions + per-player answers.

**Tech Stack:** NestJS 10, Angular 20 standalone components + signals, Supabase Postgres (JSONB snapshots), existing `ProService.isPro` signal, existing subscription route.

**Branch:** `feat/pro-history-question-access` (already created).

---

## File Structure

**Backend — modify:**
- `backend/src/common/interfaces/match.interface.ts` — extend `MatchDetailSnapshot` with `questions`; add `questionsLocked`, `questionsAvailable`, `br_questions`, `duel_questions` to `MatchDetail`; extend `DuelQuestionDetail` with `host_answer`/`guest_answer`.
- `backend/src/match-history/match-history.service.ts` — gate `getHistory` limit; strip questions in `getMatchDetail`; extend `buildSnapshot` to cover duel/battle_royale/team_logo_battle.
- `backend/src/match-history/match-history.controller.ts` — add `AuthGuard` to `GET /:userId`; use requester id for gating.
- `backend/src/match-history/match-history.service.spec.ts` — new tests.
- `backend/src/duel/duel.service.ts` — persist `host_answer` / `guest_answer` inside each `DuelQuestionResult`.
- `backend/src/duel/duel.types.ts` — extend `DuelQuestionResult`.
- `backend/src/battle-royale/battle-royale.types.ts` — add `player_answers` to `BRPlayerRow`.
- `backend/src/battle-royale/battle-royale.service.ts` — append to `player_answers` on submit / timeout.
- `backend/src/supabase/supabase.service.ts` — already has `getProfile`; no changes; use it from match-history.

**Backend — create:**
- `supabase/migrations/20260413000000_pro_match_question_data.sql` — add `player_answers jsonb default '[]'` to `battle_royale_players`.

**Frontend — modify:**
- `frontend/src/app/core/match-history-api.service.ts` — add fields to `MatchDetail`.
- `frontend/src/app/features/match-detail/match-detail.ts` / `.html` / `.css` — render BR questions + Duel breakdown with pro gating; new `[tappable]` answer-grid cells.
- `frontend/src/app/shared/match-detail-modal/match-detail-modal.ts` / `.html` / `.css` — same gating for modal variant.

**Frontend — create:**
- `frontend/src/app/shared/pro-upsell-modal/pro-upsell-modal.ts` / `.html` / `.css` — shared modal component.
- `frontend/src/app/shared/answer-cell-popover/answer-cell-popover.ts` / `.html` / `.css` — popover for 2P cell taps (pro-only).

---

## Task 1: Backend — gate history depth on is_pro

**Files:**
- Modify: `backend/src/match-history/match-history.service.ts:57` (`getHistory`)
- Modify: `backend/src/match-history/match-history.controller.ts` (add `AuthGuard` to `GET /:userId`)
- Test: `backend/src/match-history/match-history.service.spec.ts`

- [ ] **Step 1: Write failing test for history limit**

Add to `match-history.service.spec.ts`:
```ts
describe('getHistory — pro gating', () => {
  it('uses limit 10 for non-pro users', async () => {
    const userId = 'u1';
    supabase.getProfile = jest.fn().mockResolvedValue({ id: userId, is_pro: false });
    supabase.getMatchHistory = jest.fn().mockResolvedValue([]);
    await service.getHistory(userId);
    expect(supabase.getMatchHistory).toHaveBeenCalledWith(userId, 10);
  });

  it('uses limit 100 for pro users', async () => {
    const userId = 'u1';
    supabase.getProfile = jest.fn().mockResolvedValue({ id: userId, is_pro: true });
    supabase.getMatchHistory = jest.fn().mockResolvedValue([]);
    await service.getHistory(userId);
    expect(supabase.getMatchHistory).toHaveBeenCalledWith(userId, 100);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `cd backend && npm run test -- match-history.service.spec`
Expected: FAIL (current impl ignores pro status, calls with 20).

- [ ] **Step 3: Implement gating in `getHistory`**

Replace `match-history.service.ts:57-59`:
```ts
async getHistory(userId: string) {
  const profile = await this.supabaseService.getProfile(userId);
  const limit = profile?.is_pro ? 100 : 10;
  return this.supabaseService.getMatchHistory(userId, limit);
}
```

- [ ] **Step 4: Re-run the test, confirm it passes**

Run: `cd backend && npm run test -- match-history.service.spec`
Expected: PASS.

- [ ] **Step 5: Add AuthGuard to history endpoint**

Replace `match-history.controller.ts` `getHistory` method:
```ts
@Get(':userId')
@UseGuards(AuthGuard)
async getHistory(
  @Request() req: { user: { id: string } },
  @Param('userId') userId: string,
) {
  // Only let a user fetch their own history (gating uses their is_pro)
  if (req.user.id !== userId) {
    return this.matchHistoryService.getHistory(req.user.id);
  }
  return this.matchHistoryService.getHistory(userId);
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/match-history/ 
git commit -m "feat(match-history): gate history depth on is_pro (10 free / 100 pro)"
```

---

## Task 2: Backend — extend snapshot + detail interfaces

**Files:**
- Modify: `backend/src/common/interfaces/match.interface.ts`
- Modify: `backend/src/duel/duel.types.ts`
- Modify: `frontend/src/app/core/match-history-api.service.ts` (mirror types)

- [ ] **Step 1: Extend DuelQuestionResult with player answers**

In `backend/src/duel/duel.types.ts` replace the `DuelQuestionResult` interface:
```ts
export interface DuelQuestionResult {
  index: number;
  winner: 'host' | 'guest' | null;
  question_text: string;
  correct_answer: string;
  is_pro_logo?: boolean;
  host_answer?: string | null;
  guest_answer?: string | null;
}
```

- [ ] **Step 2: Extend MatchDetailSnapshot and MatchDetail**

In `backend/src/common/interfaces/match.interface.ts` add/extend:
```ts
export interface BRQuestionDetail {
  index: number;
  text: string;
  correct_answer: string;
  per_player_answers?: Record<string, string>; // userId → answer
  your_answer?: string | null;
  was_correct?: boolean;
}

export interface MatchDetailSnapshot {
  players?: OnlinePlayerDetail[];
  board?: OnlineBoardCellDetail[][];
  categories?: Array<{ key: string; label: string }>;
  duel_questions?: DuelQuestionDetail[];
  br_questions?: BRQuestionDetail[];
}

export interface DuelQuestionDetail {
  index: number;
  winner: 'host' | 'guest' | null;
  question_text: string;
  correct_answer: string;
  is_pro_logo?: boolean;
  host_answer?: string | null;
  guest_answer?: string | null;
}

export interface MatchDetail extends MatchHistoryEntry {
  question_results?: DuelQuestionDetail[];
  board?: OnlineBoardCellDetail[][];
  players?: OnlinePlayerDetail[];
  categories?: Array<{ key: string; label: string }>;
  br_players?: BRPlayerDetail[];
  br_mode?: string;
  team_scores?: { team1: number; team2: number };
  mvp?: { username: string; score: number };
  // Pro-gating flags (server-controlled)
  questionsAvailable?: boolean;
  questionsLocked?: boolean;
  duel_questions?: DuelQuestionDetail[];
  br_questions?: BRQuestionDetail[];
}
```

- [ ] **Step 3: Mirror types in frontend api service**

In `frontend/src/app/core/match-history-api.service.ts` extend `DuelQuestionDetail` and `MatchDetail` to include the same new fields (`host_answer`, `guest_answer`, `questionsAvailable`, `questionsLocked`, `duel_questions`, `br_questions`). Add `BRQuestionDetail` interface with identical shape.

- [ ] **Step 4: Type-check**

Run: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/interfaces/match.interface.ts backend/src/duel/duel.types.ts frontend/src/app/core/match-history-api.service.ts
git commit -m "feat(match-history): extend match-detail types with pro flags and questions"
```

---

## Task 3: Backend — capture Duel player answers

**Files:**
- Modify: `backend/src/duel/duel.service.ts:395-410` (`submitAnswer` path) and `:580-595` (timeout path)

- [ ] **Step 1: Persist host/guest answer text on submit**

In `duel.service.ts` within the `submitAnswer` block around line 402, replace the `questionResult` construction. Locate:
```ts
      question_text: question.question_text,
      correct_answer: question.correct_answer,
```
Replace the enclosing literal with:
```ts
    const questionResult: DuelQuestionResult = {
      index: row.current_question_index,
      winner: isCorrect ? role : null,
      question_text: question.question_text,
      correct_answer: question.correct_answer,
      is_pro_logo: question.is_pro_logo ?? false,
      host_answer: role === 'host' ? dto.answer : null,
      guest_answer: role === 'guest' ? dto.answer : null,
    };
```
(If the literal already exists with other fields, only add the two new trailing fields.)

- [ ] **Step 2: Persist null answer text on timeout**

In `duel.service.ts` around line 584 (`timedOutResult`):
```ts
    const timedOutResult: DuelQuestionResult = {
      index: row.current_question_index,
      winner: null,
      question_text: question?.question_text ?? '',
      correct_answer: question?.correct_answer ?? '',
      is_pro_logo: question?.is_pro_logo ?? false,
      host_answer: null,
      guest_answer: null,
    };
```

- [ ] **Step 3: Type-check and run duel tests**

Run: `cd backend && npm run test -- duel.service.spec`
Expected: PASS (existing tests unaffected; new fields are optional).

- [ ] **Step 4: Commit**

```bash
git add backend/src/duel/duel.service.ts
git commit -m "feat(duel): persist host/guest answer text in question_results"
```

---

## Task 4: Backend — BR migration for player_answers

**Files:**
- Create: `supabase/migrations/20260413000000_pro_match_question_data.sql`

- [ ] **Step 1: Write migration**

```sql
-- 20260413000000_pro_match_question_data.sql
-- Store per-question answers for each battle royale player so pro users
-- can review their answers after the match.
alter table battle_royale_players
  add column if not exists player_answers jsonb not null default '[]';

-- Index unused for now; column access is only via match-detail path.
comment on column battle_royale_players.player_answers is
  'Array of { index, answer, is_correct } objects, appended on each submitAnswer call.';
```

- [ ] **Step 2: Apply migration**

Run: `supabase db push`
Expected: migration applied; column visible via `mcp__supabase__list_tables`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260413000000_pro_match_question_data.sql
git commit -m "feat(db): add player_answers column to battle_royale_players"
```

---

## Task 5: Backend — capture BR player answers on submit

**Files:**
- Modify: `backend/src/battle-royale/battle-royale.types.ts` (add field to `BRPlayerRow`)
- Modify: `backend/src/battle-royale/battle-royale.service.ts` (`submitAnswer` around line 431)

- [ ] **Step 1: Extend BRPlayerRow type**

In `battle-royale.types.ts`:
```ts
export interface BRPlayerAnswerEntry {
  index: number;
  answer: string;
  is_correct: boolean;
}

export interface BRPlayerRow {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  score: number;
  current_question_index: number;
  question_started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  team_id?: number | null;
  player_questions?: BRLogoPlayerQuestion[] | null;
  player_answers?: BRPlayerAnswerEntry[] | null;
}
```

- [ ] **Step 2: Append answer on submit**

In `battle-royale.service.ts` `submitAnswer`, after the existing update that increments `current_question_index` and `score`, add an atomic append of `{ index: questionIndex, answer, is_correct: isCorrect }` to `player_answers`. Concretely, extend the supabase update call that currently sets `current_question_index` and `score` to also include:
```ts
        player_answers: [
          ...(player.player_answers ?? []),
          { index: questionIndex, answer, is_correct: isCorrect },
        ],
```
The preceding `player` fetch must `.select(...)` include `player_answers`.

- [ ] **Step 3: Run BR tests**

Run: `cd backend && npm run test -- battle-royale.service.spec`
Expected: PASS (tests don't assert on the new column; optional field).

- [ ] **Step 4: Commit**

```bash
git add backend/src/battle-royale/
git commit -m "feat(battle-royale): persist per-player answers for match-detail review"
```

---

## Task 6: Backend — extend buildSnapshot for duel + BR

**Files:**
- Modify: `backend/src/match-history/match-history.service.ts` (`buildSnapshot` around line 165)
- Modify: `backend/src/match-history/match-history.controller.ts` (pass match_mode through for duel + br)

- [ ] **Step 1: Widen saveMatch match_mode**

In `match-history.controller.ts` the `match_mode` body type currently only allows `'local' | 'online'`. Replace with:
```ts
match_mode: 'local' | 'online' | 'duel' | 'battle_royale' | 'team_logo_battle';
```
And update the same signature in `match-history.service.ts` `saveMatch`.

- [ ] **Step 2: Extend buildSnapshot**

Replace `buildSnapshot` body in `match-history.service.ts`:
```ts
private async buildSnapshot(
  match_mode: string,
  game_ref_id: string | undefined,
): Promise<MatchDetailSnapshot | undefined> {
  if (!game_ref_id) return undefined;

  if (match_mode === 'local') {
    // ... existing local snapshot code unchanged ...
  }

  if (match_mode === 'duel') {
    const game = await this.supabaseService.getDuelGameById(game_ref_id);
    if (!game) return undefined;
    return {
      duel_questions: (game.question_results ?? []).map((r) => ({
        index: r.index,
        winner: r.winner,
        question_text: r.question_text,
        correct_answer: r.correct_answer,
        is_pro_logo: r.is_pro_logo,
        host_answer: r.host_answer ?? null,
        guest_answer: r.guest_answer ?? null,
      })),
    };
  }

  if (match_mode === 'battle_royale' || match_mode === 'team_logo_battle') {
    const { room, players } = await this.supabaseService.getBRRoomWithPlayers(game_ref_id);
    if (!room) return undefined;
    const questionTextByIndex = new Map<number, { text: string; correct: string }>();
    (room.questions ?? []).forEach((q: any, i: number) => {
      questionTextByIndex.set(i, { text: q.question_text ?? '', correct: q.correct_answer ?? '' });
    });
    // For team_logo, questions live per-player; fall back to empty text.
    const br_questions: BRQuestionDetail[] = [];
    const maxIndex = Math.max(0, ...(players.map((p: any) => (p.player_answers ?? []).length)));
    for (let i = 0; i < maxIndex; i++) {
      const q = questionTextByIndex.get(i);
      const per_player_answers: Record<string, string> = {};
      players.forEach((p: any) => {
        const entry = (p.player_answers ?? [])[i];
        if (entry) per_player_answers[p.user_id] = entry.answer;
      });
      br_questions.push({
        index: i,
        text: q?.text ?? '',
        correct_answer: q?.correct ?? '',
        per_player_answers,
      });
    }
    return { br_questions };
  }

  return undefined;
}
```

- [ ] **Step 3: Run unit tests**

Run: `cd backend && npm run test -- match-history.service.spec`
Expected: existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/match-history/
git commit -m "feat(match-history): snapshot duel + battle-royale question data at save time"
```

---

## Task 7: Backend — strip questions in getMatchDetail for non-pro

**Files:**
- Modify: `backend/src/match-history/match-history.service.ts` (`getMatchDetail`)
- Test: `backend/src/match-history/match-history.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Append to `match-history.service.spec.ts`:
```ts
describe('getMatchDetail — pro gating', () => {
  const matchId = 'm1';
  const userId = 'u1';
  beforeEach(() => {
    supabase.getMatchById = jest.fn().mockResolvedValue({
      id: matchId, player1_id: userId, player2_id: null,
      match_mode: 'duel', game_ref_id: 'g1', game_ref_type: 'duel',
      detail_snapshot: {
        duel_questions: [{ index: 0, winner: 'host', question_text: 'Q', correct_answer: 'A' }],
      },
    });
  });

  it('keeps questions for pro users and sets flags', async () => {
    supabase.getProfile = jest.fn().mockResolvedValue({ id: userId, is_pro: true });
    const detail = await service.getMatchDetail(matchId, userId);
    expect(detail.questionsAvailable).toBe(true);
    expect(detail.questionsLocked).toBe(false);
    expect(detail.duel_questions?.length).toBe(1);
  });

  it('strips questions for non-pro users and sets questionsLocked', async () => {
    supabase.getProfile = jest.fn().mockResolvedValue({ id: userId, is_pro: false });
    const detail = await service.getMatchDetail(matchId, userId);
    expect(detail.questionsAvailable).toBe(true);
    expect(detail.questionsLocked).toBe(true);
    expect(detail.duel_questions).toBeUndefined();
    expect(detail.question_results).toBeUndefined();
    expect(detail.br_questions).toBeUndefined();
  });

  it('sets questionsAvailable=false when snapshot missing questions', async () => {
    supabase.getMatchById = jest.fn().mockResolvedValue({
      id: matchId, player1_id: userId, player2_id: null,
      match_mode: 'duel', game_ref_id: null, game_ref_type: null,
      detail_snapshot: null,
    });
    supabase.getProfile = jest.fn().mockResolvedValue({ id: userId, is_pro: true });
    const detail = await service.getMatchDetail(matchId, userId);
    expect(detail.questionsAvailable).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `cd backend && npm run test -- match-history.service.spec`
Expected: FAIL (flags not set, no stripping).

- [ ] **Step 3: Implement gating in getMatchDetail**

At the end of `getMatchDetail` (just before each `return detail;`), add a finalize helper. Add this block immediately before the final `return detail;`:
```ts
    const profile = await this.supabaseService.getProfile(requestingUserId);
    const isPro = !!profile?.is_pro;
    const hasQuestions =
      (detail.duel_questions && detail.duel_questions.length > 0) ||
      (detail.br_questions && detail.br_questions.length > 0) ||
      (detail.question_results && detail.question_results.length > 0) ||
      (detail.board && detail.board.length > 0 && !!detail.players);

    detail.questionsAvailable = !!hasQuestions;
    detail.questionsLocked = !isPro;

    if (!isPro) {
      delete detail.duel_questions;
      delete detail.br_questions;
      delete detail.question_results;
    }
```
Also make sure the earlier `return detail;` branches fall through to this block — restructure the function so the two early `return detail;` lines (for local snapshot and for missing game_ref) instead `break;`/skip to the finalize block. The cleanest refactor: wrap the enrichment in `try/catch` but always reach the finalize logic at the bottom.

- [ ] **Step 4: Run tests, confirm they pass**

Run: `cd backend && npm run test -- match-history.service.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/match-history/
git commit -m "feat(match-history): strip questions server-side for non-pro users"
```

---

## Task 8: Frontend — ProUpsellModal shared component

**Files:**
- Create: `frontend/src/app/shared/pro-upsell-modal/pro-upsell-modal.ts`
- Create: `frontend/src/app/shared/pro-upsell-modal/pro-upsell-modal.html`
- Create: `frontend/src/app/shared/pro-upsell-modal/pro-upsell-modal.css`

- [ ] **Step 1: Write component**

`pro-upsell-modal.ts`:
```ts
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-pro-upsell-modal',
  standalone: true,
  templateUrl: './pro-upsell-modal.html',
  styleUrls: ['./pro-upsell-modal.css'],
})
export class ProUpsellModalComponent {
  @Input() open = false;
  @Input() title = 'Unlock Pro';
  @Input() body = 'See every question you played — upgrade to Pro.';
  @Output() dismiss = new EventEmitter<void>();

  private router = inject(Router);

  upgrade() {
    this.dismiss.emit();
    this.router.navigate(['/pro']);
  }
}
```

`pro-upsell-modal.html`:
```html
@if (open) {
  <div class="overlay" (click)="dismiss.emit()">
    <div class="sheet" (click)="$event.stopPropagation()">
      <div class="icon">🔒</div>
      <h2>{{ title }}</h2>
      <p>{{ body }}</p>
      <button class="primary" (click)="upgrade()">Upgrade</button>
      <button class="ghost" (click)="dismiss.emit()">Not now</button>
    </div>
  </div>
}
```

`pro-upsell-modal.css`:
```css
.overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: flex-end; justify-content: center; z-index: 1000;
}
.sheet {
  background: var(--color-surface, #1a1a1f); color: var(--color-text, #fff);
  width: 100%; max-width: 480px; border-radius: 20px 20px 0 0;
  padding: 24px; display: flex; flex-direction: column; gap: 12px; align-items: center;
}
.icon { font-size: 36px; }
h2 { margin: 0; font-size: 20px; }
p { margin: 0; text-align: center; opacity: 0.85; }
button { width: 100%; padding: 12px; border-radius: 12px; border: 0; font-weight: 600; }
.primary { background: var(--color-accent, #ffcc00); color: #111; }
.ghost { background: transparent; color: inherit; }
```

- [ ] **Step 2: Verify compile**

Run: `cd frontend && npx ng build --configuration development`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/shared/pro-upsell-modal/
git commit -m "feat(frontend): add shared pro-upsell-modal component"
```

---

## Task 9: Frontend — 2-Player answer-grid tap-to-reveal (pro) / upsell (free)

**Files:**
- Create: `frontend/src/app/shared/answer-cell-popover/answer-cell-popover.{ts,html,css}`
- Modify: `frontend/src/app/features/match-detail/match-detail.ts`
- Modify: `frontend/src/app/features/match-detail/match-detail.html`
- Modify: `frontend/src/app/features/match-detail/match-detail.css`
- Modify: `frontend/src/app/shared/match-detail-modal/match-detail-modal.{ts,html,css}` (same treatment)

- [ ] **Step 1: Create answer-cell-popover component**

`answer-cell-popover.ts`:
```ts
import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface AnswerCellDetail {
  category: string;
  difficulty: string;
  points: number;
  question?: string;
  correctAnswer?: string;
  player1Name?: string;
  player2Name?: string;
  player1Answer?: string;
  player2Answer?: string;
}

@Component({
  selector: 'app-answer-cell-popover',
  standalone: true,
  templateUrl: './answer-cell-popover.html',
  styleUrls: ['./answer-cell-popover.css'],
})
export class AnswerCellPopoverComponent {
  @Input() cell: AnswerCellDetail | null = null;
  @Output() dismiss = new EventEmitter<void>();
}
```

`answer-cell-popover.html`:
```html
@if (cell) {
  <div class="overlay" (click)="dismiss.emit()">
    <div class="sheet" (click)="$event.stopPropagation()">
      <div class="meta">{{ cell.category }} · {{ cell.difficulty }} · {{ cell.points }} pts</div>
      <h3>{{ cell.question || 'Question not available' }}</h3>
      <div class="row"><span>Correct</span><span>{{ cell.correctAnswer || '—' }}</span></div>
      @if (cell.player1Name) {
        <div class="row"><span>{{ cell.player1Name }}</span><span>{{ cell.player1Answer || '—' }}</span></div>
      }
      @if (cell.player2Name) {
        <div class="row"><span>{{ cell.player2Name }}</span><span>{{ cell.player2Answer || '—' }}</span></div>
      }
      <button class="ghost" (click)="dismiss.emit()">Close</button>
    </div>
  </div>
}
```

`answer-cell-popover.css`:
```css
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: flex-end; justify-content: center; z-index: 1000; }
.sheet { background: var(--color-surface, #1a1a1f); color: var(--color-text, #fff); width: 100%; max-width: 480px; border-radius: 20px 20px 0 0; padding: 20px; display: flex; flex-direction: column; gap: 8px; }
.meta { opacity: 0.6; font-size: 12px; text-transform: uppercase; }
h3 { margin: 4px 0 12px; font-size: 16px; }
.row { display: flex; justify-content: space-between; padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.08); }
button.ghost { margin-top: 12px; width: 100%; padding: 12px; border-radius: 12px; background: transparent; color: inherit; border: 1px solid rgba(255,255,255,0.15); }
```

- [ ] **Step 2: Wire into match-detail 2P section**

In `match-detail.ts`:
- Inject `ProService` and `MatchHistoryApiService` (already inject).
- Add signals: `selectedCell = signal<AnswerCellDetail | null>(null)`, `upsellOpen = signal(false)`.
- Import `ProUpsellModalComponent` and `AnswerCellPopoverComponent`.
- Add method:
```ts
onCellTap(cell: { category: string; difficulty: string; points: number; answered_by?: string }, r: number, c: number) {
  const detail = this.detail();
  if (!detail) return;
  if (detail.questionsLocked) { this.upsellOpen.set(true); return; }
  if (!detail.questionsAvailable) { return; }
  // Derive question text from snapshot; 2-Player uses `board_questions` — for now,
  // no per-cell text in the snapshot, so show a placeholder until we extend local snapshot.
  // (Out of scope for this feature in v1 — still open the popover with "Question not available".)
  this.selectedCell.set({
    category: cell.category,
    difficulty: cell.difficulty,
    points: cell.points,
    player1Name: detail.player1_username,
    player2Name: detail.player2_username,
    // TODO follow-up: add question_text per-cell in local snapshot.
  });
}
```

In `match-detail.html` where each answer-grid cell is rendered, add `(click)="onCellTap(cell, r, c)"` and `class="tappable"`. If free, the class adds a lock indicator.

In `match-detail.html` at the bottom, mount the modals:
```html
<app-answer-cell-popover [cell]="selectedCell()" (dismiss)="selectedCell.set(null)" />
<app-pro-upsell-modal [open]="upsellOpen()" (dismiss)="upsellOpen.set(false)" />
```

In `match-detail.css` add:
```css
.cell.tappable { cursor: pointer; position: relative; }
.cell.tappable.locked::after {
  content: '🔒';
  position: absolute; top: 4px; right: 4px; font-size: 12px; opacity: 0.7;
}
```
And in the template, bind `[class.locked]="detail()?.questionsLocked"`.

- [ ] **Step 3: Mirror in match-detail-modal**

Repeat the same tap/upsell wiring in `match-detail-modal.ts/.html/.css`.

- [ ] **Step 4: Build frontend**

Run: `cd frontend && npx ng build --configuration development`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/answer-cell-popover/ frontend/src/app/features/match-detail/ frontend/src/app/shared/match-detail-modal/
git commit -m "feat(match-detail): tappable 2P answer-grid cells (pro) / upsell (free)"
```

---

## Task 10: Frontend — BR questions section

**Files:**
- Modify: `frontend/src/app/features/match-detail/match-detail.{ts,html,css}`

- [ ] **Step 1: Render section in match-detail.html**

Below the BR leaderboard block, add:
```html
@if (isBR()) {
  <section class="questions-section">
    <h3>Questions</h3>

    @if (detail()?.questionsAvailable === false) {
      <div class="empty">Questions not available for this match.</div>
    } @else if (detail()?.questionsLocked) {
      <div class="locked" (click)="upsellOpen.set(true)">
        <div class="blur-stack">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="row skeleton"></div>
          }
        </div>
        <div class="overlay">
          <span class="lock">🔒</span>
          <span>Unlock question review with Pro</span>
        </div>
      </div>
    } @else {
      <ul class="br-questions">
        @for (q of detail()?.br_questions ?? []; track q.index) {
          <li>
            <div class="q">{{ q.text || 'Question ' + (q.index + 1) }}</div>
            <div class="a correct">✓ {{ q.correct_answer }}</div>
            @if (q.your_answer !== undefined && q.your_answer !== null) {
              <div class="a you" [class.wrong]="!q.was_correct">
                You: {{ q.your_answer || '—' }}
              </div>
            }
          </li>
        }
      </ul>
    }
  </section>
}
```

- [ ] **Step 2: Add isBR() + compute your_answer/was_correct**

In `match-detail.ts`:
```ts
isBR = computed(() =>
  ['battle_royale', 'team_logo_battle'].includes(this.detail()?.match_mode ?? '')
);

constructor() {
  effect(() => {
    const d = this.detail();
    if (!d?.br_questions || d.questionsLocked) return;
    const me = this.auth.user()?.id;
    if (!me) return;
    d.br_questions.forEach((q) => {
      q.your_answer = q.per_player_answers?.[me];
      q.was_correct = !!q.your_answer && q.your_answer === q.correct_answer;
    });
  });
}
```

- [ ] **Step 3: Style**

Append to `match-detail.css`:
```css
.questions-section { margin-top: 24px; }
.questions-section .locked { position: relative; cursor: pointer; }
.blur-stack .row.skeleton { height: 40px; margin-bottom: 8px; border-radius: 8px; background: rgba(255,255,255,0.06); filter: blur(3px); }
.questions-section .overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  background: rgba(0,0,0,0.35);
}
.questions-section .lock { font-size: 28px; }
.br-questions { list-style: none; padding: 0; }
.br-questions li { padding: 12px; background: var(--color-elevated, rgba(255,255,255,0.05)); border-radius: 12px; margin-bottom: 8px; }
.br-questions .q { font-weight: 600; }
.br-questions .a { font-size: 14px; opacity: 0.85; margin-top: 4px; }
.br-questions .a.you.wrong { color: #ff6b6b; }
.empty { opacity: 0.6; font-size: 14px; padding: 16px 0; }
```

- [ ] **Step 4: Build and visually test one pro and one non-pro fixture**

Run: `cd frontend && npx ng build --configuration development`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/match-detail/
git commit -m "feat(match-detail): add BR questions section with pro gating"
```

---

## Task 11: Frontend — Duel breakdown pro gating

**Files:**
- Modify: `frontend/src/app/features/match-detail/match-detail.{ts,html,css}`

- [ ] **Step 1: Wrap existing duel question breakdown**

In `match-detail.html` find the existing duel question_results rendering block. Wrap it:
```html
@if (isDuel()) {
  <section class="questions-section">
    <h3>Question Breakdown</h3>

    @if (detail()?.questionsAvailable === false) {
      <div class="empty">Questions not available for this match.</div>
    } @else if (detail()?.questionsLocked) {
      <div class="locked" (click)="upsellOpen.set(true)">
        <div class="blur-stack">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="row skeleton"></div>
          }
        </div>
        <div class="overlay">
          <span class="lock">🔒</span>
          <span>Unlock question review with Pro</span>
        </div>
      </div>
    } @else {
      <ul class="duel-questions">
        @for (q of detail()?.duel_questions ?? detail()?.question_results ?? []; track q.index) {
          <li>
            <div class="q">Q{{ q.index + 1 }}: {{ q.question_text }}</div>
            <div class="a correct">✓ {{ q.correct_answer }}</div>
            <div class="row">
              <span>{{ detail()?.player1_username }}</span>
              <span [class.right]="q.winner === 'host'">{{ q.host_answer || (q.winner === 'host' ? '✓' : '—') }}</span>
            </div>
            <div class="row">
              <span>{{ detail()?.player2_username }}</span>
              <span [class.right]="q.winner === 'guest'">{{ q.guest_answer || (q.winner === 'guest' ? '✓' : '—') }}</span>
            </div>
          </li>
        }
      </ul>
    }
  </section>
}
```

- [ ] **Step 2: Add isDuel() computed**

In `match-detail.ts`:
```ts
isDuel = computed(() => this.detail()?.match_mode === 'duel');
```

- [ ] **Step 3: Reuse existing .locked/.empty styles**

No new CSS beyond:
```css
.duel-questions { list-style: none; padding: 0; }
.duel-questions li { padding: 12px; background: var(--color-elevated, rgba(255,255,255,0.05)); border-radius: 12px; margin-bottom: 8px; }
.duel-questions .q { font-weight: 600; }
.duel-questions .a { margin-top: 4px; }
.duel-questions .row { display: flex; justify-content: space-between; font-size: 14px; opacity: 0.85; }
.duel-questions .right { color: #6bcf88; }
```

- [ ] **Step 4: Mount upsell modal at page root**

Ensure `<app-pro-upsell-modal [open]="upsellOpen()" (dismiss)="upsellOpen.set(false)" />` is mounted once at the bottom of `match-detail.html` (added in Task 9). Verify only one instance.

- [ ] **Step 5: Build**

Run: `cd frontend && npx ng build --configuration development`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/match-detail/
git commit -m "feat(match-detail): add pro gating to duel question breakdown"
```

---

## Task 12: E2E smoke

**Files:**
- Modify: `e2e-game-sim.mjs`

- [ ] **Step 1: Add assertion**

After the existing match-save flow, add a fetch of `GET /api/match-history/:userId/details/:matchId` using both a pro and non-pro test user. Assert:
- Pro response contains `duel_questions` (or `br_questions` depending on mode) and `questionsLocked === false`.
- Non-pro response has `questionsLocked === true` and no `duel_questions`/`br_questions`.

- [ ] **Step 2: Run**

Run: `node e2e-game-sim.mjs`
Expected: all assertions pass.

- [ ] **Step 3: Commit**

```bash
git add e2e-game-sim.mjs
git commit -m "test(e2e): assert pro gating in match-detail response"
```

---

## Final: Push branch and open PR

- [ ] **Step 1: Push**

```bash
git push -u origin feat/pro-history-question-access
```

- [ ] **Step 2: Open PR via /ship skill** (manual action by user)
