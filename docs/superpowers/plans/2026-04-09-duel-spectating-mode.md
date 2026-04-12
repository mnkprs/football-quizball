# Online 2-Player Board Game with Live Spectating

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 2-player board game (currently local/same-device at `/game`) work online between two separate devices, with live spectating so the waiting player sees the opponent's question and attempts in real-time. In Top 5, the spectating player sees correct entries filling slots and wrong guesses as they happen.

**Architecture:** Create a new `online_games` Supabase table mirroring the local game session structure but with invite-code matchmaking and Realtime subscriptions. New `OnlineGameModule` in NestJS reuses existing `QuestionPoolService` and `AnswerValidator`. Frontend gets a new `/online-game` route with `OnlineGameStore` (Supabase Realtime) and components that support both active-turn and spectating phases. Every game mutation (select question, submit answer, submit Top 5 guess) writes to Supabase → Realtime broadcasts → opponent's client updates.

**Tech Stack:** NestJS backend, Angular 20 frontend with @ngrx/signals, Supabase Postgres + Realtime, TailwindCSS

---

## Current System Summary

**Local 2-player game** (`/game`): Turn-based board game on same device. 7 categories x 5 questions = 35 total. Players alternate picking questions from the board and answering. Categories include text Q&A, Higher/Lower, Logo Quiz, Player ID, Guess Score, Top 5, Geography. Power-ups: 50-50 lifeline (1/player), 2x double (1/player). Game ends when all answered or mathematical win. Session stored in Redis with 24h TTL.

**Key backend files (to reuse, not modify):**
- `backend/src/game/game.service.ts` — board generation, answer validation, Top 5 logic
- `backend/src/game/game.types.ts` — DTOs
- `backend/src/common/interfaces/game.interface.ts` — GameSession, Player, BoardCell, AnswerResult, Top5GuessResult
- `backend/src/questions/question-pool.service.ts` — `drawBoard()` for pulling 35 questions
- `backend/src/questions/validators/answer.validator.ts` — fuzzy answer matching

**Key frontend files (reference for templates):**
- `frontend/src/app/features/board/board.html` — board grid layout
- `frontend/src/app/features/question/question.html` — all question type templates (default, HOL, Logo, Player ID, Guess Score, Top 5)
- `frontend/src/app/features/question/result.html` — answer result display
- `frontend/src/app/features/results/results.html` — final results
- `frontend/src/app/core/game.store.ts` — local game state management

## Design Decisions

### Game Flow (Online)
1. **Create/Join** — Host creates game (gets invite code), guest joins by code
2. **Ready-up** — Both players confirm ready
3. **Board** — Active player picks a question cell. Opponent sees board but cannot pick.
4. **Active turn** — Active player sees question + input. Opponent sees question in read-only spectating mode.
5. **Spectating** — Waiting player sees the question text, opponent's wrong attempts live. For Top 5: sees slots filling and wrong guesses in real-time.
6. **Result** — Both players see the result (correct/wrong, points, correct answer).
7. **Turn switch** — Next player picks from board.
8. **Game end** — Final scores shown to both.

### Data Sync Strategy
- Game state lives in Supabase `online_games` table (not Redis)
- Every mutation (select question, answer, Top 5 guess) updates the row
- Supabase Realtime broadcasts UPDATE events to both clients
- Clients call `refreshGame()` on each Realtime event (same pattern as duels)
- Fallback polling every 15s

### Turn State Broadcasting
A `turn_state` JSONB column captures the active player's current state:
```json
{
  "questionId": "abc",
  "question": { /* public question data (no correct_answer) */ },
  "attempts": ["wrong guess 1"],
  "top5Progress": { "filledSlots": [...], "wrongGuesses": [...] },
  "phase": "answering" | "top5" | "result"
}
```
This is updated on every action and broadcast via Realtime. The spectating player renders from this.

### Top 5 Spectating
- Active player submits guesses one at a time (same as local)
- Each guess updates `turn_state.top5Progress` → Realtime fires
- Spectating player sees slots fill up and wrong guesses appear in real-time
- Top 5 allows **2 wrong guesses** before losing (same as local mode)

### Turn Timeout
- 90-second turn timer (pick question + answer it)
- If active player doesn't answer within 90s, question is forfeited (0 points), turn switches
- Backend cron checks for stale turns every 30s

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260410000000_create_online_games.sql` | Online games table with Realtime |
| Create | `backend/src/online-game/online-game.module.ts` | NestJS module |
| Create | `backend/src/online-game/online-game.types.ts` | DTOs and interfaces |
| Create | `backend/src/online-game/online-game.service.ts` | Game logic (create, join, answer, Top 5) |
| Create | `backend/src/online-game/online-game.controller.ts` | REST endpoints |
| Create | `backend/src/online-game/online-game-timeout.service.ts` | Turn timeout cron |
| Create | `frontend/src/app/features/online-game/online-game-api.service.ts` | HTTP calls |
| Create | `frontend/src/app/features/online-game/online-game.store.ts` | State + Realtime subscriptions |
| Create | `frontend/src/app/features/online-game/online-game.ts` | Main component (lobby + game) |
| Create | `frontend/src/app/features/online-game/online-game.html` | Template (board, question, spectate, result) |
| Create | `frontend/src/app/features/online-game/online-game.css` | Styles |
| Modify | `frontend/src/app/app.routes.ts` | Add `/online-game` route |
| Modify | `backend/src/app.module.ts` | Import OnlineGameModule |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260410000000_create_online_games.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Online 2-Player Board Game: remote play with live spectating
CREATE TABLE online_games (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code           TEXT UNIQUE NOT NULL,
  host_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  guest_id              UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'waiting'
                          CHECK (status IN ('waiting','active','finished','abandoned')),

  -- Player state
  players               JSONB NOT NULL DEFAULT '[]',
  -- [{name, score, lifelineUsed, doubleUsed}]

  current_player_index  INT NOT NULL DEFAULT 0,

  -- Board: 7x5 grid (JSONB array of arrays)
  board                 JSONB NOT NULL DEFAULT '[]',

  -- Questions: all 35 with correct_answer (server-side only)
  questions             JSONB NOT NULL DEFAULT '[]',

  -- Per-question Top 5 progress
  top5_progress         JSONB NOT NULL DEFAULT '{}',

  -- Pool question IDs for return-to-pool on abandon
  pool_question_ids     TEXT[] NOT NULL DEFAULT '{}',

  -- Ready-up flags
  host_ready            BOOLEAN NOT NULL DEFAULT false,
  guest_ready           BOOLEAN NOT NULL DEFAULT false,

  -- Turn state: broadcast to opponent for spectating
  -- { questionId, question (public), attempts, top5Progress, phase }
  turn_state            JSONB,

  -- Last result: shown to both players after answer
  -- { correct, correct_answer, explanation, points_awarded, player_scores }
  last_result           JSONB,

  -- Turn timeout tracking
  turn_started_at       TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_online_games_host  ON online_games (host_id, status);
CREATE INDEX idx_online_games_guest ON online_games (guest_id, status);

ALTER TABLE online_games ENABLE ROW LEVEL SECURITY;

-- Players can read their own games
CREATE POLICY "online_game_players_select" ON online_games
  FOR SELECT USING (auth.uid() = host_id OR auth.uid() = guest_id);

-- Host can create
CREATE POLICY "online_game_host_insert" ON online_games
  FOR INSERT WITH CHECK (auth.uid() = host_id);

-- All mutations go through backend (service role)

-- Realtime
ALTER TABLE online_games REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE online_games;
```

- [ ] **Step 2: Apply the migration**

Run via Supabase MCP `execute_sql` or:
```bash
cd /Users/instashop/Projects/football-quizball && npx supabase db push
```

- [ ] **Step 3: Verify table exists**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'online_games'
ORDER BY ordinal_position;
```

Expected: All columns present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260410000000_create_online_games.sql
git commit -m "feat: add online_games table for remote 2-player board game"
```

