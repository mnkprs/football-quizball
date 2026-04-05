# Achievements Expansion + Progress Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 25 new achievements with progress tracking (current/target) across all game modes, plus display progress bars in the frontend profile.

**Architecture:** Add `current` and `target` fields to the Achievement response. `target` comes from `condition_value.min` in DB. `current` is computed server-side from user stats (profiles, duel_games, match_history, elo_history). New profile columns track data not currently stored (daily streak, max correct streak, logo correct count, duel wins, BR wins). Frontend renders a progress bar beneath each locked achievement tile.

**Tech Stack:** NestJS backend, Supabase (Postgres), Angular 20 frontend with signals, TailwindCSS

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260405100000_achievements_expansion.sql` | New achievements + profile columns |
| Modify | `backend/src/common/interfaces/achievement.interface.ts` | Add `current`, `target` to Achievement |
| Modify | `backend/src/common/interfaces/profile.interface.ts` | Add new profile columns |
| Modify | `backend/src/supabase/supabase.service.ts` | New query methods for stats; update `getAchievements` to include `condition_value` |
| Modify | `backend/src/achievements/achievements.service.ts` | Add `getProgressForUser`, expand `checkAndAward` context, add new achievement checks |
| Modify | `backend/src/achievements/achievements.controller.ts` | Wire progress endpoint |
| Modify | `backend/src/solo/solo.service.ts` | Pass streak + total questions to achievement context |
| Modify | `backend/src/blitz/blitz.service.ts` | Pass new blitz threshold (150) |
| Modify | `backend/src/duel/duel.service.ts` | Award achievements on duel finish |
| Modify | `backend/src/battle-royale/battle-royale.service.ts` | Track BR wins, award achievements |
| Modify | `backend/src/logo-quiz/logo-quiz.service.ts` | Track logo correct count, award achievements |
| Modify | `backend/src/mayhem/mayhem-session.service.ts` | No change needed (already passes mayhemGamesPlayed) |
| Modify | `frontend/src/app/core/achievements-api.service.ts` | Add `current`, `target` to Achievement interface |
| Modify | `frontend/src/app/features/profile/profile.html` | Progress bar under each achievement tile |
| Modify | `frontend/src/app/features/profile/profile.ts` | Progress percentage computed helper |

---

## Task 1: Database Migration — New Achievements + Profile Columns

**Files:**
- Create: `supabase/migrations/20260405100000_achievements_expansion.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ─── New profile columns for progress tracking ───────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS max_correct_streak int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS logo_quiz_correct int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duel_wins int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS br_wins int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_date date,
  ADD COLUMN IF NOT EXISTS current_daily_streak int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_questions_all_modes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS modes_played text[] NOT NULL DEFAULT '{}';

-- ─── New achievements ────────────────────────────────────────

-- EARLY HOOK
INSERT INTO achievements VALUES
  ('first_correct','Quick Learner','Answer your first question correctly','🧠','milestone','total_questions','{"min":1}'),
  ('streak_3','Hat Trick','Get 3 correct answers in a row','⚽','performance','streak','{"min":3}'),
  ('first_duel','Challenger','Complete your first Duel','🤝','milestone','duel_games','{"min":1}'),
  ('first_logo','Badge Spotter','Identify your first logo correctly','🔍','milestone','logo_correct','{"min":1}'),
  ('first_battle_royale','Arena Debut','Join your first Battle Royale','🏟️','milestone','br_games','{"min":1}');

-- MID-GAME
INSERT INTO achievements VALUES
  ('streak_10','On Fire','Get 10 correct answers in a row','🔥','performance','streak','{"min":10}'),
  ('duel_5_wins','Duel Contender','Win 5 Duels','⚔️','milestone','duel_wins','{"min":5}'),
  ('logo_50','Crest Collector','Identify 50 logos correctly','🛡️','mode','logo_correct','{"min":50}'),
  ('all_modes','Explorer','Play every game mode at least once','🗺️','milestone','modes_played','{"min":6}'),
  ('daily_3','Three-a-Day','Play 3 days in a row','📅','consistency','daily_streak','{"min":3}'),
  ('perfect_solo_round','Flawless','Get every question right in a Solo session','💯','performance','perfect_session','{"min":1}'),
  ('blitz_150','Blitz Legend','Score 150 in Blitz','⚡','mode','mode_score','{"mode":"blitz","min":150}'),
  ('accuracy_90','Sniper','Reach 90% accuracy in Solo','🎯','performance','accuracy','{"mode":"solo","min":90}');

