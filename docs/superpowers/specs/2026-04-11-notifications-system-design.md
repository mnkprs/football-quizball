# Notifications System Design

**Date:** 2026-04-11
**Status:** Draft
**Author:** Claude + User

## Overview

Add a notifications system to Stepover. A bell icon in the top nav navigates to a `/notifications` inbox page. Replaces the existing notification banners on the home page. Notifications cover content availability (new questions), player challenges, system challenges, leaderboard displacement, duel results, and achievements.

## Approach

**Hybrid (Approach A):** Single `notifications` Supabase table for persistent/personalized events. Frontend-derived entries for content availability (new news/daily questions) by reusing existing metadata endpoints. Both merged into one feed at display time.

## Notification Types

| Type | Source | Title Example | Body Example | Route | Icon |
|------|--------|---------------|--------------|-------|------|
| `new_news_round` | Frontend (metadata) | New News questions! | 10 fresh questions — play now | `/news` | 📰 |
| `new_daily_round` | Frontend (metadata) | New TiF questions! | New True-is-False questions available | `/daily` | 📅 |
| `challenge_received` | Backend (DB) | ManosKap challenged you! | Logo Duel — tap to accept | `/duel?mode=logo` | ⚔️ |
| `challenge_system` | Backend (DB) | Daily Challenge | Win 3 Solo games for +50 bonus ELO | `/solo` | 🎮 |
| `leaderboard_displaced` | Backend (DB) | You lost #1 on Solo! | xUser overtook you with 1520 ELO | `/leaderboard` | 🏆 |
| `duel_result` | Backend (DB) | You beat Alex 4-2! | Standard Duel — +28 ELO | `/duel` | 🎯 |
| `achievement_unlocked` | Backend (DB) | Achievement unlocked! | Hat Trick Hero — Win 3 duels in a row | `/profile` | 🏅 |

### Frontend-Derived Notifications

`new_news_round` and `new_daily_round` are NOT stored in the database. They are constructed on the frontend by calling existing metadata endpoints (`NewsApiService.getMetadata()`, `DailyApiService.getMetadata()`) and merged into the feed at display time. Read/unread state for these is tracked via localStorage, keyed by the round's batch identifier (same keys the current banners use: `expires_at` for news, `resetsAt` for daily).

## Database

### `notifications` table

```sql
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

-- Index for fetching user's notifications
CREATE INDEX idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- Index for unread count
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

-- Backend inserts via service role (bypasses RLS)
```

### Retention

Auto-delete notifications older than 30 days via pg_cron:

```sql
SELECT cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * *',
  $$DELETE FROM notifications WHERE created_at < now() - interval '30 days'$$
);
```

## Backend

### NotificationsModule (new)

**Files:**
- `backend/src/notifications/notifications.module.ts`
- `backend/src/notifications/notifications.service.ts`
- `backend/src/notifications/notifications.controller.ts`
- `backend/src/notifications/dto/create-notification.dto.ts`

### API Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/api/notifications` | Required | Fetch user's notifications, paginated (default 50, newest first) |
| `PATCH` | `/api/notifications/:id/read` | Required | Mark single notification as read |
| `PATCH` | `/api/notifications/read-all` | Required | Mark all notifications as read |
| `GET` | `/api/notifications/unread-count` | Required | Return `{ count: number }` for badge |

### NotificationsService

```typescript
interface CreateNotificationDto {
  userId: string;
  type: string;
  title: string;
  body: string;
  icon?: string;
  route?: string;
  metadata?: Record<string, unknown>;
}
```

Methods:
- `create(dto: CreateNotificationDto): Promise<void>` — insert row via service role
- `getForUser(userId: string, limit?: number, offset?: number): Promise<Notification[]>` — paginated fetch
- `markAsRead(userId: string, notificationId: string): Promise<void>` — set `read = true`
- `markAllAsRead(userId: string): Promise<void>` — bulk update
- `getUnreadCount(userId: string): Promise<number>` — count query

### Notification Generation Triggers

| Event | Where | Logic |
|-------|-------|-------|
| **Leaderboard displaced** | `EloService` (after ELO update) | Query top 10 before update. After update, check if a user was overtaken. If so, create `leaderboard_displaced` notification for the displaced user. |
| **Duel result** | `DuelGateway` (after game ends) | Create `duel_result` notification for both players with score and ELO change. |
| **Achievement unlocked** | `AchievementsService` (after granting) | Create `achievement_unlocked` notification with achievement name and description. |
| **Player challenge** | New endpoint: `POST /api/notifications/challenge` | Validate challenger and target exist. Create `challenge_received` notification for target user. This only creates a notification — it does NOT pre-create a duel game. The challenged user taps the notification, navigates to the duel lobby, and joins the queue normally. |
| **System challenge** | Cron job (daily at 00:00 UTC) | Create `challenge_system` notification for all users who were active in the last 7 days. Rotate through a pool of challenge templates. |