---

## Task 2: Backend Types

**Files:**
- Create: `backend/src/online-game/online-game.types.ts`

- [ ] **Step 1: Create the types file**

```typescript
import { IsString, IsOptional, IsInt, IsBoolean, MaxLength, Min, IsIn, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { GeneratedQuestion, Top5Entry, Top5Progress } from '../questions/question.types';

// ── DB Row ──────────────────────────────────────────────────────────────────

export interface OnlineGamePlayer {
  name: string;
  score: number;
  lifelineUsed: boolean;
  doubleUsed: boolean;
}

export interface OnlineBoardCell {
  question_id: string;
  category: string;
  difficulty: string;
  points: number;
  answered: boolean;
  answered_by?: string;
  points_awarded?: number;
  lifeline_applied?: boolean;
  double_armed?: boolean;
}

export interface OnlineTurnState {
  questionId: string;
  question: OnlinePublicQuestion;
  attempts: string[];
  top5Progress: Top5Progress | null;
  phase: 'answering' | 'top5' | 'result';
}

export interface OnlineLastResult {
  questionId: string;
  correct: boolean;
  correct_answer: string;
  explanation: string;
  points_awarded: number;
  player_scores: [number, number];
  lifeline_used: boolean;
  double_used: boolean;
  // Top 5 specifics (optional)
  top5Won?: boolean;
  top5FilledSlots?: Array<{ name: string; stat: string } | null>;
  top5WrongGuesses?: Array<{ name: string; stat: string }>;
}

export interface OnlineGameRow {
  id: string;
  invite_code: string;
  host_id: string;
  guest_id: string | null;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  players: [OnlineGamePlayer, OnlineGamePlayer];
  current_player_index: 0 | 1;
  board: OnlineBoardCell[][];
  questions: GeneratedQuestion[];
  top5_progress: Record<string, Top5Progress>;
  pool_question_ids: string[];
  host_ready: boolean;
  guest_ready: boolean;
  turn_state: OnlineTurnState | null;
  last_result: OnlineLastResult | null;
  turn_started_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Public View (sent to client) ────────────────────────────────────────────

export interface OnlinePublicQuestion {
  id: string;
  question_text: string;
  category: string;
  difficulty: string;
  image_url?: string;
  fifty_fifty_applicable?: boolean;
  meta?: Record<string, unknown>;
}

export interface OnlinePublicView {
  id: string;
  inviteCode: string;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  myRole: 'host' | 'guest';
  myPlayerIndex: 0 | 1;
  players: [OnlineGamePlayer, OnlineGamePlayer];
  currentPlayerIndex: 0 | 1;
  board: OnlineBoardCell[][];
  categories: Array<{ key: string; label: string }>;
  hostReady: boolean;
  guestReady: boolean;
  /** The active player's current turn state (for spectating) */
  turnState: OnlineTurnState | null;
  /** Last question result (shown to both players) */
  lastResult: OnlineLastResult | null;
}

// ── DTOs ────────────────────────────────────────────────────────────────────

export class CreateOnlineGameDto {
  @IsString()
  @MaxLength(100)
  playerName: string;
}

export class JoinOnlineGameDto {
  @IsString()
  @MaxLength(10)
  inviteCode: string;

  @IsString()
  @MaxLength(100)
  playerName: string;
}

export class SelectQuestionDto {
  @IsString()
  questionId: string;
}

export class SubmitOnlineAnswerDto {
  @IsString()
  questionId: string;

  @IsString()
  @MaxLength(500)
  answer: string;

  @IsOptional()
  @IsBoolean()
  useDouble?: boolean;
}

export class UseOnlineLifelineDto {
  @IsString()
  questionId: string;
}

export class OnlineTop5GuessDto {
  @IsString()
  questionId: string;

  @IsString()
  @MaxLength(500)
  answer: string;

  @IsOptional()
  @IsBoolean()
  useDouble?: boolean;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/online-game/online-game.types.ts
git commit -m "feat: add online game types and DTOs"
```

---

## Task 3: Backend Service — Core Game Logic

**Files:**
- Create: `backend/src/online-game/online-game.service.ts`

This is the largest task. The service handles: create, join, ready-up, select question, submit answer, Top 5 guesses, lifeline, end game. Every mutation writes to Supabase (triggering Realtime).

- [ ] **Step 1: Create the service with constructor and imports**

```typescript
import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionPoolService } from '../questions/question-pool.service';
import { AnswerValidator } from '../questions/validators/answer.validator';
import {
  GeneratedQuestion,
  CATEGORY_LABELS,
  CATEGORY_DIFFICULTY_SLOTS,
  CATEGORY_SLOT_POINTS,
  DIFFICULTY_POINTS,
  Top5Entry,
} from '../questions/question.types';
import {
  OnlineGameRow,
  OnlineGamePlayer,
  OnlineBoardCell,
  OnlinePublicView,
  OnlinePublicQuestion,
  OnlineTurnState,
  OnlineLastResult,
  CreateOnlineGameDto,
  JoinOnlineGameDto,
  SelectQuestionDto,
  SubmitOnlineAnswerDto,
  UseOnlineLifelineDto,
  OnlineTop5GuessDto,
} from './online-game.types';
import type { Top5Progress } from '../questions/question.types';

const CATEGORIES_ORDER = ['HISTORY', 'PLAYER_ID', 'HIGHER_OR_LOWER', 'GUESS_SCORE', 'TOP_5', 'GEOGRAPHY', 'LOGO_QUIZ'] as const;
const TURN_TIMEOUT_MS = 90_000; // 90 seconds per turn

@Injectable()
export class OnlineGameService {
  private readonly logger = new Logger(OnlineGameService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly questionPoolService: QuestionPoolService,
    private readonly answerValidator: AnswerValidator,
  ) {}
```

- [ ] **Step 2: Add `createGame` method**

```typescript
  async createGame(userId: string, dto: CreateOnlineGameDto): Promise<OnlinePublicView> {
    const inviteCode = this.generateInviteCode();

    // Draw board questions (same as local game)
    const result = await this.questionPoolService.drawBoard([], true, [userId]);
    const questions = result.questions;
    const poolQuestionIds = result.poolQuestionIds;

    void this.questionPoolService.refillIfNeeded().catch((err) =>
      this.logger.error(`[createGame] Pool refill failed: ${(err as Error).message}`),
    );

    const players: [OnlineGamePlayer, OnlineGamePlayer] = [
      { name: dto.playerName, score: 0, lifelineUsed: false, doubleUsed: false },
      { name: '???', score: 0, lifelineUsed: false, doubleUsed: false },
    ];

    const usedQuestionIds = new Set<string>();
    const board = CATEGORIES_ORDER.map((category) => {
      const slots = CATEGORY_DIFFICULTY_SLOTS[category];
      const slotPoints = CATEGORY_SLOT_POINTS[category];
      return slots.map((difficulty, slotIndex) => {
        const question = questions.find(
          (q) => q.category === category && q.difficulty === difficulty && !usedQuestionIds.has(q.id),
        );
        if (question) usedQuestionIds.add(question.id);
        const points = slotPoints?.[slotIndex] ?? question?.points ?? DIFFICULTY_POINTS[difficulty];
        return {
          question_id: question?.id || '',
          category,
          difficulty,
          points,
          answered: false,
        } as OnlineBoardCell;
      });
    });

    const username = await this.getUsername(userId);

    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .insert({
        invite_code: inviteCode,
        host_id: userId,
        players: [{ ...players[0], name: username }, players[1]],
        board,
        questions,
        pool_question_ids: poolQuestionIds,
        top5_progress: {},
        turn_state: null,
        last_result: null,
      })
      .select('*')
      .single();

    if (error || !data) throw new BadRequestException(`Failed to create game: ${error?.message}`);

    return this.toPublicView(data as OnlineGameRow, userId);
  }

  private generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  private async getUsername(userId: string): Promise<string> {
    const profile = await this.supabaseService.getProfile(userId);
    return profile?.username ?? 'Player';
  }
```

