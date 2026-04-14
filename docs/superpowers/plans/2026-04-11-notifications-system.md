# Notifications System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a notifications system with a bell icon in the top nav, a `/notifications` inbox page, and backend notification generation for challenges, leaderboard changes, duel results, and achievements.

**Architecture:** Hybrid approach — Supabase `notifications` table for persistent events (challenges, leaderboard, duels, achievements), frontend-derived entries for content availability (news/daily questions). NestJS NotificationsModule with CRUD service + REST controller. Angular standalone NotificationsComponent with NotificationsApiService merging both sources.

**Tech Stack:** NestJS, Supabase (Postgres + RLS), Angular 20 (standalone components, signals), class-validator

**Spec:** `docs/superpowers/specs/2026-04-11-notifications-system-design.md`

---

## File Map

### New Files (Backend)
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260601000000_create_notifications.sql` | Create notifications table, indexes, RLS, retention cron |
| `backend/src/notifications/notifications.module.ts` | NestJS module wiring |
| `backend/src/notifications/notifications.service.ts` | CRUD operations on notifications table |
| `backend/src/notifications/notifications.service.spec.ts` | Unit tests for service |
| `backend/src/notifications/notifications.controller.ts` | REST endpoints (GET, PATCH) |
| `backend/src/notifications/dto/create-notification.dto.ts` | DTO for internal creation |
| `backend/src/notifications/dto/challenge.dto.ts` | DTO for challenge endpoint |

### New Files (Frontend)
| File | Responsibility |
|------|---------------|
| `frontend/src/app/models/notification.model.ts` | TypeScript interfaces |
| `frontend/src/app/core/notifications-api.service.ts` | HTTP service + unread count signal |
| `frontend/src/app/features/notifications/notifications.ts` | Page component |
| `frontend/src/app/features/notifications/notifications.html` | Feed template |
| `frontend/src/app/features/notifications/notifications.css` | Styles |

### Modified Files
| File | Change |
|------|--------|
| `backend/src/app.module.ts` | Import NotificationsModule |
| `frontend/src/app/app.routes.ts` | Add `/notifications` route |
| `frontend/src/app/shared/top-nav/top-nav.ts` | Inject NotificationsApiService, add bell button |
| `frontend/src/app/shared/top-nav/top-nav.html` | Add bell icon + badge markup |
| `frontend/src/app/shared/top-nav/top-nav.css` | Add bell-btn + badge styles |
| `frontend/src/app/features/home/home.ts` | Remove NotificationBannerComponent import |
| `frontend/src/app/features/home/home.html` | Remove `<app-notification-banner>` tags |

### Deleted Files
| File | Reason |
|------|--------|
| `frontend/src/app/shared/notification-banner/notification-banner.ts` | Replaced by notifications page |
| `frontend/src/app/shared/notification-banner/notification-banner.html` | Replaced by notifications page |
| `frontend/src/app/shared/notification-banner/notification-banner.css` | Replaced by notifications page |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260601000000_create_notifications.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Create notifications table
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  icon        text,
  route       text,
  metadata    jsonb DEFAULT '{}',
  read        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- Index for fetching user's notifications (newest first)
CREATE INDEX idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- Partial index for unread count queries
CREATE INDEX idx_notifications_user_unread
  ON notifications (user_id) WHERE read = false;

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-delete notifications older than 30 days (runs daily at 3am UTC)
SELECT cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * *',
  $$DELETE FROM notifications WHERE created_at < now() - interval '30 days'$$
);
```

- [ ] **Step 2: Run the migration**

Run: `cd /Users/instashop/Projects/football-quizball && npx supabase db push`

Expected: Migration applies successfully, `notifications` table created.

- [ ] **Step 3: Verify table exists**