-- LONG-TERM CHASE
INSERT INTO achievements VALUES
  ('solo_100_games','Solo Centurion','Play 100 Solo sessions','💪','milestone','games_count','{"mode":"solo","min":100}'),
  ('solo_500_games','Solo Legend','Play 500 Solo sessions','🐐','milestone','games_count','{"mode":"solo","min":500}'),
  ('streak_25','Unstoppable','Get 25 correct answers in a row','🌟','performance','streak','{"min":25}'),
  ('duel_50_wins','Duel Master','Win 50 Duels','🗡️','milestone','duel_wins','{"min":50}'),
  ('duel_100_wins','Duel Legend','Win 100 Duels','👑','milestone','duel_wins','{"min":100}'),
  ('logo_250','Crest Expert','Identify 250 logos correctly','🏅','mode','logo_correct','{"min":250}'),
  ('daily_7','Weekly Warrior','Play 7 days in a row','🗓️','consistency','daily_streak','{"min":7}'),
  ('daily_30','Monthly Devotee','Play 30 days in a row','🏆','consistency','daily_streak','{"min":30}'),
  ('elo_2000','Grandmaster','Reach 2000 ELO','💎','rank','elo_threshold','{"min":2000}'),
  ('match_50_wins','Match Legend','Win 50 matches','🏟️','milestone','match_wins','{"min":50}'),
  ('br_wins_10','Royale Regular','Win 10 Battle Royales','👊','milestone','br_wins','{"min":10}'),
  ('br_wins_50','Battle Royale King','Win 50 Battle Royales','🫅','milestone','br_wins','{"min":50}'),
  ('questions_1000','Trivia Machine','Answer 1000 questions total','🤖','milestone','total_questions','{"min":1000}'),
  ('questions_5000','Living Encyclopedia','Answer 5000 questions total','📚','milestone','total_questions','{"min":5000}');
```

- [ ] **Step 2: Apply the migration**

Run: `cd /Users/instashop/Projects/football-quizball && npx supabase db push`
Expected: Migration applies cleanly — new columns on profiles, 25 new rows in achievements.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260405100000_achievements_expansion.sql
git commit -m "feat(achievements): add 25 new achievements + profile tracking columns"
```

---

## Task 2: Backend — Update Interfaces

**Files:**
- Modify: `backend/src/common/interfaces/achievement.interface.ts`
- Modify: `backend/src/common/interfaces/profile.interface.ts`

- [ ] **Step 1: Update Achievement interface**

In `backend/src/common/interfaces/achievement.interface.ts`, replace the entire file:

```typescript
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned_at: string | null;
  current: number;
  target: number;
}
```

- [ ] **Step 2: Update Profile interface**

In `backend/src/common/interfaces/profile.interface.ts`, add new fields to the `Profile` interface after `country_code`:

```typescript
  max_correct_streak: number;
  logo_quiz_correct: number;
  duel_wins: number;
  br_wins: number;
  last_active_date: string | null;
  current_daily_streak: number;
  total_questions_all_modes: number;
  modes_played: string[];
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/common/interfaces/achievement.interface.ts backend/src/common/interfaces/profile.interface.ts
git commit -m "feat(achievements): add progress fields to Achievement and Profile interfaces"
```

---

## Task 3: Backend — SupabaseService New Query Methods

**Files:**
- Modify: `backend/src/supabase/supabase.service.ts`

- [ ] **Step 1: Update `getAchievements` to include `condition_value`**

Change the select query on line 533 from:
```typescript
this.client.from('achievements').select('id, name, description, icon, category'),
```
to:
```typescript
this.client.from('achievements').select('id, name, description, icon, category, condition_value'),
```

And update the return type mapping to extract `target` from `condition_value.min`:

Replace the entire `getAchievements` method:

```typescript
async getAchievements(userId: string): Promise<Achievement[]> {
  const [allRes, earnedRes] = await Promise.all([
    this.client.from('achievements').select('id, name, description, icon, category, condition_value'),
    this.client.from('user_achievements').select('achievement_id, earned_at').eq('user_id', userId),
  ]);
  const earned = new Map(
    (earnedRes.data ?? []).map((e: { achievement_id: string; earned_at: string }) => [e.achievement_id, e.earned_at]),
  );
  return (allRes.data ?? []).map(
    (a: { id: string; name: string; description: string; icon: string; category: string; condition_value: { min?: number } | null }) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      category: a.category,
      earned_at: earned.get(a.id) ?? null,
      current: 0, // placeholder — filled by AchievementsService
      target: a.condition_value?.min ?? 1,
    }),
  );
}
```