- [ ] **Step 3: Add `joinGame` and `markReady` methods**

```typescript
  async joinGame(userId: string, dto: JoinOnlineGameDto): Promise<OnlinePublicView> {
    const { data: row, error } = await this.supabaseService.client
      .from('online_games')
      .select('*')
      .eq('invite_code', dto.inviteCode.toUpperCase())
      .eq('status', 'waiting')
      .is('guest_id', null)
      .single();

    if (error || !row) throw new NotFoundException('Game not found or already full.');
    if (row.host_id === userId) throw new BadRequestException('Cannot join your own game.');

    const username = await this.getUsername(userId);
    const players = [...row.players] as [OnlineGamePlayer, OnlineGamePlayer];
    players[1] = { name: username, score: 0, lifelineUsed: false, doubleUsed: false };

    const { data: updated, error: updateError } = await this.supabaseService.client
      .from('online_games')
      .update({
        guest_id: userId,
        players,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .is('guest_id', null) // CAS
      .select('*')
      .single();

    if (updateError || !updated) throw new ConflictException('Game was already joined.');
    return this.toPublicView(updated as OnlineGameRow, userId);
  }

  async markReady(userId: string, gameId: string): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);
    if (row.status !== 'waiting') throw new BadRequestException('Game is not in waiting state.');

    const isHost = row.host_id === userId;
    const readyField = isHost ? 'host_ready' : 'guest_ready';
    const otherReady = isHost ? row.guest_ready : row.host_ready;

    const updates: Record<string, unknown> = {
      [readyField]: true,
      updated_at: new Date().toISOString(),
    };

    // If both ready, start the game
    if (otherReady) {
      updates['status'] = 'active';
      updates['turn_started_at'] = new Date().toISOString();
    }

    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .update(updates)
      .eq('id', gameId)
      .select('*')
      .single();

    if (error || !data) throw new BadRequestException('Failed to mark ready.');
    return this.toPublicView(data as OnlineGameRow, userId);
  }
```

- [ ] **Step 4: Add `selectQuestion` method**

This is called when the active player picks a question from the board. It updates `turn_state` so the opponent sees the question.

```typescript
  async selectQuestion(userId: string, gameId: string, dto: SelectQuestionDto): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);
    this.assertActive(row);
    this.assertMyTurn(row, userId);

    if (row.turn_state?.phase === 'answering' || row.turn_state?.phase === 'top5') {
      throw new BadRequestException('Already answering a question.');
    }

    const question = row.questions.find((q: GeneratedQuestion) => q.id === dto.questionId);
    if (!question) throw new NotFoundException('Question not found.');

    const cell = row.board.flat().find((c: OnlineBoardCell) => c.question_id === dto.questionId);
    if (!cell) throw new NotFoundException('Board cell not found.');
    if (cell.answered) throw new BadRequestException('Question already answered.');

    const isTop5 = question.category === 'TOP_5';
    const publicQuestion = this.toPublicQuestion(question);

    const turnState: OnlineTurnState = {
      questionId: question.id,
      question: publicQuestion,
      attempts: [],
      top5Progress: isTop5 ? (row.top5_progress[question.id] ?? {
        filledSlots: [null, null, null, null, null],
        wrongGuesses: [],
        complete: false,
        won: false,
      }) : null,
      phase: isTop5 ? 'top5' : 'answering',
    };

    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .update({
        turn_state: turnState,
        last_result: null,
        turn_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .select('*')
      .single();

    if (error || !data) throw new BadRequestException('Failed to select question.');
    return this.toPublicView(data as OnlineGameRow, userId);
  }
```

- [ ] **Step 5: Add `submitAnswer` method**

```typescript
  async submitAnswer(userId: string, gameId: string, dto: SubmitOnlineAnswerDto): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);
    this.assertActive(row);
    this.assertMyTurn(row, userId);

    if (!row.turn_state || row.turn_state.questionId !== dto.questionId) {
      throw new BadRequestException('No active question or question mismatch.');
    }

    const question = row.questions.find((q: GeneratedQuestion) => q.id === dto.questionId);
    if (!question) throw new NotFoundException('Question not found.');

    const cell = row.board.flat().find((c: OnlineBoardCell) => c.question_id === dto.questionId);
    if (!cell || cell.answered) throw new BadRequestException('Cell not found or already answered.');

    const playerIndex = row.current_player_index;
    const player = row.players[playerIndex];

    const correct = this.answerValidator.validate(question, dto.answer);

    if (!correct) {
      // Record wrong attempt for spectating (broadcast via Realtime)
      const newAttempts = [...(row.turn_state.attempts ?? []), dto.answer];
      const updatedTurnState: OnlineTurnState = { ...row.turn_state, attempts: newAttempts };

      await this.supabaseService.client
        .from('online_games')
        .update({ turn_state: updatedTurnState, updated_at: new Date().toISOString() })
        .eq('id', gameId);

      // Re-fetch and return so client gets the updated state
      const updated = await this.fetchGame(gameId, userId);
      return this.toPublicView(updated, userId);
    }

    // Correct answer — score, mark cell, switch turns
    const lifelineUsed = !!cell.lifeline_applied;
    const doubleApplied = !!dto.useDouble && !player.doubleUsed;
    const basePoints = cell.points;
    const pointsAwarded = doubleApplied ? basePoints * 2 : basePoints;

    const newPlayers = [...row.players] as [OnlineGamePlayer, OnlineGamePlayer];
    newPlayers[playerIndex] = {
      ...player,
      score: player.score + pointsAwarded,
      ...(doubleApplied ? { doubleUsed: true } : {}),
    };

    const newBoard = row.board.map((boardRow: OnlineBoardCell[]) =>
      boardRow.map((c: OnlineBoardCell) =>
        c.question_id === dto.questionId
          ? { ...c, answered: true, answered_by: player.name, points_awarded: pointsAwarded, ...(doubleApplied ? { double_armed: true } : {}) }
          : c,
      ),
    );

    const nextPlayerIndex = (playerIndex === 0 ? 1 : 0) as 0 | 1;
    const allAnswered = newBoard.flat().every((c: OnlineBoardCell) => c.answered);
    const gameFinished = allAnswered || this.isMathematicallyWon(newPlayers, newBoard);

    const lastResult: OnlineLastResult = {
      questionId: dto.questionId,
      correct: true,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      points_awarded: pointsAwarded,
      player_scores: [newPlayers[0].score, newPlayers[1].score],
      lifeline_used: lifelineUsed,
      double_used: doubleApplied,
    };

    if (gameFinished) {
      await this.returnQuestionsToPool(row.pool_question_ids);
    }

    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .update({
        players: newPlayers,
        board: newBoard,
        current_player_index: nextPlayerIndex,
        turn_state: null,
        last_result: lastResult,
        ...(gameFinished ? { status: 'finished' } : {}),
        turn_started_at: gameFinished ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .select('*')
      .single();

    if (error || !data) throw new BadRequestException('Failed to submit answer.');
    return this.toPublicView(data as OnlineGameRow, userId);
  }
```

- [ ] **Step 6: Add `submitTop5Guess` method**