### Module Dependencies

```
NotificationsModule imports: [AuthModule, SupabaseModule]
```

Other modules that generate notifications import `NotificationsModule` and inject `NotificationsService`:
- `SoloModule` (leaderboard displacement)
- `DuelModule` (duel results, player challenges)
- `AchievementsModule` (achievement unlocked — if/when achievements trigger server-side)

## Frontend

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/app/features/notifications/notifications.ts` | Standalone page component |
| `frontend/src/app/features/notifications/notifications.html` | Feed template |
| `frontend/src/app/features/notifications/notifications.css` | Styles |
| `frontend/src/app/core/notifications-api.service.ts` | HTTP service + unread count signal |
| `frontend/src/app/models/notification.model.ts` | TypeScript interfaces |

### notification.model.ts

```typescript
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  icon: string;
  route: string;
  read: boolean;
  createdAt: string; // ISO timestamp
  source: 'backend' | 'frontend'; // distinguishes DB vs metadata-derived
}
```

### NotificationsApiService

Singleton service (`providedIn: 'root'`).

**Signals:**
- `unreadCount: Signal<number>` — exposed for top-nav badge

**Methods:**
- `fetchNotifications(): Promise<AppNotification[]>` — calls `GET /api/notifications`, then calls `NewsApiService.getMetadata()` and `DailyApiService.getMetadata()` to build frontend-derived entries, merges all by `createdAt` descending
- `markAsRead(id: string): Promise<void>` — for backend notifications: `PATCH /api/notifications/:id/read`; for frontend-derived: update localStorage
- `markAllAsRead(): Promise<void>` — `PATCH /api/notifications/read-all` + clear localStorage flags
- `refreshUnreadCount(): Promise<void>` — calls `GET /api/notifications/unread-count` + counts frontend-derived unread items, updates `unreadCount` signal

**Poll-on-open behavior:**
- `refreshUnreadCount()` called on app init (in `AppComponent` or top-nav `ngOnInit`)
- `fetchNotifications()` called when user navigates to `/notifications`

### Top Nav Changes

In `top-nav.ts` / `top-nav.html`:

- Inject `NotificationsApiService`
- Add bell button before settings button (logged-in users only):
  ```html
  <button class="top-nav__bell-btn pressable"
          aria-label="Notifications"
          [routerLink]="'/notifications'">
    <span class="material-icons">notifications</span>
    @if (notificationsApi.unreadCount() > 0) {
      <span class="top-nav__bell-badge">
        {{ notificationsApi.unreadCount() > 9 ? '9+' : notificationsApi.unreadCount() }}
      </span>
    }
  </button>
  ```
- Style `top-nav__bell-btn` identical to `top-nav__settings-btn`
- Style `top-nav__bell-badge`: red circle, positioned absolute top-right, white text, 18px diameter

### Notifications Page

**Structure:**
- Back button + "Notifications" title + "Mark all read" link
- Feed grouped by time: Today / Yesterday / Earlier this week / Older
- Each card: icon (40px rounded square) | title + body + timestamp | blue unread dot
- Tap card → `markAsRead(id)` then `router.navigate([notification.route])`
- Pull-to-refresh triggers `fetchNotifications()`
- Empty state: "You're all caught up!" with football icon

**Grouping logic:** Utility function that buckets notifications by `createdAt` into time groups relative to the current date.

### Routing

Add to `app.routes.ts`:
```typescript
{
  path: 'notifications',
  loadComponent: () => import('./features/notifications/notifications').then(m => m.NotificationsComponent),
  canActivate: [authGuard]
}
```

## Removals

| What | Where |
|------|-------|
| `notification-banner/` component | `frontend/src/app/shared/notification-banner/` — delete entirely |
| Banner rendering | `home.html` — remove `<app-notification-banner>` tags |
| Banner imports | `home.ts` — remove `NotificationBannerComponent` import |
| localStorage keys (optional) | `qb_notif_news_dismissed`, `qb_notif_daily_dismissed` — can be left to expire naturally or cleaned up |

## What Stays Unchanged

- `NewsApiService` / `DailyApiService` — still used, consumed by `NotificationsApiService`
- Bottom nav — untouched
- Settings panel — untouched
- All existing game routes and modes
- Existing database tables

## Testing

- **Unit tests:** NotificationsService (create, fetch, mark read, unread count)
- **Unit tests:** NotificationsApiService (merge logic, unread count computation)
- **Integration tests:** API endpoints (auth required, RLS enforcement, pagination)
- **E2E:** Bell icon shows badge → tap → notifications page → tap notification → navigates to route

## Out of Scope

- Push notifications (native mobile) — future enhancement
- Real-time updates (Supabase Realtime) — poll-on-open is sufficient for now
- Notification preferences/settings (mute types) — future enhancement
- Rich media in notifications (images, action buttons) — future enhancement
