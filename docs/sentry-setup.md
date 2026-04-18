# Sentry Setup — Step-by-Step

Scaffolding is prepared as documentation rather than pre-installed deps so it doesn't risk breaking the current build. Follow these steps when you're ready to wire Sentry (≈15 min).

> **Why deferred:** Adding `@sentry/nestjs` and `@sentry/angular` imports into code that isn't installed yet would break the build. This doc lets you enable Sentry atomically in one session.

---

## 1. Create a Sentry account

- Go to https://sentry.io/signup/
- Create an org (free tier allows 5K errors/month — enough for early launch)
- Create **two projects**:
  - `stepovr-backend` — platform: Node.js / NestJS
  - `stepovr-frontend` — platform: Angular
- Copy both DSNs.

## 2. Install dependencies

```bash
cd backend && npm install --save @sentry/nestjs @sentry/profiling-node
cd ../frontend && npm install --save @sentry/angular
```

## 3. Backend wiring

### Create `backend/src/sentry.ts`

```ts
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.RELEASE_VERSION,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [nodeProfilingIntegration()],
  });
}
```

### Wire into `backend/src/main.ts`

Add the import at the **top of the file** (must be before NestJS imports so Sentry instruments them):

```ts
import './sentry'; // must be first
import { initSentry } from './sentry';
initSentry();
// ... existing imports
```

Register the filter in `app.module.ts`:

```ts
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { APP_FILTER } from '@nestjs/core';

@Module({
  providers: [
    { provide: APP_FILTER, useClass: SentryGlobalFilter }, // ADD THIS FIRST
    { provide: APP_FILTER, useClass: AllExceptionsFilter }, // existing
  ],
})
```

## 4. Frontend wiring

### Create `frontend/src/sentry.ts`

```ts
import * as Sentry from '@sentry/angular';
import { environment } from './environments/environment';

export function initSentry(): void {
  if (!environment.sentryDsn) return;

  Sentry.init({
    dsn: environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',
    release: environment.appVersion,
    tracesSampleRate: environment.production ? 0.1 : 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
  });
}
```

### Add `sentryDsn` to environments

`frontend/src/environments/environment.ts` + `environment.prod.ts`:

```ts
export const environment = {
  // ...existing fields
  sentryDsn: '', // paste frontend DSN into environment.prod.ts only
};
```

### Wire into `frontend/src/main.ts`

```ts
import { initSentry } from './sentry';
initSentry();
// ... rest of bootstrap
```

### Register error handler in `app.config.ts`

```ts
import * as Sentry from '@sentry/angular';
import { ErrorHandler } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    // ...existing
    { provide: ErrorHandler, useValue: Sentry.createErrorHandler() },
  ],
};
```

## 5. Env vars

### Railway backend

- `SENTRY_DSN=https://xxxxx@o000000.ingest.us.sentry.io/0000000`
- `RELEASE_VERSION=0.7.3.1` (optional but recommended)

### Vercel frontend

- The frontend DSN is **public** (safe to ship in the bundle) but put it in `environment.prod.ts` rather than as an env var so it's compiled in.

## 6. Verify

After deploy, trigger a test error:

```bash
curl https://football-quizball-production.up.railway.app/api/sentry-test
```

Add this temporary endpoint to confirm:

```ts
@Get('/api/sentry-test')
testSentry(): never {
  throw new Error('Sentry backend test');
}
```

Delete it after you see the event land in Sentry.

## Cost check

- Free tier: 5K errors/month, 10K transactions/month
- At 400 concurrent users, realistic errors ≈ 500–2000/mo — well within free
- If you cross the limit, the cheapest paid plan is $26/mo (50K errors)