Run: `npx supabase db reset --dry-run` or check via Supabase dashboard that the `notifications` table exists with correct columns and RLS policies.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260601000000_create_notifications.sql
git commit -m "feat: add notifications table with RLS and retention cron"
```

---

## Task 2: Backend — NotificationsService + DTO

**Files:**
- Create: `backend/src/notifications/dto/create-notification.dto.ts`
- Create: `backend/src/notifications/notifications.service.ts`
- Create: `backend/src/notifications/notifications.service.spec.ts`

- [ ] **Step 1: Write the DTO**

Create `backend/src/notifications/dto/create-notification.dto.ts`:

```typescript
export class CreateNotificationDto {
  userId: string;
  type: string;
  title: string;
  body: string;
  icon?: string;
  route?: string;
  metadata?: Record<string, unknown>;
}
```

- [ ] **Step 2: Write the failing tests**

Create `backend/src/notifications/notifications.service.spec.ts`:

```typescript
import { NotificationsService } from './notifications.service';

function buildMockSupabase() {
  const mockFrom = jest.fn();
  return {
    client: { from: mockFrom },
    __mockFrom: mockFrom,
  };
}

function buildSelectChain(data: unknown[], count?: number) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          range: jest.fn().mockResolvedValue({ data, error: null }),
        }),
      }),
    }),
  };
}