```typescript
  async submitTop5Guess(userId: string, gameId: string, dto: OnlineTop5GuessDto): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);
    this.assertActive(row);
    this.assertMyTurn(row, userId);

    if (!row.turn_state || row.turn_state.questionId !== dto.questionId || row.turn_state.phase !== 'top5') {
      throw new BadRequestException('No active Top 5 question.');
    }

    const question = row.questions.find((q: GeneratedQuestion) => q.id === dto.questionId);
    if (!question) throw new NotFoundException('Question not found.');

    const cell = row.board.flat().find((c: OnlineBoardCell) => c.question_id === dto.questionId);
    if (!cell || cell.answered) throw new BadRequestException('Cell not found or already answered.');

    const top5Entries = question.meta?.['top5'] as Top5Entry[];
    const progressKey = dto.questionId;

    // Get or init progress
    let progress: Top5Progress = row.top5_progress[progressKey] ?? {
      filledSlots: [null, null, null, null, null],
      wrongGuesses: [],
      complete: false,
      won: false,
    };

    const matchedIndex = this.answerValidator.matchTop5Entry(top5Entries, dto.answer);

    if (matchedIndex >= 0) {
      const entry = top5Entries[matchedIndex];
      if (progress.filledSlots[matchedIndex] === null) {
        progress.filledSlots[matchedIndex] = { name: entry.name, stat: entry.stat };
      }
    } else {
      progress.wrongGuesses.push({ name: dto.answer, stat: '' });
    }

    const filledCount = progress.filledSlots.filter(Boolean).length;
    const wrongCount = progress.wrongGuesses.length;
    const complete = filledCount === 5 || wrongCount >= 2;

    // Update turn_state for live spectating
    const updatedTurnState: OnlineTurnState = {
      ...row.turn_state,
      top5Progress: progress,
    };

    if (complete) {
      progress.complete = true;
      progress.won = filledCount === 5;

      const playerIndex = row.current_player_index;
      const player = row.players[playerIndex];
      const doubleApplied = !!dto.useDouble && !player.doubleUsed;
      const basePoints = progress.won ? cell.points : 0;
      const pointsAwarded = progress.won && doubleApplied ? basePoints * 2 : basePoints;

      const newPlayers = [...row.players] as [OnlineGamePlayer, OnlineGamePlayer];
      newPlayers[playerIndex] = {
        ...player,
        score: player.score + pointsAwarded,
        ...(doubleApplied ? { doubleUsed: true } : {}),
      };

      const newBoard = row.board.map((boardRow: OnlineBoardCell[]) =>
        boardRow.map((c: OnlineBoardCell) =>
          c.question_id === dto.questionId
            ? { ...c, answered: true, answered_by: player.name, points_awarded: pointsAwarded }
            : c,
        ),
      );

      const nextPlayerIndex = (playerIndex === 0 ? 1 : 0) as 0 | 1;
      const allAnswered = newBoard.flat().every((c: OnlineBoardCell) => c.answered);
      const gameFinished = allAnswered || this.isMathematicallyWon(newPlayers, newBoard);

      const newTop5Progress = { ...row.top5_progress, [progressKey]: progress };

      const lastResult: OnlineLastResult = {
        questionId: dto.questionId,
        correct: progress.won,
        correct_answer: question.correct_answer,
        explanation: question.explanation,
        points_awarded: pointsAwarded,
        player_scores: [newPlayers[0].score, newPlayers[1].score],
        lifeline_used: false,
        double_used: doubleApplied,
        top5Won: progress.won,
        top5FilledSlots: progress.filledSlots,
        top5WrongGuesses: progress.wrongGuesses,
      };

      if (gameFinished) {
        await this.returnQuestionsToPool(row.pool_question_ids);
      }

      const { data, error } = await this.supabaseService.client
        .from('online_games')
        .update({
          players: newPlayers,
          board: newBoard,
          current_player_index: nextPlayerIndex,
          top5_progress: newTop5Progress,
          turn_state: null,
          last_result: lastResult,
          ...(gameFinished ? { status: 'finished' } : {}),
          turn_started_at: gameFinished ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId)
        .select('*')
        .single();

      if (error || !data) throw new BadRequestException('Failed to complete Top 5.');
      return this.toPublicView(data as OnlineGameRow, userId);
    }

    // Not complete — just update turn_state for spectating
    const newTop5Progress = { ...row.top5_progress, [progressKey]: progress };

    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .update({
        turn_state: updatedTurnState,
        top5_progress: newTop5Progress,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .select('*')
      .single();

    if (error || !data) throw new BadRequestException('Failed to update Top 5 guess.');
    return this.toPublicView(data as OnlineGameRow, userId);
  }
```

- [ ] **Step 7: Add `useLifeline` method**

```typescript
  async useLifeline(userId: string, gameId: string, dto: UseOnlineLifelineDto): Promise<{ options: string[]; points_if_correct: number }> {
    const row = await this.fetchGame(gameId, userId);
    this.assertActive(row);
    this.assertMyTurn(row, userId);

    const playerIndex = row.current_player_index;
    const player = row.players[playerIndex];
    if (player.lifelineUsed) throw new BadRequestException('50-50 already used.');

    const question = row.questions.find((q: GeneratedQuestion) => q.id === dto.questionId);
    if (!question) throw new NotFoundException('Question not found.');
    if (!question.fifty_fifty_applicable || !question.fifty_fifty_hint) {
      throw new BadRequestException('50-50 not applicable.');
    }

    const newPlayers = [...row.players] as [OnlineGamePlayer, OnlineGamePlayer];
    newPlayers[playerIndex] = { ...player, lifelineUsed: true };

    const newBoard = row.board.map((boardRow: OnlineBoardCell[]) =>
      boardRow.map((c: OnlineBoardCell) =>
        c.question_id === dto.questionId ? { ...c, points: 1, lifeline_applied: true } : c,
      ),
    );

    await this.supabaseService.client
      .from('online_games')
      .update({ players: newPlayers, board: newBoard, updated_at: new Date().toISOString() })
      .eq('id', gameId);

    const options = [question.correct_answer, question.fifty_fifty_hint];
    if (Math.random() < 0.5) options.reverse();

    return { options, points_if_correct: 1 };
  }
```

- [ ] **Step 8: Add helper methods**