- [ ] **Step 2: Add `getDuelWinCount` method**

Add after `getUserAchievementIds`:

```typescript
async getDuelWinCount(userId: string): Promise<number> {
  const { data } = await this.client
    .from('duel_games')
    .select('id, host_id, guest_id, scores')
    .eq('status', 'finished')
    .or(`host_id.eq.${userId},guest_id.eq.${userId}`);
  if (!data) return 0;
  return data.filter((g: { host_id: string; guest_id: string; scores: { host: number; guest: number } }) => {
    const isHost = g.host_id === userId;
    return isHost ? g.scores.host > g.scores.guest : g.scores.guest > g.scores.host;
  }).length;
}
```

- [ ] **Step 3: Add `getDuelGameCount` method**

```typescript
async getDuelGameCount(userId: string): Promise<number> {
  const { count } = await this.client
    .from('duel_games')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'finished')
    .or(`host_id.eq.${userId},guest_id.eq.${userId}`);
  return count ?? 0;
}
```

- [ ] **Step 4: Add `getBrGameCount` and `getBrWinCount` methods**

```typescript
async getBrGameCount(userId: string): Promise<number> {
  const { count } = await this.client
    .from('match_history')
    .select('*', { count: 'exact', head: true })
    .eq('player1_id', userId)
    .in('match_mode', ['battle_royale', 'team_logo_battle']);
  return count ?? 0;
}
```

- [ ] **Step 5: Add `getModesPlayed` method**

```typescript
async getModesPlayed(userId: string): Promise<string[]> {
  const modes: string[] = [];

  // Solo — check games_played on profile
  const { data: profile } = await this.client
    .from('profiles')
    .select('games_played, logo_quiz_games_played')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.games_played > 0) modes.push('solo');
  if (profile?.logo_quiz_games_played > 0) modes.push('logo_quiz');

  // Blitz — check max_blitz_score
  const { data: blitz } = await this.client
    .from('profiles')
    .select('max_blitz_score')
    .eq('id', userId)
    .maybeSingle();
  if (blitz?.max_blitz_score && blitz.max_blitz_score > 0) modes.push('blitz');

  // Mayhem — check user_mode_stats
  const { data: mayhem } = await this.client
    .from('user_mode_stats')
    .select('games_played')
    .eq('user_id', userId)
    .maybeSingle();
  if (mayhem?.games_played > 0) modes.push('mayhem');

  // Duel — check duel_games
  const { count: duelCount } = await this.client
    .from('duel_games')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'finished')
    .or(`host_id.eq.${userId},guest_id.eq.${userId}`);
  if ((duelCount ?? 0) > 0) modes.push('duel');

  // Battle Royale — check match_history
  const { count: brCount } = await this.client
    .from('match_history')
    .select('*', { count: 'exact', head: true })
    .eq('player1_id', userId)
    .in('match_mode', ['battle_royale', 'team_logo_battle']);
  if ((brCount ?? 0) > 0) modes.push('battle_royale');

  return modes;
}
```

- [ ] **Step 6: Add `updateDailyStreak` method**

```typescript
async updateDailyStreak(userId: string): Promise<{ current_daily_streak: number }> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { data: profile } = await this.client
    .from('profiles')
    .select('last_active_date, current_daily_streak')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return { current_daily_streak: 0 };

  const lastActive = profile.last_active_date;
  let newStreak = 1;

  if (lastActive === today) {
    // Already counted today
    return { current_daily_streak: profile.current_daily_streak };
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (lastActive === yesterdayStr) {
    newStreak = profile.current_daily_streak + 1;
  }
  // else: streak resets to 1

  await this.client
    .from('profiles')
    .update({ last_active_date: today, current_daily_streak: newStreak })
    .eq('id', userId);

  return { current_daily_streak: newStreak };
}
```

- [ ] **Step 7: Add `updateMaxCorrectStreak` method**

```typescript
async updateMaxCorrectStreak(userId: string, currentStreak: number): Promise<void> {
  await this.client
    .from('profiles')
    .update({ max_correct_streak: currentStreak })
    .eq('id', userId)
    .lt('max_correct_streak', currentStreak);
}
```

- [ ] **Step 8: Add `incrementLogoQuizCorrect` method**