function buildCountChain(count: number) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ count, error: null }),
      }),
    }),
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockSupabase: ReturnType<typeof buildMockSupabase>;

  beforeEach(() => {
    mockSupabase = buildMockSupabase();
    service = new NotificationsService(mockSupabase as any);
  });

  describe('create', () => {
    it('inserts a notification row', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.__mockFrom.mockReturnValue({ insert: insertMock });

      await service.create({
        userId: 'user-1',
        type: 'duel_result',
        title: 'You won!',
        body: '+28 ELO',
        icon: '🎯',
        route: '/duel',
      });

      expect(mockSupabase.__mockFrom).toHaveBeenCalledWith('notifications');
      expect(insertMock).toHaveBeenCalledWith({
        user_id: 'user-1',
        type: 'duel_result',
        title: 'You won!',
        body: '+28 ELO',
        icon: '🎯',
        route: '/duel',
        metadata: {},
      });
    });
  });

  describe('getForUser', () => {
    it('returns notifications ordered by created_at desc', async () => {
      const rows = [
        { id: 'n1', type: 'duel_result', title: 'Win', body: 'body', created_at: '2026-04-11T10:00:00Z' },
        { id: 'n2', type: 'achievement_unlocked', title: 'Ach', body: 'body2', created_at: '2026-04-11T09:00:00Z' },
      ];
      const rangeMock = jest.fn().mockResolvedValue({ data: rows, error: null });
      const orderMock = jest.fn().mockReturnValue({ range: rangeMock });
      const eqMock = jest.fn().mockReturnValue({ order: orderMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      mockSupabase.__mockFrom.mockReturnValue({ select: selectMock });

      const result = await service.getForUser('user-1', 50, 0);

      expect(selectMock).toHaveBeenCalledWith('*');
      expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1');
      expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(rangeMock).toHaveBeenCalledWith(0, 49);
      expect(result).toEqual(rows);
    });
  });

  describe('markAsRead', () => {
    it('updates read=true for the given notification', async () => {
      const eqUserMock = jest.fn().mockResolvedValue({ error: null });
      const eqIdMock = jest.fn().mockReturnValue({ eq: eqUserMock });
      const updateMock = jest.fn().mockReturnValue({ eq: eqIdMock });
      mockSupabase.__mockFrom.mockReturnValue({ update: updateMock });

      await service.markAsRead('user-1', 'notif-1');

      expect(updateMock).toHaveBeenCalledWith({ read: true });
      expect(eqIdMock).toHaveBeenCalledWith('id', 'notif-1');
      expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });

  describe('markAllAsRead', () => {
    it('bulk-updates all unread notifications for user', async () => {
      const eqReadMock = jest.fn().mockResolvedValue({ error: null });
      const eqUserMock = jest.fn().mockReturnValue({ eq: eqReadMock });
      const updateMock = jest.fn().mockReturnValue({ eq: eqUserMock });
      mockSupabase.__mockFrom.mockReturnValue({ update: updateMock });

      await service.markAllAsRead('user-1');

      expect(updateMock).toHaveBeenCalledWith({ read: true });
      expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
      expect(eqReadMock).toHaveBeenCalledWith('read', false);
    });
  });

  describe('getUnreadCount', () => {
    it('returns the count of unread notifications', async () => {
      const eqReadMock = jest.fn().mockResolvedValue({ count: 5, error: null });
      const eqUserMock = jest.fn().mockReturnValue({ eq: eqReadMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqUserMock });
      mockSupabase.__mockFrom.mockReturnValue({ select: selectMock });

      const count = await service.getUnreadCount('user-1');

      expect(selectMock).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
      expect(eqReadMock).toHaveBeenCalledWith('read', false);
      expect(count).toBe(5);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx jest notifications.service.spec --no-coverage`

Expected: FAIL — `Cannot find module './notifications.service'`

- [ ] **Step 4: Write the NotificationsService implementation**

Create `backend/src/notifications/notifications.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  icon: string | null;
  route: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async create(dto: CreateNotificationDto): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('notifications')
      .insert({
        user_id: dto.userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        icon: dto.icon ?? null,
        route: dto.route ?? null,
        metadata: dto.metadata ?? {},
      });

    if (error) {
      this.logger.error(`Failed to create notification: ${error.message}`);
    }
  }

  async getForUser(userId: string, limit = 50, offset = 0): Promise<NotificationRow[]> {
    const { data, error } = await this.supabaseService.client
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error(`Failed to fetch notifications: ${error.message}`);
      return [];
    }

    return (data ?? []) as NotificationRow[];
  }

  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Failed to mark notification as read: ${error.message}`);
    }
  }

  async markAllAsRead(userId: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      this.logger.error(`Failed to mark all as read: ${error.message}`);
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await this.supabaseService.client
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      this.logger.error(`Failed to get unread count: ${error.message}`);
      return 0;
    }

    return count ?? 0;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx jest notifications.service.spec --no-coverage`

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/notifications/dto/create-notification.dto.ts backend/src/notifications/notifications.service.ts backend/src/notifications/notifications.service.spec.ts
git commit -m "feat: add NotificationsService with CRUD operations"
```

---

## Task 3: Backend — NotificationsController

**Files:**
- Create: `backend/src/notifications/notifications.controller.ts`
- Create: `backend/src/notifications/dto/challenge.dto.ts`

- [ ] **Step 1: Write the challenge DTO**

Create `backend/src/notifications/dto/challenge.dto.ts`:

```typescript
import { IsString, IsIn, IsOptional } from 'class-validator';

export class ChallengeDto {
  @IsString()
  targetUserId: string;

  @IsString()
  @IsIn(['standard', 'logo'])
  gameType: string;

  @IsString()
  @IsOptional()
  message?: string;
}
```

- [ ] **Step 2: Write the controller**

Create `backend/src/notifications/notifications.controller.ts`:

```typescript
import { Controller, Get, Patch, Post, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ChallengeDto } from './dto/challenge.dto';
import type { AuthenticatedRequest } from '../common/interfaces/request.interface';

@Controller('api/notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async getNotifications(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const l = Math.min(Math.max(parseInt(limit ?? '50', 10) || 50, 1), 100);
    const o = Math.max(parseInt(offset ?? '0', 10) || 0, 0);
    return this.notificationsService.getForUser(req.user.id, l, o);
  }

  @Patch(':id/read')
  @UseGuards(AuthGuard)
  async markAsRead(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    await this.notificationsService.markAsRead(req.user.id, id);
    return { success: true };
  }

  @Patch('read-all')
  @UseGuards(AuthGuard)
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    await this.notificationsService.markAllAsRead(req.user.id);
    return { success: true };
  }

  @Get('unread-count')
  @UseGuards(AuthGuard)
  async getUnreadCount(@Req() req: AuthenticatedRequest) {
    const count = await this.notificationsService.getUnreadCount(req.user.id);
    return { count };
  }

  @Post('challenge')
  @UseGuards(AuthGuard)
  async sendChallenge(@Req() req: AuthenticatedRequest, @Body() body: ChallengeDto) {
    const challenger = await this.supabaseService.getProfile(req.user.id);
    const challengerName = challenger?.username ?? 'Someone';
    const modeLabel = body.gameType === 'logo' ? 'Logo Duel' : 'Standard Duel';
    const route = body.gameType === 'logo' ? '/duel?mode=logo' : '/duel';

    await this.notificationsService.create({
      userId: body.targetUserId,
      type: 'challenge_received',
      title: `${challengerName} challenged you!`,
      body: `${modeLabel} — tap to accept`,
      icon: '⚔️',
      route,
      metadata: {
        challengerId: req.user.id,
        challengerName,
        gameType: body.gameType,
        message: body.message,
      },
    });

    return { success: true };
  }
}
```

- [ ] **Step 3: Verify the controller compiles**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty`

Expected: No type errors in the notifications files.

- [ ] **Step 4: Commit**

```bash
git add backend/src/notifications/notifications.controller.ts backend/src/notifications/dto/challenge.dto.ts
git commit -m "feat: add NotificationsController with REST endpoints and challenge"
```

---

## Task 4: Backend — Module Wiring

**Files:**
- Create: `backend/src/notifications/notifications.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create the module**

Create `backend/src/notifications/notifications.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [AuthModule, SupabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 2: Add NotificationsModule to AppModule**

In `backend/src/app.module.ts`, add the import:

```typescript
import { NotificationsModule } from './notifications/notifications.module';
```

Add `NotificationsModule` to the `imports` array (after `AchievementsModule`).

- [ ] **Step 3: Verify the backend builds**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty`

Expected: No errors.

- [ ] **Step 4: Run all backend tests**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx jest --no-coverage`

Expected: All existing tests still pass, plus the new notifications tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/notifications.module.ts backend/src/app.module.ts
git commit -m "feat: wire NotificationsModule into AppModule"
```

---

## Task 5: Frontend — Notification Model + API Service

**Files:**
- Create: `frontend/src/app/models/notification.model.ts`
- Create: `frontend/src/app/core/notifications-api.service.ts`

- [ ] **Step 1: Create the notification model**

Create `frontend/src/app/models/notification.model.ts`:

```typescript
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  icon: string;
  route: string;
  read: boolean;
  createdAt: string;
  source: 'backend' | 'frontend';
}

export interface NotificationGroup {
  label: string;
  notifications: AppNotification[];
}
```

- [ ] **Step 2: Create the NotificationsApiService**

Create `frontend/src/app/core/notifications-api.service.ts`:

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, catchError, of } from 'rxjs';
import { AuthService } from './auth.service';
import { NewsApiService } from './news-api.service';
import { DailyApiService } from './daily-api.service';
import { environment } from '../../environments/environment';
import type { AppNotification, NotificationGroup } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly newsApi = inject(NewsApiService);
  private readonly dailyApi = inject(DailyApiService);
  private readonly base = `${environment.apiUrl}/api/notifications`;

  readonly unreadCount = signal(0);

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  async fetchNotifications(): Promise<AppNotification[]> {
    const [backendNotifs, frontendNotifs] = await Promise.all([
      this.fetchBackendNotifications(),
      this.buildFrontendNotifications(),
    ]);

    const merged = [...backendNotifs, ...frontendNotifs];
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return merged;
  }

  private async fetchBackendNotifications(): Promise<AppNotification[]> {
    try {
      const rows = await firstValueFrom(
        this.http.get<any[]>(this.base, { headers: this.headers() }).pipe(
          catchError(() => of([])),
        ),
      );
      return (rows ?? []).map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        icon: r.icon ?? '',
        route: r.route ?? '/',
        read: r.read,
        createdAt: r.created_at,
        source: 'backend' as const,
      }));
    } catch {
      return [];
    }
  }

  private async buildFrontendNotifications(): Promise<AppNotification[]> {
    const notifs: AppNotification[] = [];

    try {
      const newsMeta = await firstValueFrom(
        this.newsApi.getMetadata().pipe(catchError(() => of(null))),
      );
      if (newsMeta && newsMeta.questions_remaining > 0) {
        const dismissedKey = localStorage.getItem('qb_notif_news_dismissed');
        const isRead = dismissedKey === newsMeta.expires_at;
        notifs.push({
          id: `frontend-news-${newsMeta.expires_at}`,
          type: 'new_news_round',
          title: 'New News questions!',
          body: `${newsMeta.questions_remaining} questions — play now`,
          icon: '📰',
          route: '/news',
          read: isRead,
          createdAt: new Date().toISOString(),
          source: 'frontend',
        });
      }
    } catch { /* ignore */ }

    try {
      const dailyMeta = await firstValueFrom(
        this.dailyApi.getMetadata().pipe(catchError(() => of(null))),
      );
      if (dailyMeta && dailyMeta.count > 0) {
        const dismissedKey = localStorage.getItem('qb_notif_daily_dismissed');
        const isRead = dismissedKey === dailyMeta.resetsAt;
        notifs.push({
          id: `frontend-daily-${dailyMeta.resetsAt}`,
          type: 'new_daily_round',
          title: 'New TiF questions!',
          body: 'New Today in Football questions available',
          icon: '📅',
          route: '/daily',
          read: isRead,
          createdAt: new Date().toISOString(),
          source: 'frontend',
        });
      }
    } catch { /* ignore */ }

    return notifs;
  }

  async markAsRead(notification: AppNotification): Promise<void> {
    if (notification.source === 'backend') {
      await firstValueFrom(
        this.http.patch(`${this.base}/${notification.id}/read`, {}, { headers: this.headers() }).pipe(
          catchError(() => of(null)),
        ),
      );
    } else if (notification.type === 'new_news_round') {
      const batchKey = notification.id.replace('frontend-news-', '');
      localStorage.setItem('qb_notif_news_dismissed', batchKey);
    } else if (notification.type === 'new_daily_round') {
      const batchKey = notification.id.replace('frontend-daily-', '');
      localStorage.setItem('qb_notif_daily_dismissed', batchKey);
    }

    this.unreadCount.update((c) => Math.max(0, c - 1));
  }

  async markAllAsRead(): Promise<void> {
    await firstValueFrom(
      this.http.patch(`${this.base}/read-all`, {}, { headers: this.headers() }).pipe(
        catchError(() => of(null)),
      ),
    );

    // Also mark frontend-derived as read
    try {
      const newsMeta = await firstValueFrom(this.newsApi.getMetadata().pipe(catchError(() => of(null))));
      if (newsMeta) localStorage.setItem('qb_notif_news_dismissed', newsMeta.expires_at);
    } catch { /* ignore */ }
    try {
      const dailyMeta = await firstValueFrom(this.dailyApi.getMetadata().pipe(catchError(() => of(null))));
      if (dailyMeta) localStorage.setItem('qb_notif_daily_dismissed', dailyMeta.resetsAt);
    } catch { /* ignore */ }

    this.unreadCount.set(0);
  }

  async refreshUnreadCount(): Promise<void> {
    if (!this.auth.accessToken()) {
      this.unreadCount.set(0);
      return;
    }

    try {
      const [backendResult, frontendNotifs] = await Promise.all([
        firstValueFrom(
          this.http.get<{ count: number }>(`${this.base}/unread-count`, { headers: this.headers() }).pipe(
            catchError(() => of({ count: 0 })),
          ),
        ),
        this.buildFrontendNotifications(),
      ]);

      const frontendUnread = frontendNotifs.filter((n) => !n.read).length;
      this.unreadCount.set((backendResult?.count ?? 0) + frontendUnread);
    } catch {
      this.unreadCount.set(0);
    }
  }

  groupByTime(notifications: AppNotification[]): NotificationGroup[] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    const groups: Record<string, AppNotification[]> = {
      Today: [],
      Yesterday: [],
      'Earlier this week': [],
      Older: [],
    };

    for (const n of notifications) {
      const d = new Date(n.createdAt);
      if (d >= today) groups['Today'].push(n);
      else if (d >= yesterday) groups['Yesterday'].push(n);
      else if (d >= weekAgo) groups['Earlier this week'].push(n);
      else groups['Older'].push(n);
    }

    return Object.entries(groups)
      .filter(([, notifs]) => notifs.length > 0)
      .map(([label, notifications]) => ({ label, notifications }));
  }
}
```

- [ ] **Step 3: Verify the frontend compiles**

Run: `cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=production 2>&1 | head -20`

Expected: No type errors related to the new files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/models/notification.model.ts frontend/src/app/core/notifications-api.service.ts
git commit -m "feat: add NotificationsApiService with hybrid fetch and unread count"
```

---

## Task 6: Frontend — Top Nav Bell Icon + Badge

**Files:**
- Modify: `frontend/src/app/shared/top-nav/top-nav.ts`
- Modify: `frontend/src/app/shared/top-nav/top-nav.html`
- Modify: `frontend/src/app/shared/top-nav/top-nav.css`

- [ ] **Step 1: Add NotificationsApiService injection to top-nav.ts**

In `frontend/src/app/shared/top-nav/top-nav.ts`:

Add import at top:
```typescript
import { NotificationsApiService } from '../../core/notifications-api.service';
```

Add injection inside the component class (alongside existing `inject()` calls):
```typescript
readonly notificationsApi = inject(NotificationsApiService);
```

In `ngOnInit()`, after the existing `effect()` block that loads profile data, add:
```typescript
this.notificationsApi.refreshUnreadCount();
```

- [ ] **Step 2: Add bell icon markup to top-nav.html**

In `frontend/src/app/shared/top-nav/top-nav.html`, find the logged-in right section — it has the settings button. Add the bell button BEFORE the settings button:

```html
<button class="top-nav__bell-btn pressable" aria-label="Notifications" routerLink="/notifications">
  <span class="material-icons">notifications</span>
  @if (notificationsApi.unreadCount() > 0) {
    <span class="top-nav__bell-badge">{{ notificationsApi.unreadCount() > 9 ? '9+' : notificationsApi.unreadCount() }}</span>
  }
</button>
```

Also add the same bell button in the logged-out right section (before the sign-in button), but only if the user is logged in — since the bell only shows for authenticated users, no changes needed for logged-out section.

- [ ] **Step 3: Add bell button and badge CSS**

In `frontend/src/app/shared/top-nav/top-nav.css`, add after the `.top-nav__settings-btn` block:

```css
.top-nav__bell-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: color 0.15s, background 0.15s;
  flex-shrink: 0;
}

.top-nav__bell-btn .material-icons {
  font-size: 1.125rem;
}

.top-nav__bell-btn:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.08);
}

.top-nav__bell-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 18px;
  height: 18px;
  background: #FF3B30;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  padding: 0 4px;
  border: 2px solid var(--color-surface, rgba(10, 10, 20, 0.95));
  line-height: 1;
}
```

- [ ] **Step 4: Add RouterLink import if not already present**

In `top-nav.ts`, verify that `RouterLink` is in the `imports` array of the component decorator. If not, add:
```typescript
import { RouterLink } from '@angular/router';
```
And add `RouterLink` to the `imports: [...]` array.

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=production 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/shared/top-nav/top-nav.ts frontend/src/app/shared/top-nav/top-nav.html frontend/src/app/shared/top-nav/top-nav.css
git commit -m "feat: add bell icon with unread badge to top nav"
```