```typescript
  async getGame(userId: string, gameId: string): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);
    return this.toPublicView(row, userId);
  }

  async abandonGame(userId: string, gameId: string): Promise<{ ok: boolean }> {
    const row = await this.fetchGame(gameId, userId);
    if (row.status === 'finished' || row.status === 'abandoned') {
      throw new BadRequestException('Game is already over.');
    }
    await this.returnQuestionsToPool(row.pool_question_ids);
    await this.supabaseService.client
      .from('online_games')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return { ok: true };
  }

  /** Called by component after viewing result — clears last_result so board is shown */
  async continueToBoard(userId: string, gameId: string): Promise<OnlinePublicView> {
    const row = await this.fetchGame(gameId, userId);
    await this.supabaseService.client
      .from('online_games')
      .update({ last_result: null, turn_state: null, updated_at: new Date().toISOString() })
      .eq('id', gameId);
    const updated = await this.fetchGame(gameId, userId);
    return this.toPublicView(updated, userId);
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private async fetchGame(gameId: string, userId: string): Promise<OnlineGameRow> {
    const { data, error } = await this.supabaseService.client
      .from('online_games')
      .select('*')
      .eq('id', gameId)
      .single();
    if (error || !data) throw new NotFoundException('Game not found.');
    const row = data as OnlineGameRow;
    if (row.host_id !== userId && row.guest_id !== userId) {
      throw new BadRequestException('Not a participant of this game.');
    }
    return row;
  }

  private assertActive(row: OnlineGameRow): void {
    if (row.status !== 'active') throw new BadRequestException('Game is not active.');
  }

  private assertMyTurn(row: OnlineGameRow, userId: string): void {
    const myIndex = row.host_id === userId ? 0 : 1;
    if (row.current_player_index !== myIndex) throw new BadRequestException('Not your turn.');
  }

  private toPublicQuestion(q: GeneratedQuestion): OnlinePublicQuestion {
    return {
      id: q.id,
      question_text: q.question_text,
      category: q.category,
      difficulty: q.difficulty,
      ...(q.image_url ? { image_url: q.image_url } : {}),
      fifty_fifty_applicable: q.fifty_fifty_applicable,
      meta: q.meta,
    };
  }

  private toPublicView(row: OnlineGameRow, userId: string): OnlinePublicView {
    const isHost = row.host_id === userId;
    return {
      id: row.id,
      inviteCode: row.invite_code,
      status: row.status,
      myRole: isHost ? 'host' : 'guest',
      myPlayerIndex: isHost ? 0 : 1,
      players: row.players,
      currentPlayerIndex: row.current_player_index,
      board: row.board.map((boardRow: OnlineBoardCell[]) =>
        boardRow.map((c: OnlineBoardCell) => ({
          question_id: c.question_id,
          category: c.category,
          difficulty: c.difficulty,
          points: c.points,
          answered: c.answered,
          answered_by: c.answered_by,
        })),
      ),
      categories: CATEGORIES_ORDER.map((c) => ({ key: c, label: CATEGORY_LABELS[c] })),
      hostReady: row.host_ready,
      guestReady: row.guest_ready,
      turnState: row.turn_state,
      lastResult: row.last_result,
    };
  }

  private isMathematicallyWon(players: [OnlineGamePlayer, OnlineGamePlayer], board: OnlineBoardCell[][]): boolean {
    const unanswered = board.flat().filter((c: OnlineBoardCell) => !c.answered);
    if (unanswered.length === 0) return false;
    const totalRemaining = unanswered.reduce((sum, c) => sum + c.points, 0);
    const maxCellPoints = Math.max(...unanswered.map((c) => c.points));
    for (let i = 0; i < 2; i++) {
      const j = 1 - i;
      const lead = players[i].score - players[j].score;
      const doubleBonus = players[j].doubleUsed ? 0 : maxCellPoints;
      if (lead > totalRemaining + doubleBonus) return true;
    }
    return false;
  }

  private async returnQuestionsToPool(poolIds: string[]): Promise<void> {
    const ids = (poolIds ?? []).filter(Boolean);
    if (ids.length > 0) {
      await this.questionPoolService.returnUnansweredToPool(ids).catch((err: Error) =>
        this.logger.warn(`Failed to return questions to pool: ${err.message}`),
      );
    }
  }

  /** Called by timeout service when turn expires */
  async timeoutTurn(row: OnlineGameRow): Promise<void> {
    const nextPlayerIndex = (row.current_player_index === 0 ? 1 : 0) as 0 | 1;

    // If a question was selected but not answered, mark it as skipped (0 points)
    let newBoard = row.board;
    if (row.turn_state?.questionId) {
      const question = row.questions.find((q: GeneratedQuestion) => q.id === row.turn_state!.questionId);
      newBoard = row.board.map((boardRow: OnlineBoardCell[]) =>
        boardRow.map((c: OnlineBoardCell) =>
          c.question_id === row.turn_state!.questionId && !c.answered
            ? { ...c, answered: true, answered_by: 'timeout', points_awarded: 0 }
            : c,
        ),
      );

      const lastResult: OnlineLastResult = {
        questionId: row.turn_state.questionId,
        correct: false,
        correct_answer: question?.correct_answer ?? '',
        explanation: question?.explanation ?? '',
        points_awarded: 0,
        player_scores: [row.players[0].score, row.players[1].score],
        lifeline_used: false,
        double_used: false,
      };

      const allAnswered = newBoard.flat().every((c: OnlineBoardCell) => c.answered);
      const gameFinished = allAnswered || this.isMathematicallyWon(row.players, newBoard);

      if (gameFinished) {
        await this.returnQuestionsToPool(row.pool_question_ids);
      }

      await this.supabaseService.client
        .from('online_games')
        .update({
          board: newBoard,
          current_player_index: nextPlayerIndex,
          turn_state: null,
          last_result: lastResult,
          turn_started_at: gameFinished ? null : new Date().toISOString(),
          ...(gameFinished ? { status: 'finished' } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('current_player_index', row.current_player_index); // CAS
    } else {
      // No question selected — just switch turns
      await this.supabaseService.client
        .from('online_games')
        .update({
          current_player_index: nextPlayerIndex,
          turn_state: null,
          turn_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('current_player_index', row.current_player_index); // CAS
    }
  }
}
```

- [ ] **Step 9: Verify backend compiles**

```bash
cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 10: Commit**

```bash
git add backend/src/online-game/online-game.service.ts
git commit -m "feat: add OnlineGameService with full game logic and spectating"
```

---

## Task 4: Backend Controller & Module

**Files:**
- Create: `backend/src/online-game/online-game.controller.ts`
- Create: `backend/src/online-game/online-game.module.ts`
- Create: `backend/src/online-game/online-game-timeout.service.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create the controller**

```typescript
import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OnlineGameService } from './online-game.service';
import {
  CreateOnlineGameDto,
  JoinOnlineGameDto,
  SelectQuestionDto,
  SubmitOnlineAnswerDto,
  UseOnlineLifelineDto,
  OnlineTop5GuessDto,
} from './online-game.types';

@Controller('api/online-game')
@UseGuards(AuthGuard)
export class OnlineGameController {
  constructor(private readonly service: OnlineGameService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createGame(@Req() req: any, @Body() dto: CreateOnlineGameDto) {
    return this.service.createGame(req.user.id, dto);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  joinGame(@Req() req: any, @Body() dto: JoinOnlineGameDto) {
    return this.service.joinGame(req.user.id, dto);
  }

  @Get(':id')
  getGame(@Req() req: any, @Param('id') id: string) {
    return this.service.getGame(req.user.id, id);
  }

  @Post(':id/ready')
  @HttpCode(HttpStatus.OK)
  markReady(@Req() req: any, @Param('id') id: string) {
    return this.service.markReady(req.user.id, id);
  }

  @Post(':id/select')
  @HttpCode(HttpStatus.OK)
  selectQuestion(@Req() req: any, @Param('id') id: string, @Body() dto: SelectQuestionDto) {
    return this.service.selectQuestion(req.user.id, id, dto);
  }

  @Post(':id/answer')
  @HttpCode(HttpStatus.OK)
  submitAnswer(@Req() req: any, @Param('id') id: string, @Body() dto: SubmitOnlineAnswerDto) {
    return this.service.submitAnswer(req.user.id, id, dto);
  }

  @Post(':id/fifty')
  @HttpCode(HttpStatus.OK)
  useLifeline(@Req() req: any, @Param('id') id: string, @Body() dto: UseOnlineLifelineDto) {
    return this.service.useLifeline(req.user.id, id, dto);
  }

  @Post(':id/top5/guess')
  @HttpCode(HttpStatus.OK)
  submitTop5Guess(@Req() req: any, @Param('id') id: string, @Body() dto: OnlineTop5GuessDto) {
    return this.service.submitTop5Guess(req.user.id, id, dto);
  }

  @Post(':id/continue')
  @HttpCode(HttpStatus.OK)
  continueToBoard(@Req() req: any, @Param('id') id: string) {
    return this.service.continueToBoard(req.user.id, id);
  }

  @Post(':id/abandon')
  @HttpCode(HttpStatus.OK)
  abandonGame(@Req() req: any, @Param('id') id: string) {
    return this.service.abandonGame(req.user.id, id);
  }
}
```

- [ ] **Step 2: Create the timeout service**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { OnlineGameService } from './online-game.service';
import { OnlineGameRow } from './online-game.types';

const TURN_TIMEOUT_MS = 90_000;
const GRACE_MS = 2_000;

@Injectable()
export class OnlineGameTimeoutService {
  private readonly logger = new Logger(OnlineGameTimeoutService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly onlineGameService: OnlineGameService,
  ) {}