```typescript
async incrementLogoQuizCorrect(userId: string): Promise<number> {
  const { data } = await this.client.rpc('increment_field', {
    row_id: userId,
    table_name: 'profiles',
    field_name: 'logo_quiz_correct',
    amount: 1,
  });
  // Fallback: manual read if RPC doesn't exist
  if (data === null || data === undefined) {
    const { data: profile } = await this.client
      .from('profiles')
      .select('logo_quiz_correct')
      .eq('id', userId)
      .maybeSingle();
    const current = (profile?.logo_quiz_correct ?? 0) + 1;
    await this.client
      .from('profiles')
      .update({ logo_quiz_correct: current })
      .eq('id', userId);
    return current;
  }
  return data as number;
}
```

- [ ] **Step 9: Add `incrementTotalQuestions` method**

```typescript
async incrementTotalQuestions(userId: string, count: number): Promise<number> {
  const { data: profile } = await this.client
    .from('profiles')
    .select('total_questions_all_modes')
    .eq('id', userId)
    .maybeSingle();
  const newTotal = (profile?.total_questions_all_modes ?? 0) + count;
  await this.client
    .from('profiles')
    .update({ total_questions_all_modes: newTotal })
    .eq('id', userId);
  return newTotal;
}
```

- [ ] **Step 10: Add `incrementDuelWins` and `incrementBrWins` methods**

```typescript
async incrementDuelWins(userId: string): Promise<number> {
  const { data: profile } = await this.client
    .from('profiles')
    .select('duel_wins')
    .eq('id', userId)
    .maybeSingle();
  const newCount = (profile?.duel_wins ?? 0) + 1;
  await this.client
    .from('profiles')
    .update({ duel_wins: newCount })
    .eq('id', userId);
  return newCount;
}

async incrementBrWins(userId: string): Promise<number> {
  const { data: profile } = await this.client
    .from('profiles')
    .select('br_wins')
    .eq('id', userId)
    .maybeSingle();
  const newCount = (profile?.br_wins ?? 0) + 1;
  await this.client
    .from('profiles')
    .update({ br_wins: newCount })
    .eq('id', userId);
  return newCount;
}
```

- [ ] **Step 11: Add `addModePlayed` method**

```typescript
async addModePlayed(userId: string, mode: string): Promise<string[]> {
  const { data: profile } = await this.client
    .from('profiles')
    .select('modes_played')
    .eq('id', userId)
    .maybeSingle();
  const current: string[] = profile?.modes_played ?? [];
  if (current.includes(mode)) return current;
  const updated = [...current, mode];
  await this.client
    .from('profiles')
    .update({ modes_played: updated })
    .eq('id', userId);
  return updated;
}
```

- [ ] **Step 12: Commit**

```bash
git add backend/src/supabase/supabase.service.ts
git commit -m "feat(achievements): add supabase query methods for progress tracking"
```

---

## Task 4: Backend — AchievementsService Progress Calculation + New Checks

**Files:**
- Modify: `backend/src/achievements/achievements.service.ts`

- [ ] **Step 1: Expand AchievementContext interface**

Replace the existing `AchievementContext` (lines 4-11) with:

```typescript
export interface AchievementContext {
  currentElo?: number;
  soloGamesPlayed?: number;
  soloAccuracy?: number;
  blitzBestScore?: number;
  mayhemGamesPlayed?: number;
  matchWins?: number;
  // New fields
  currentStreak?: number;
  maxCorrectStreak?: number;
  duelGamesPlayed?: number;
  duelWins?: number;
  logoQuizCorrect?: number;
  brGamesPlayed?: number;
  brWins?: number;
  dailyStreak?: number;
  totalQuestionsAllModes?: number;
  modesPlayed?: string[];
  perfectSoloSession?: boolean;
}
```

- [ ] **Step 2: Add `getForUserWithProgress` method**

Add this method after the existing `getForUser`:

```typescript
async getForUserWithProgress(userId: string): Promise<Achievement[]> {
  const [achievements, profile, streak, duelWins, duelGames, brGames, modesPlayed] = await Promise.all([
    this.supabaseService.getAchievements(userId),
    this.supabaseService.getProfile(userId),
    this.supabaseService.getCorrectStreak(userId),
    this.supabaseService.getDuelWinCount(userId),
    this.supabaseService.getDuelGameCount(userId),
    this.supabaseService.getBrGameCount(userId),
    this.supabaseService.getModesPlayed(userId),
  ]);

  if (!profile) return achievements;

  const accuracy = profile.questions_answered > 0
    ? Math.round((profile.correct_answers / profile.questions_answered) * 100)
    : 0;

  const progressMap: Record<string, number> = {
    // Milestone: solo games
    first_solo_win: profile.games_played,
    solo_10_games: profile.games_played,
    solo_50_games: profile.games_played,
    solo_100_games: profile.games_played,
    solo_500_games: profile.games_played,
    // Performance: accuracy
    accuracy_80: accuracy,
    accuracy_90: accuracy,
    // Blitz scores
    blitz_50: profile.max_blitz_score ?? 0,
    blitz_100: profile.max_blitz_score ?? 0,
    blitz_150: profile.max_blitz_score ?? 0,
    // Mayhem
    mayhem_master: profile.games_played, // will be overridden if user_mode_stats available
    // ELO thresholds
    elo_1200: profile.elo,
    elo_1400: profile.elo,
    elo_1600: profile.elo,
    elo_1800: profile.elo,
    elo_2000: profile.elo,
    // Match wins
    match_winner: 0, // filled below
    match_10_wins: 0,
    match_50_wins: 0,
    // Streaks
    streak_3: Math.max(streak, profile.max_correct_streak ?? 0),
    streak_10: Math.max(streak, profile.max_correct_streak ?? 0),
    streak_25: Math.max(streak, profile.max_correct_streak ?? 0),
    // Duels
    first_duel: duelGames,
    duel_5_wins: duelWins,
    duel_50_wins: duelWins,
    duel_100_wins: duelWins,
    // Logo
    first_logo: profile.logo_quiz_correct ?? 0,
    logo_50: profile.logo_quiz_correct ?? 0,
    logo_250: profile.logo_quiz_correct ?? 0,
    // Battle Royale
    first_battle_royale: brGames,
    br_wins_10: profile.br_wins ?? 0,
    br_wins_50: profile.br_wins ?? 0,
    // Daily streak
    daily_3: profile.current_daily_streak ?? 0,
    daily_7: profile.current_daily_streak ?? 0,
    daily_30: profile.current_daily_streak ?? 0,
    // Explorer
    all_modes: modesPlayed.length,
    // Total questions
    first_correct: profile.total_questions_all_modes ?? profile.questions_answered ?? 0,
    questions_1000: profile.total_questions_all_modes ?? profile.questions_answered ?? 0,
    questions_5000: profile.total_questions_all_modes ?? profile.questions_answered ?? 0,
    // Perfect session — show 1 if earned, 0 if not
    perfect_solo_round: 0,
  };

  // Match wins from match_history
  const { data: matchData } = await this.supabaseService.client
    .from('match_history')
    .select('winner_id')
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .not('match_mode', 'in', '("battle_royale","team_logo_battle")');
  const matchWins = (matchData ?? []).filter((m: { winner_id: string | null }) => m.winner_id === userId).length;
  progressMap['match_winner'] = matchWins;
  progressMap['match_10_wins'] = matchWins;
  progressMap['match_50_wins'] = matchWins;

  // Mayhem from user_mode_stats
  const { data: mayhemStats } = await this.supabaseService.client
    .from('user_mode_stats')
    .select('games_played')
    .eq('user_id', userId)
    .maybeSingle();
  if (mayhemStats) {
    progressMap['mayhem_master'] = mayhemStats.games_played;
  }

  // perfect_solo_round: 1 if earned
  const earned = achievements.filter(a => a.earned_at);
  if (earned.some(a => a.id === 'perfect_solo_round')) {
    progressMap['perfect_solo_round'] = 1;
  }

  return achievements.map(a => ({
    ...a,
    current: Math.min(progressMap[a.id] ?? 0, a.target),
    target: a.target,
  }));
}
```

- [ ] **Step 3: Expand `checkAndAward` with new achievement checks**

Add these checks after the existing match wins checks (after line 72):