---

## Task 7: Frontend — Notifications Page Component

**Files:**
- Create: `frontend/src/app/features/notifications/notifications.ts`
- Create: `frontend/src/app/features/notifications/notifications.html`
- Create: `frontend/src/app/features/notifications/notifications.css`
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Create the component TypeScript**

Create `frontend/src/app/features/notifications/notifications.ts`:

```typescript
import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationsApiService } from '../../core/notifications-api.service';
import type { AppNotification, NotificationGroup } from '../../models/notification.model';

@Component({
  selector: 'app-notifications',
  standalone: true,
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly notificationsApi = inject(NotificationsApiService);

  readonly groups = signal<NotificationGroup[]>([]);
  readonly loading = signal(true);
  readonly empty = signal(false);

  async ngOnInit() {
    await this.loadNotifications();
  }

  private async loadNotifications() {
    this.loading.set(true);
    const all = await this.notificationsApi.fetchNotifications();
    this.groups.set(this.notificationsApi.groupByTime(all));
    this.empty.set(all.length === 0);
    this.loading.set(false);
  }

  async onTapNotification(notification: AppNotification) {
    await this.notificationsApi.markAsRead(notification);
    notification.read = true;
    this.groups.update((g) => [...g]);
    this.router.navigateByUrl(notification.route);
  }

  async markAllRead() {
    await this.notificationsApi.markAllAsRead();
    await this.loadNotifications();
  }

  goBack() {
    this.router.navigate(['/']);
  }

  relativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }
}
```