  @Cron('*/30 * * * * *')
  async handleTimeouts(): Promise<void> {
    const cutoff = new Date(Date.now() - TURN_TIMEOUT_MS - GRACE_MS).toISOString();

    const { data: staleGames } = await this.supabaseService.client
      .from('online_games')
      .select('*')
      .eq('status', 'active')
      .not('turn_started_at', 'is', null)
      .lt('turn_started_at', cutoff)
      .limit(10);

    if (!staleGames?.length) return;

    for (const row of staleGames) {
      try {
        await this.onlineGameService.timeoutTurn(row as OnlineGameRow);
        this.logger.debug(`Timed out turn for online game ${row.id}`);
      } catch (e) {
        this.logger.warn(`Timeout failed for ${row.id}: ${(e as Error).message}`);
      }
    }
  }
}
```

- [ ] **Step 3: Create the module**

```typescript
import { Module } from '@nestjs/common';
import { OnlineGameController } from './online-game.controller';
import { OnlineGameService } from './online-game.service';
import { OnlineGameTimeoutService } from './online-game-timeout.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { QuestionsModule } from '../questions/questions.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [AuthModule, SupabaseModule, QuestionsModule, ScheduleModule],
  controllers: [OnlineGameController],
  providers: [OnlineGameService, OnlineGameTimeoutService],
})
export class OnlineGameModule {}
```

- [ ] **Step 4: Import module in AppModule**

In `backend/src/app.module.ts`, add `OnlineGameModule` to the imports array:

```typescript
import { OnlineGameModule } from './online-game/online-game.module';
// Add to @Module imports: OnlineGameModule
```

- [ ] **Step 5: Verify backend compiles**

```bash
cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/online-game/ backend/src/app.module.ts
git commit -m "feat: add OnlineGame controller, module, and timeout service"
```

---

## Task 5: Frontend API Service & Store

**Files:**
- Create: `frontend/src/app/features/online-game/online-game-api.service.ts`
- Create: `frontend/src/app/features/online-game/online-game.store.ts`

- [ ] **Step 1: Create the API service**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';

// Mirror backend types
export interface OnlineGamePlayer {
  name: string;
  score: number;
  lifelineUsed: boolean;
  doubleUsed: boolean;
}

export interface OnlineBoardCell {
  question_id: string;
  category: string;
  difficulty: string;
  points: number;
  answered: boolean;
  answered_by?: string;
}

export interface OnlinePublicQuestion {
  id: string;
  question_text: string;
  category: string;
  difficulty: string;
  image_url?: string;
  fifty_fifty_applicable?: boolean;
  meta?: Record<string, unknown>;
}

export interface OnlineTurnState {
  questionId: string;
  question: OnlinePublicQuestion;
  attempts: string[];
  top5Progress: {
    filledSlots: Array<{ name: string; stat: string } | null>;
    wrongGuesses: Array<{ name: string; stat: string }>;
    complete: boolean;
    won: boolean;
  } | null;
  phase: 'answering' | 'top5' | 'result';
}

export interface OnlineLastResult {
  questionId: string;
  correct: boolean;
  correct_answer: string;
  explanation: string;
  points_awarded: number;
  player_scores: [number, number];
  lifeline_used: boolean;
  double_used: boolean;
  top5Won?: boolean;
  top5FilledSlots?: Array<{ name: string; stat: string } | null>;
  top5WrongGuesses?: Array<{ name: string; stat: string }>;
}

export interface OnlinePublicView {
  id: string;
  inviteCode: string;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  myRole: 'host' | 'guest';
  myPlayerIndex: 0 | 1;
  players: [OnlineGamePlayer, OnlineGamePlayer];
  currentPlayerIndex: 0 | 1;
  board: OnlineBoardCell[][];
  categories: Array<{ key: string; label: string }>;
  hostReady: boolean;
  guestReady: boolean;
  turnState: OnlineTurnState | null;
  lastResult: OnlineLastResult | null;
}

@Injectable({ providedIn: 'root' })
export class OnlineGameApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/api/online-game`;

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  createGame(playerName: string): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(this.base, { playerName }, { headers: this.headers() });
  }

  joinGame(inviteCode: string, playerName: string): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(`${this.base}/join`, { inviteCode, playerName }, { headers: this.headers() });
  }

  getGame(gameId: string): Observable<OnlinePublicView> {
    return this.http.get<OnlinePublicView>(`${this.base}/${gameId}`, { headers: this.headers() });
  }

  markReady(gameId: string): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(`${this.base}/${gameId}/ready`, {}, { headers: this.headers() });
  }

  selectQuestion(gameId: string, questionId: string): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(`${this.base}/${gameId}/select`, { questionId }, { headers: this.headers() });
  }

  submitAnswer(gameId: string, questionId: string, answer: string, useDouble?: boolean): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(`${this.base}/${gameId}/answer`, { questionId, answer, useDouble }, { headers: this.headers() });
  }

  useLifeline(gameId: string, questionId: string): Observable<{ options: string[]; points_if_correct: number }> {
    return this.http.post<{ options: string[]; points_if_correct: number }>(`${this.base}/${gameId}/fifty`, { questionId }, { headers: this.headers() });
  }

  submitTop5Guess(gameId: string, questionId: string, answer: string, useDouble?: boolean): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(`${this.base}/${gameId}/top5/guess`, { questionId, answer, useDouble }, { headers: this.headers() });
  }

  continueToBoard(gameId: string): Observable<OnlinePublicView> {
    return this.http.post<OnlinePublicView>(`${this.base}/${gameId}/continue`, {}, { headers: this.headers() });
  }

  abandonGame(gameId: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/${gameId}/abandon`, {}, { headers: this.headers() });
  }
}
```

- [ ] **Step 2: Create the store**

```typescript
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { inject, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../core/auth.service';
import { OnlineGameApiService, OnlinePublicView } from './online-game-api.service';

export type OnlineGamePhase =
  | 'lobby'
  | 'waiting'
  | 'ready-up'
  | 'board'         // my turn: pick a question
  | 'spectate-board' // opponent's turn: watching them pick
  | 'question'      // my turn: answering a question
  | 'spectating'    // opponent's turn: watching them answer
  | 'result'        // both see the result
  | 'finished';

interface OnlineGameState {
  gameId: string | null;
  gameView: OnlinePublicView | null;
  phase: OnlineGamePhase;
  fiftyFiftyOptions: string[] | null;
  doubleArmed: boolean;
  loading: boolean;
  submitting: boolean;
  error: string | null;
}

const initialState: OnlineGameState = {
  gameId: null,
  gameView: null,
  phase: 'lobby',
  fiftyFiftyOptions: null,
  doubleArmed: false,
  loading: false,
  submitting: false,
  error: null,
};

function derivePhase(view: OnlinePublicView): OnlineGamePhase {
  if (view.status === 'finished' || view.status === 'abandoned') return 'finished';
  if (view.status === 'waiting') {
    if (view.myRole === 'guest' || (view.myRole === 'host' && view.hostReady && view.guestReady)) return 'ready-up';
    if (view.players[1]?.name !== '???') return 'ready-up';
    return 'waiting';
  }
  // Active game
  const isMyTurn = view.currentPlayerIndex === view.myPlayerIndex;

  if (view.lastResult) return 'result';

  if (view.turnState) {
    return isMyTurn ? 'question' : 'spectating';
  }

  return isMyTurn ? 'board' : 'spectate-board';
}

export const OnlineGameStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    isMyTurn: computed(() => {
      const view = store.gameView();
      if (!view) return false;
      return view.currentPlayerIndex === view.myPlayerIndex;
    }),
    myPlayer: computed(() => {
      const view = store.gameView();
      if (!view) return null;
      return view.players[view.myPlayerIndex];
    }),
    opponentPlayer: computed(() => {
      const view = store.gameView();
      if (!view) return null;
      return view.players[view.myPlayerIndex === 0 ? 1 : 0];
    }),
    board: computed(() => store.gameView()?.board ?? []),
    categories: computed(() => store.gameView()?.categories ?? []),
    turnState: computed(() => store.gameView()?.turnState ?? null),
    lastResult: computed(() => store.gameView()?.lastResult ?? null),
    inviteCode: computed(() => store.gameView()?.inviteCode ?? null),
    players: computed(() => store.gameView()?.players ?? null),
  })),
  withMethods((store, api = inject(OnlineGameApiService), auth = inject(AuthService)) => {
    let channel: RealtimeChannel | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    return {
      async createGame(playerName: string): Promise<string | null> {
        patchState(store, { loading: true, error: null });
        try {
          const view = await firstValueFrom(api.createGame(playerName));
          patchState(store, { gameId: view.id, gameView: view, phase: 'waiting', loading: false });
          return view.id;
        } catch {
          patchState(store, { loading: false, error: 'Failed to create game' });
          return null;
        }
      },

      async joinGame(inviteCode: string, playerName: string): Promise<string | null> {
        patchState(store, { loading: true, error: null });
        try {
          const view = await firstValueFrom(api.joinGame(inviteCode, playerName));
          patchState(store, { gameId: view.id, gameView: view, phase: derivePhase(view), loading: false });
          return view.id;
        } catch {
          patchState(store, { loading: false, error: 'Invalid invite code' });
          return null;
        }
      },

      async loadGame(gameId: string): Promise<void> {
        patchState(store, { loading: true, gameId, error: null });
        try {
          const view = await firstValueFrom(api.getGame(gameId));
          patchState(store, { gameView: view, phase: derivePhase(view), loading: false });
        } catch {
          patchState(store, { loading: false, error: 'Failed to load game' });
        }
      },

      async refreshGame(): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        try {
          const view = await firstValueFrom(api.getGame(gameId));
          patchState(store, { gameView: view, phase: derivePhase(view) });
        } catch { /* silent */ }
      },

      subscribeRealtime(gameId: string): void {
        const client = auth.supabaseClient;
        channel = client
          .channel(`online_game:${gameId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'online_games', filter: `id=eq.${gameId}` },
            () => { this.refreshGame(); },
          )
          .subscribe();
        pollTimer = setInterval(() => { this.refreshGame(); }, 15_000);
      },

      unsubscribeRealtime(): void {
        if (channel) { auth.supabaseClient.removeChannel(channel); channel = null; }
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      },

      async markReady(): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        try {
          const view = await firstValueFrom(api.markReady(gameId));
          patchState(store, { gameView: view, phase: derivePhase(view) });
        } catch { patchState(store, { error: 'Failed to mark ready' }); }
      },

      async selectQuestion(questionId: string): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        patchState(store, { submitting: true });
        try {
          const view = await firstValueFrom(api.selectQuestion(gameId, questionId));
          patchState(store, { gameView: view, phase: derivePhase(view), submitting: false });
        } catch { patchState(store, { submitting: false, error: 'Failed to select question' }); }
      },

      async submitAnswer(questionId: string, answer: string): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        patchState(store, { submitting: true });
        try {
          const view = await firstValueFrom(api.submitAnswer(gameId, questionId, answer, store.doubleArmed() || undefined));
          patchState(store, { gameView: view, phase: derivePhase(view), submitting: false, doubleArmed: false, fiftyFiftyOptions: null });
        } catch { patchState(store, { submitting: false, error: 'Failed to submit answer' }); }
      },

      async useLifeline(questionId: string): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        try {
          const result = await firstValueFrom(api.useLifeline(gameId, questionId));
          patchState(store, { fiftyFiftyOptions: result.options });
        } catch { patchState(store, { error: 'Failed to use 50-50' }); }
      },

      async submitTop5Guess(questionId: string, answer: string): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        patchState(store, { submitting: true });
        try {
          const view = await firstValueFrom(api.submitTop5Guess(gameId, questionId, answer, store.doubleArmed() || undefined));
          patchState(store, { gameView: view, phase: derivePhase(view), submitting: false });
        } catch { patchState(store, { submitting: false, error: 'Failed to submit guess' }); }
      },

      async continueToBoard(): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        try {
          const view = await firstValueFrom(api.continueToBoard(gameId));
          patchState(store, { gameView: view, phase: derivePhase(view) });
        } catch { /* silent */ }
      },

      armDouble(): void {
        patchState(store, { doubleArmed: true });
      },

      async abandonGame(): Promise<void> {
        const gameId = store.gameId();
        if (!gameId) return;
        try {
          await firstValueFrom(api.abandonGame(gameId));
          patchState(store, { phase: 'finished' });
        } catch { /* silent */ }
      },

      reset(): void {
        if (channel) { auth.supabaseClient.removeChannel(channel); channel = null; }
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        patchState(store, initialState);
      },
    };
  }),
);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/online-game/online-game-api.service.ts frontend/src/app/features/online-game/online-game.store.ts
git commit -m "feat: add online game API service and store with Realtime"
```

---

## Task 6: Frontend Component & Template

**Files:**
- Create: `frontend/src/app/features/online-game/online-game.ts`
- Create: `frontend/src/app/features/online-game/online-game.html`
- Modify: `frontend/src/app/app.routes.ts`

This is the largest frontend task. The template contains all UI phases: lobby, waiting, ready-up, board, question (active + spectating), result, and finished.

- [ ] **Step 1: Create the component**

```typescript
import { Component, inject, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy, effect } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { OnlineGameStore } from './online-game.store';
import { createGameTimer } from '../../core/game-timer';