```typescript
    // New: Solo milestone extensions
    check('solo_100_games', (ctx.soloGamesPlayed ?? 0) >= 100);
    check('solo_500_games', (ctx.soloGamesPlayed ?? 0) >= 500);

    // New: Accuracy 90
    check('accuracy_90', (ctx.soloAccuracy ?? 0) >= 90);

    // New: Blitz 150
    check('blitz_150', (ctx.blitzBestScore ?? 0) >= 150);

    // New: ELO 2000
    check('elo_2000', (ctx.currentElo ?? 0) >= 2000);

    // New: Streaks
    const bestStreak = ctx.maxCorrectStreak ?? ctx.currentStreak ?? 0;
    check('streak_3', bestStreak >= 3);
    check('streak_10', bestStreak >= 10);
    check('streak_25', bestStreak >= 25);

    // New: Duel achievements
    check('first_duel', (ctx.duelGamesPlayed ?? 0) >= 1);
    check('duel_5_wins', (ctx.duelWins ?? 0) >= 5);
    check('duel_50_wins', (ctx.duelWins ?? 0) >= 50);
    check('duel_100_wins', (ctx.duelWins ?? 0) >= 100);

    // New: Logo quiz
    check('first_logo', (ctx.logoQuizCorrect ?? 0) >= 1);
    check('logo_50', (ctx.logoQuizCorrect ?? 0) >= 50);
    check('logo_250', (ctx.logoQuizCorrect ?? 0) >= 250);

    // New: Battle Royale
    check('first_battle_royale', (ctx.brGamesPlayed ?? 0) >= 1);
    check('br_wins_10', (ctx.brWins ?? 0) >= 10);
    check('br_wins_50', (ctx.brWins ?? 0) >= 50);

    // New: Daily streak
    check('daily_3', (ctx.dailyStreak ?? 0) >= 3);
    check('daily_7', (ctx.dailyStreak ?? 0) >= 7);
    check('daily_30', (ctx.dailyStreak ?? 0) >= 30);

    // New: Explorer (all modes)
    check('all_modes', (ctx.modesPlayed?.length ?? 0) >= 6);

    // New: Total questions
    check('first_correct', (ctx.totalQuestionsAllModes ?? 0) >= 1);
    check('questions_1000', (ctx.totalQuestionsAllModes ?? 0) >= 1000);
    check('questions_5000', (ctx.totalQuestionsAllModes ?? 0) >= 5000);

    // New: Perfect solo round
    check('perfect_solo_round', ctx.perfectSoloSession === true);

    // New: Match wins extension
    check('match_50_wins', (ctx.matchWins ?? 0) >= 50);
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/achievements/achievements.service.ts
git commit -m "feat(achievements): progress calculation + 25 new achievement checks"
```

---

## Task 5: Backend — Update Controller to Use Progress Endpoint

**Files:**
- Modify: `backend/src/achievements/achievements.controller.ts`

- [ ] **Step 1: Wire `getForUserWithProgress`**

Replace the controller method:

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { AchievementsService } from './achievements.service';

@Controller('api/achievements')
export class AchievementsController {
  constructor(private readonly achievementsService: AchievementsService) {}