- [ ] **Step 2: Create the template**

Create `frontend/src/app/features/notifications/notifications.html`:

```html
<div class="notifications-page">
  <div class="notifications-header">
    <div class="notifications-header__left">
      <button class="notifications-back-btn pressable" (click)="goBack()">
        <span class="material-icons">arrow_back</span>
      </button>
      <h1 class="notifications-title">Notifications</h1>
    </div>
    <button class="notifications-mark-all pressable" (click)="markAllRead()">Mark all read</button>
  </div>

  @if (loading()) {
    <div class="notifications-loading">
      <span class="material-icons notifications-spinner">sync</span>
    </div>
  } @else if (empty()) {
    <div class="notifications-empty">
      <span class="notifications-empty__icon">⚽</span>
      <p class="notifications-empty__text">You're all caught up!</p>
    </div>
  } @else {
    <div class="notifications-feed">
      @for (group of groups(); track group.label) {
        <div class="notifications-group">
          <div class="notifications-group__label">{{ group.label }}</div>
          @for (n of group.notifications; track n.id) {
            <button class="notification-card pressable" [class.notification-card--unread]="!n.read" (click)="onTapNotification(n)">
              <div class="notification-card__icon">{{ n.icon }}</div>
              <div class="notification-card__content">
                <div class="notification-card__title">{{ n.title }}</div>
                <div class="notification-card__body">{{ n.body }}</div>
                <div class="notification-card__time">{{ relativeTime(n.createdAt) }}</div>
              </div>
              @if (!n.read) {
                <div class="notification-card__dot"></div>
              }
            </button>
          }
        </div>
      }
    </div>
  }
</div>
```