const TURN_TIME = 90;

@Component({
  selector: 'app-online-game',
  standalone: true,
  imports: [CommonModule, FormsModule, NgOptimizedImage],
  providers: [OnlineGameStore],
  templateUrl: './online-game.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnlineGameComponent implements OnInit, OnDestroy {
  store = inject(OnlineGameStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  // Lobby inputs
  playerName = signal('');
  joinCode = signal('');
  copied = signal(false);

  // Question input
  answer = signal('');
  top5Answer = signal('');
  wrongFeedback = signal(false);

  // Timer
  private timer = createGameTimer();
  timeLeft = this.timer.timeLeft;

  private lastPhase: string | null = null;

  constructor() {
    // Reset timer on phase change to question
    effect(() => {
      const phase = this.store.phase();
      if ((phase === 'question' || phase === 'spectating' || phase === 'board' || phase === 'spectate-board') && this.lastPhase !== phase) {
        this.lastPhase = phase;
        if (phase === 'question' || phase === 'board') {
          this.timer.start(TURN_TIME, () => { /* timeout handled by backend cron */ });
        }
      }
      if (phase === 'result' || phase === 'finished') {
        this.timer.stop();
      }
    });
  }

  ngOnInit(): void {
    const gameId = this.route.snapshot.params['id'] as string;
    if (gameId) {
      this.store.loadGame(gameId).then(() => {
        this.store.subscribeRealtime(gameId);
      });
    }
  }

  ngOnDestroy(): void {
    this.store.unsubscribeRealtime();
    this.timer.destroy();
  }

  async createGame(): Promise<void> {
    const name = this.playerName().trim();
    if (!name) return;
    const gameId = await this.store.createGame(name);
    if (gameId) {
      this.store.subscribeRealtime(gameId);
      this.router.navigate(['/online-game', gameId], { replaceUrl: true });
    }
  }

  async joinGame(): Promise<void> {
    const code = this.joinCode().trim();
    const name = this.playerName().trim();
    if (!code || !name) return;
    const gameId = await this.store.joinGame(code, name);
    if (gameId) {
      this.store.subscribeRealtime(gameId);
      this.router.navigate(['/online-game', gameId], { replaceUrl: true });
    }
  }

  async copyCode(): Promise<void> {
    const code = this.store.inviteCode();
    if (!code) return;
    try { await navigator.clipboard.writeText(code); } catch {}
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  async markReady(): Promise<void> {
    await this.store.markReady();
  }

  async selectQuestion(questionId: string): Promise<void> {
    await this.store.selectQuestion(questionId);
    this.answer.set('');
    this.top5Answer.set('');
  }

  async submitAnswer(): Promise<void> {
    const turnState = this.store.turnState();
    if (!turnState) return;
    const text = this.answer().trim();
    if (!text || this.store.submitting()) return;
    await this.store.submitAnswer(turnState.questionId, text);
    // If still in question phase, answer was wrong
    if (this.store.phase() === 'question') {
      this.wrongFeedback.set(true);
      this.answer.set('');
      setTimeout(() => this.wrongFeedback.set(false), 1200);
    } else {
      this.answer.set('');
      this.wrongFeedback.set(false);
    }
  }

  async submitFiftyFifty(option: string): Promise<void> {
    const turnState = this.store.turnState();
    if (!turnState) return;
    await this.store.submitAnswer(turnState.questionId, option);
    this.answer.set('');
  }

  async useLifeline(): Promise<void> {
    const turnState = this.store.turnState();
    if (!turnState) return;
    await this.store.useLifeline(turnState.questionId);
  }

  async submitTop5Guess(): Promise<void> {
    const turnState = this.store.turnState();
    if (!turnState) return;
    const text = this.top5Answer().trim();
    if (!text || this.store.submitting()) return;
    await this.store.submitTop5Guess(turnState.questionId, text);
    this.top5Answer.set('');
  }

  armDouble(): void {
    this.store.armDouble();
  }

  async continueToBoard(): Promise<void> {
    await this.store.continueToBoard();
  }

  goHome(): void {
    this.store.reset();
    this.router.navigate(['/']);
  }

  async abandon(): Promise<void> {
    await this.store.abandonGame();
    this.router.navigate(['/']);
  }

  categoryIcon(key: string): string {
    const icons: Record<string, string> = {
      HISTORY: '📜', PLAYER_ID: '🕵️', HIGHER_OR_LOWER: '📊',
      GUESS_SCORE: '⚽', TOP_5: '🏆', GEOGRAPHY: '🌍', LOGO_QUIZ: '🛡️',
    };
    return icons[key] ?? '❓';
  }

  difficultyColor(d: string): string {
    if (d === 'EASY') return 'text-green-400';
    if (d === 'MEDIUM') return 'text-yellow-400';
    if (d === 'HARD') return 'text-red-400';
    return 'text-muted-foreground';
  }
}
```

- [ ] **Step 2: Create the template**

The template is large — it covers all phases. Write it to `frontend/src/app/features/online-game/online-game.html`. It should include:

1. **Lobby** — name input, create/join buttons
2. **Waiting** — invite code display, share button
3. **Ready-up** — VS matchup, ready buttons
4. **Board** (my turn) — clickable grid, score bar
5. **Spectate-board** (opponent's turn) — same grid but no clicks, "Opponent is picking..." label
6. **Question** (my turn) — question card + input (reuse template patterns from `question.html`)
7. **Spectating** (opponent's turn) — read-only question card + live attempts list + Top 5 live progress
8. **Result** — correct/wrong display, points, correct answer, "Continue" button
9. **Finished** — final scores, winner announcement

Each phase uses `@if (store.phase() === 'xxx')` blocks. Reference `question.html` for the exact template patterns for each question type (HOL, Logo, Player ID, Guess Score, Top 5, default text).

**Key spectating sections:**

For regular questions:
```html
@if (store.phase() === 'spectating' && store.turnState(); as ts) {
  <div class="p-4 rounded-2xl bg-card border border-border">
    <div class="flex items-center justify-between mb-3">
      <span class="text-xs font-bold text-muted-foreground uppercase">{{ ts.question.category }}</span>
      <span class="text-xs text-muted-foreground">{{ store.opponentPlayer()?.name }}'s turn</span>
    </div>
    <p class="text-foreground text-lg font-medium mb-4">{{ ts.question.question_text }}</p>
    <!-- Logo image if applicable -->
    @if (ts.question.image_url) {
      <img [ngSrc]="ts.question.image_url" alt="" class="w-36 h-36 object-contain mx-auto mb-4" width="144" height="144" />
    }
    <!-- Wrong attempts feed -->
    @if (ts.attempts.length > 0) {
      <div class="mt-3 pt-3 border-t border-border/50">
        <p class="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Opponent's attempts</p>
        @for (attempt of ts.attempts; track $index) {
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-red-400 text-xs font-bold">&#10007;</span>
            <span class="text-red-400/70 text-sm italic">"{{ attempt }}"</span>
          </div>
        }
      </div>
    }
    <div class="mt-3 flex items-center gap-2 text-muted-foreground">
      <div class="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
      <span class="text-xs">Waiting for answer...</span>
    </div>
  </div>
}
```

For Top 5 spectating:
```html
@if (store.phase() === 'spectating' && store.turnState()?.phase === 'top5' && store.turnState()?.top5Progress; as t5) {
  <div class="space-y-2.5 mb-4">
    @for (slot of t5.filledSlots; track $index) {
      <div class="flex items-center gap-4 px-4 py-3 rounded-xl border"
           [class]="slot ? 'bg-green-500/10 border-green-500/40' : 'bg-card border-border'">
        <span class="text-accent font-black text-lg w-6">{{ $index + 1 }}</span>
        @if (slot) {
          <span class="text-foreground font-semibold">{{ slot.name }}</span>
          <span class="text-muted-foreground text-sm ml-auto">({{ slot.stat }})</span>
        } @else {
          <span class="text-muted-foreground/40 italic text-sm">???</span>
        }
      </div>
    }
  </div>
  @if (t5.wrongGuesses.length > 0) {
    <div class="mb-4">
      <p class="text-muted-foreground text-xs uppercase tracking-wider mb-2">Wrong guesses</p>
      @for (wrong of t5.wrongGuesses; track $index) {
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 mb-1">
          <span class="text-red-400 text-sm">{{ wrong.name }}</span>
        </div>
      }
    </div>
  }
}
```

- [ ] **Step 3: Add route**

In `frontend/src/app/app.routes.ts`, add:

```typescript
{ path: 'online-game', loadComponent: () => import('./features/online-game/online-game').then(m => m.OnlineGameComponent) },
{ path: 'online-game/:id', loadComponent: () => import('./features/online-game/online-game').then(m => m.OnlineGameComponent) },
```

- [ ] **Step 4: Verify frontend compiles**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=development 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/online-game/ frontend/src/app/app.routes.ts
git commit -m "feat: add online game component, template, and route"
```

---

## Task 7: Home Page Entry Point

**Files:**
- Modify: `frontend/src/app/features/home/home.html` (or wherever the "2-Player" card is)

- [ ] **Step 1: Add "Online" button to the 2-Player card**

Find the existing "2-Player" card in the home page and add an "Online" mode button alongside the existing local mode button. The online button navigates to `/online-game`.

```html
<!-- Inside the 2-Player card -->
<div class="flex gap-2">
  <a routerLink="/game" class="flex-1 py-2.5 rounded-xl bg-card border border-border text-foreground text-sm font-bold text-center">
    Local
  </a>
  <a routerLink="/online-game" class="flex-1 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-bold text-center">
    Online
  </a>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/features/home/
git commit -m "feat: add online mode button to 2-Player card on home page"
```

---

## Task 8: Manual QA

- [ ] **Step 1: Deploy backend and verify endpoints**

Start backend locally and test each endpoint with curl or the frontend.

- [ ] **Step 2: Test create → join → ready-up flow**

Two browser tabs, two different accounts. Create game in tab 1, join with invite code in tab 2. Both ready up. Verify game starts.

- [ ] **Step 3: Test board → question → answer flow**

Active player picks a question cell. Verify opponent sees the question in spectating view. Active player submits wrong answer — verify opponent sees the wrong attempt text appear. Active player submits correct answer — verify both see the result.

- [ ] **Step 4: Test Top 5 spectating**

Active player picks a Top 5 question. Opponent sees the question text and empty slots. Active player guesses correctly — opponent sees the slot fill in real-time. Active player guesses wrong — opponent sees the wrong guess appear. Verify game ends correctly when Top 5 completes.

- [ ] **Step 5: Test turn timeout**

Active player does nothing for 90 seconds. Verify turn switches to opponent. Verify opponent can now pick a question.

- [ ] **Step 6: Test game end**

Play until all questions answered or mathematical win. Verify final scores and winner shown to both.