  @Get(':userId')
  async getForUser(@Param('userId') userId: string) {
    return this.achievementsService.getForUserWithProgress(userId);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/achievements/achievements.controller.ts
git commit -m "feat(achievements): serve progress data from GET /api/achievements/:userId"
```

---

## Task 6: Backend — Wire Achievement Tracking in Game Mode Services

**Files:**
- Modify: `backend/src/solo/solo.service.ts`
- Modify: `backend/src/duel/duel.service.ts`
- Modify: `backend/src/battle-royale/battle-royale.service.ts`
- Modify: `backend/src/logo-quiz/logo-quiz.service.ts`
- Modify: `backend/src/blitz/blitz.service.ts`

- [ ] **Step 1: Solo service — add streak, total questions, daily streak, perfect session tracking**

In `solo.service.ts`, at the end-session logic where `checkAndAward` is called, expand the context. Find the existing `checkAndAward` call and replace with:

```typescript
// Update daily streak
const { current_daily_streak: dailyStreak } = await this.supabaseService.updateDailyStreak(userId);

// Update total questions across all modes
const totalQuestions = await this.supabaseService.incrementTotalQuestions(userId, session.questionsAnswered);

// Track correct streak
const currentStreak = await this.supabaseService.getCorrectStreak(userId);
await this.supabaseService.updateMaxCorrectStreak(userId, currentStreak);

// Track mode played
const modesPlayed = await this.supabaseService.addModePlayed(userId, 'solo');

// Check if perfect session (all correct, at least 5 questions)
const perfectSession = session.questionsAnswered >= 5 && session.correctAnswers === session.questionsAnswered;

const newlyUnlocked = await this.achievementsService.checkAndAward(userId, {
  currentElo: session.currentElo,
  soloGamesPlayed: profile.games_played,
  soloAccuracy: accuracy,
  currentStreak,
  maxCorrectStreak: currentStreak,
  dailyStreak,
  totalQuestionsAllModes: totalQuestions,
  modesPlayed,
  perfectSoloSession: perfectSession,
});
```

- [ ] **Step 2: Duel service — track duel wins, daily streak, modes played**

In `duel.service.ts`, find where a duel game finishes (status changes to `finished`). After determining the winner, add:

```typescript
// After determining winnerId from scores comparison
if (winnerId) {
  const duelWins = await this.supabaseService.incrementDuelWins(winnerId);
  const duelGames = await this.supabaseService.getDuelGameCount(winnerId);
  const { current_daily_streak: dailyStreak } = await this.supabaseService.updateDailyStreak(winnerId);
  const modesPlayed = await this.supabaseService.addModePlayed(winnerId, 'duel');

  await this.achievementsService.checkAndAward(winnerId, {
    duelWins,
    duelGamesPlayed: duelGames,
    dailyStreak,
    modesPlayed,
  }).catch(e => this.logger.warn(`Achievement check failed: ${e?.message}`));
}

// Also award first_duel to the loser
const loserId = winnerId === row.host_id ? row.guest_id : row.host_id;
if (loserId) {
  const loserDuelGames = await this.supabaseService.getDuelGameCount(loserId);
  const { current_daily_streak: loserDailyStreak } = await this.supabaseService.updateDailyStreak(loserId);
  const loserModesPlayed = await this.supabaseService.addModePlayed(loserId, 'duel');

  await this.achievementsService.checkAndAward(loserId, {
    duelGamesPlayed: loserDuelGames,
    dailyStreak: loserDailyStreak,
    modesPlayed: loserModesPlayed,
  }).catch(e => this.logger.warn(`Achievement check failed: ${e?.message}`));
}
```

Note: The `AchievementsModule` must be imported in `DuelModule`. Check if it's already imported — if not, add `AchievementsModule` to the DuelModule imports array and inject `AchievementsService` in the DuelService constructor.

- [ ] **Step 3: Battle Royale service — track BR wins, daily streak, modes played**

In `battle-royale.service.ts`, after the match finishes and winner is determined, add achievement checks. Find the `checkAndFinishRoom` method. After determining the winner (player with highest score):

```typescript
// After room finishes and winner is determined
const { current_daily_streak: dailyStreak } = await this.supabaseService.updateDailyStreak(winnerId);
const brWins = await this.supabaseService.incrementBrWins(winnerId);
const modesPlayed = await this.supabaseService.addModePlayed(winnerId, 'battle_royale');

await this.achievementsService.checkAndAward(winnerId, {
  brWins,
  brGamesPlayed: 1, // at least 1 since they just played
  dailyStreak,
  modesPlayed,
}).catch(e => this.logger.warn(`Achievement check failed: ${e?.message}`));

// Award first_battle_royale to all participants
for (const player of room.players) {
  if (player.user_id === winnerId) continue;
  const playerModes = await this.supabaseService.addModePlayed(player.user_id, 'battle_royale');
  await this.supabaseService.updateDailyStreak(player.user_id);
  await this.achievementsService.checkAndAward(player.user_id, {
    brGamesPlayed: 1,
    modesPlayed: playerModes,
  }).catch(e => this.logger.warn(`Achievement check failed: ${e?.message}`));
}
```

Note: `AchievementsModule` must be imported in `BattleRoyaleModule` if not already.

- [ ] **Step 4: Logo Quiz service — track logo correct count, daily streak, modes played**

In `logo-quiz.service.ts`, when a player answers correctly, call:

```typescript
const logoCorrect = await this.supabaseService.incrementLogoQuizCorrect(userId);
```

And in the existing `checkAchievements` call, expand:

```typescript
const { current_daily_streak: dailyStreak } = await this.supabaseService.updateDailyStreak(userId);
const modesPlayed = await this.supabaseService.addModePlayed(userId, 'logo_quiz');

await this.achievementsService.checkAndAward(userId, {
  currentElo: profile.logo_quiz_elo,
  logoQuizCorrect: logoCorrect,
  dailyStreak,
  modesPlayed,
});
```

- [ ] **Step 5: Blitz service — add daily streak, modes played, total questions**

In `blitz.service.ts`, at the end-session call, expand:

```typescript
const { current_daily_streak: dailyStreak } = await this.supabaseService.updateDailyStreak(userId);
const totalQuestions = await this.supabaseService.incrementTotalQuestions(userId, session.totalAnswered);
const modesPlayed = await this.supabaseService.addModePlayed(userId, 'blitz');

const newlyUnlocked = await this.achievementsService.checkAndAward(userId, {
  blitzBestScore: session.score,
  dailyStreak,
  totalQuestionsAllModes: totalQuestions,
  modesPlayed,
});
```

- [ ] **Step 6: Mayhem service — add daily streak, modes played**

In `mayhem-session.service.ts`, expand the existing `checkAndAward` call:

```typescript
const { current_daily_streak: dailyStreak } = await this.supabaseService.updateDailyStreak(userId);
const modesPlayed = await this.supabaseService.addModePlayed(userId, 'mayhem');

await this.achievementsService.checkAndAward(userId, {
  mayhemGamesPlayed: updatedStats?.games_played ?? 0,
  dailyStreak,
  modesPlayed,
});
```

- [ ] **Step 7: Add AchievementsModule to any modules that don't already import it**

Check DuelModule, BattleRoyaleModule, BlitzModule, MayhemModule — add `AchievementsModule` to imports and inject `AchievementsService` in the service constructors where needed.

- [ ] **Step 8: Commit**

```bash
git add backend/src/solo/ backend/src/duel/ backend/src/battle-royale/ backend/src/logo-quiz/ backend/src/blitz/ backend/src/mayhem/
git commit -m "feat(achievements): wire achievement tracking across all game modes"
```

---

## Task 7: Frontend — Achievement Progress Display

**Files:**
- Modify: `frontend/src/app/core/achievements-api.service.ts`
- Modify: `frontend/src/app/features/profile/profile.html`
- Modify: `frontend/src/app/features/profile/profile.ts`

- [ ] **Step 1: Update frontend Achievement interface**

In `frontend/src/app/core/achievements-api.service.ts`, add `current` and `target`:

```typescript
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned_at: string | null;
  current: number;
  target: number;
}
```

- [ ] **Step 2: Add progress helper in profile component**

In `frontend/src/app/features/profile/profile.ts`, add a helper method:

```typescript
progressPercent(a: Achievement): number {
  if (a.earned_at) return 100;
  if (a.target <= 0) return 0;
  return Math.round((a.current / a.target) * 100);
}
```

- [ ] **Step 3: Update achievement tile template with progress bar**

In `frontend/src/app/features/profile/profile.html`, replace the achievements grid section (lines 308-315):

```html
        <div class="achievements-grid">
          @for (a of achievements(); track a.id) {
            <div class="achievement-tile" [class.achievement-tile--locked]="!a.earned_at" [title]="a.name + ': ' + a.description">
              <span class="achievement-tile__icon">{{ a.icon }}</span>
              <span class="achievement-tile__name">{{ a.name }}</span>
              @if (!a.earned_at && a.target > 1) {
                <div class="achievement-tile__progress">
                  <div class="achievement-tile__progress-bar">
                    <div class="achievement-tile__progress-fill" [style.width.%]="progressPercent(a)"></div>
                  </div>
                  <span class="achievement-tile__progress-text">{{ a.current }} / {{ a.target }}</span>
                </div>
              }
            </div>
          }
        </div>
```

- [ ] **Step 4: Add progress bar CSS**

In the profile component CSS file, add:

```css
.achievement-tile__progress {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin-top: 4px;
}

.achievement-tile__progress-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.achievement-tile__progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #f59e0b, #eab308);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.achievement-tile__progress-text {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.5);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/achievements-api.service.ts frontend/src/app/features/profile/
git commit -m "feat(achievements): display progress bars on achievement tiles"
```

---

## Task 8: Verify and Build

- [ ] **Step 1: Build backend**

```bash
cd /Users/instashop/Projects/football-quizball/backend && npm run build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 2: Build frontend**

```bash
cd /Users/instashop/Projects/football-quizball/frontend && npx ng build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 3: Apply migration to Supabase**

Verify the migration applies cleanly to the remote database.

- [ ] **Step 4: Smoke test**

- Check `GET /api/achievements/{userId}` returns 38 achievements with `current` and `target` fields
- Play a Solo session and verify `newly_unlocked` includes new achievements like `first_correct`
- Check profile page shows progress bars on locked achievements

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(achievements): 25 new achievements with progress tracking

Add early hook achievements (first_correct, streak_3, first_duel, first_logo, first_battle_royale),
mid-game achievements (streak_10, duel_5_wins, logo_50, all_modes, daily_3, perfect_solo_round,
blitz_150, accuracy_90), and long-term chase achievements (solo_100/500, streak_25, duel_50/100_wins,
logo_250, daily_7/30, elo_2000, match_50_wins, br_wins_10/50, questions_1000/5000).

Progress tracking shows current/target on all achievement tiles in the profile page."
```