- [ ] **Step 3: Create the styles**

Create `frontend/src/app/features/notifications/notifications.css`:

```css
.notifications-page {
  min-height: 100vh;
  background: var(--color-bg, #0a0a14);
  padding-bottom: 6rem;
}

.notifications-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  position: sticky;
  top: 3.75rem;
  z-index: 10;
  background: var(--color-bg, #0a0a14);
}

.notifications-header__left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.notifications-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border-radius: var(--radius-md, 0.625rem);
}

.notifications-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.notifications-mark-all {
  font-size: 0.8125rem;
  color: rgba(100, 160, 255, 0.9);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
}

/* Loading */
.notifications-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
}

.notifications-spinner {
  font-size: 2rem;
  color: rgba(255, 255, 255, 0.3);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Empty state */
.notifications-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  gap: 1rem;
}

.notifications-empty__icon {
  font-size: 3rem;
}

.notifications-empty__text {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
}

/* Feed */
.notifications-feed {
  padding: 0 1.25rem;
}

.notifications-group__label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1rem 0 0.5rem;
}

/* Card */
.notification-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  padding: 0.875rem 0;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.notification-card--unread {
  background: rgba(100, 160, 255, 0.04);
  margin: 0 -1.25rem;
  padding-left: 1.25rem;
  padding-right: 1.25rem;
}

.notification-card__icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  flex-shrink: 0;
}

.notification-card__content {
  flex: 1;
  min-width: 0;
}

.notification-card__title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  line-height: 1.3;
}

.notification-card--unread .notification-card__title {
  color: #fff;
}

.notification-card:not(.notification-card--unread) .notification-card__title {
  color: rgba(255, 255, 255, 0.7);
}

.notification-card__body {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.4;
  margin-top: 0.125rem;
}

.notification-card:not(.notification-card--unread) .notification-card__body {
  color: rgba(255, 255, 255, 0.35);
}

.notification-card__time {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.25);
  margin-top: 0.25rem;
}

.notification-card__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #3B82F6;
  margin-top: 0.375rem;
  flex-shrink: 0;
}
```

- [ ] **Step 4: Add the route**

In `frontend/src/app/app.routes.ts`, add the route (among the other feature routes, near `/leaderboard`):

```typescript
{
  path: 'notifications',
  loadComponent: () => import('./features/notifications/notifications').then(m => m.NotificationsComponent),
  canActivate: [authGuard],
},
```

- [ ] **Step 5: Verify frontend builds**

Run: `cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=production 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/notifications/ frontend/src/app/app.routes.ts
git commit -m "feat: add notifications page with feed, grouping, and routing"
```

---

## Task 8: Remove Old Notification Banners

**Files:**
- Delete: `frontend/src/app/shared/notification-banner/notification-banner.ts`
- Delete: `frontend/src/app/shared/notification-banner/notification-banner.html`
- Delete: `frontend/src/app/shared/notification-banner/notification-banner.css`
- Modify: `frontend/src/app/features/home/home.ts`
- Modify: `frontend/src/app/features/home/home.html`

- [ ] **Step 1: Remove banner references from home.ts**

In `frontend/src/app/features/home/home.ts`:
- Remove the import line: `import { NotificationBannerComponent } from '../../shared/notification-banner/notification-banner';`
- Remove `NotificationBannerComponent` from the `imports: [...]` array in the `@Component` decorator.

- [ ] **Step 2: Remove banner tags from home.html**

In `frontend/src/app/features/home/home.html`:
- Remove all `<app-notification-banner>` or `<app-notification-banner />` tags.

- [ ] **Step 3: Delete the banner component files**

```bash
rm frontend/src/app/shared/notification-banner/notification-banner.ts
rm frontend/src/app/shared/notification-banner/notification-banner.html
rm frontend/src/app/shared/notification-banner/notification-banner.css
rmdir frontend/src/app/shared/notification-banner/
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=production 2>&1 | head -20`

Expected: No errors. No references to NotificationBannerComponent remain.

- [ ] **Step 5: Verify no dangling imports**

Run a grep to confirm no file still references the deleted component:
```bash
grep -r "notification-banner" frontend/src/ --include="*.ts" --include="*.html"
```

Expected: No matches.

- [ ] **Step 6: Commit**

```bash
git add -u frontend/src/app/shared/notification-banner/ frontend/src/app/features/home/home.ts frontend/src/app/features/home/home.html
git commit -m "refactor: remove notification banners, replaced by notifications page"
```

---

## Task 9: Visual QA + Polish

**Files:** None new — testing and fixing existing work.

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/instashop/Projects/football-quizball/frontend && npx ng serve`

- [ ] **Step 2: Verify bell icon appears in top nav**

Navigate to `http://localhost:4200`. Log in. Verify:
- Bell icon visible next to settings gear
- Badge shows correct unread count (or hidden if 0)
- Tapping bell navigates to `/notifications`

- [ ] **Step 3: Verify notifications page**

Navigate to `/notifications`. Verify:
- Header shows "Notifications" + "Mark all read"
- Back button returns to home
- If no notifications: empty state "You're all caught up!" appears
- If notifications exist: they appear grouped by time with correct icons

- [ ] **Step 4: Verify mark as read**

- Tap an unread notification → it should navigate to the correct route
- Return to `/notifications` → that notification should now be read (muted, no dot)
- Tap "Mark all read" → all items become read, badge count goes to 0

- [ ] **Step 5: Verify home page**

Navigate to `/`. Verify:
- No notification banners appear (they've been removed)
- All other home page content renders normally
- No console errors

- [ ] **Step 6: Run full build**

Run: `cd /Users/instashop/Projects/football-quizball/frontend && npx ng build --configuration=production`

Expected: Clean build, no errors or warnings.

---

## Task 10: Backend Build Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx jest --no-coverage`

Expected: All tests pass including new notifications tests.

- [ ] **Step 2: Run TypeScript check**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npx tsc --noEmit --pretty`

Expected: No type errors.

- [ ] **Step 3: Start backend and test endpoints manually**

Run: `cd /Users/instashop/Projects/football-quizball/backend && npm run start:dev`

Test the endpoints:
```bash
# Get unread count (requires auth token)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/notifications/unread-count

# Get notifications
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/notifications

# Mark all as read
curl -X PATCH -H "Authorization: Bearer <token>" http://localhost:3000/api/notifications/read-all
```

Expected: All endpoints return valid JSON responses.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address QA findings from notifications implementation"
```
