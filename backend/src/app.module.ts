import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from '@nestjs/config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { UserThrottlerGuard } from './common/throttler/user-throttler.guard';
import { FailOpenThrottlerStorage } from './common/throttler/fail-open-throttler-storage';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { CacheModule } from './cache/cache.module';
import { LlmModule } from './llm/llm.module';
import { FootballApiModule } from './football-api/football-api.module';
import { QuestionsModule } from './questions/questions.module';
import { GameModule } from './game/game.module';
import { AdminModule } from './admin/admin.module';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { SoloModule } from './solo/solo.module';
import { BlitzModule } from './blitz/blitz.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { NewsModule } from './news/news.module';
import { DailyModule } from './daily/daily.module';
import { ReportsModule } from './reports/reports.module';
import { MayhemModule } from './mayhem/mayhem.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { OnlineGameModule } from './online-game/online-game.module';
import { AchievementsModule } from './achievements/achievements.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DuelModule } from './duel/duel.module';
import { BattleRoyaleModule } from './battle-royale/battle-royale.module';
import { MatchHistoryModule } from './match-history/match-history.module';
import { ProfileModule } from './profile/profile.module';
import { BotModule } from './bot/bot.module';
import { LogoQuizModule } from './logo-quiz/logo-quiz.module';
import { XpModule } from './xp/xp.module';
import { AppConfigModule } from './config/config.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PushModule } from './push/push.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redisService: RedisService) => {
        // Single throttler — every named throttler fires on every request and
        // doubles Redis writes, so we keep just the baseline. Stricter caps for
        // /answer and /next can be re-added as named throttlers + @Throttle
        // decorators if/when bot grinding becomes a real problem; until a route
        // actually opts in, extra throttlers are pure write amplification.
        const throttlers = [
          { name: 'default', ttl: 60_000, limit: 120 },
        ];
        // Only use Redis-backed storage in production. Dev runs a single
        // backend instance, so the in-memory default is correct (and avoids
        // hammering Upstash with INCR + PEXPIRE per request — the dominant
        // command source on the free tier).
        // Regression: 2026-04-23 23:29Z Upstash quota exhaustion took down
        // every API route until midnight UTC. See FailOpenThrottlerStorage.
        if (process.env['NODE_ENV'] !== 'production') {
          return { throttlers };
        }
        return {
          throttlers,
          storage: new FailOpenThrottlerStorage(
            new ThrottlerStorageRedisService(redisService.client),
          ),
        };
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? (process.env['NODE_ENV'] === 'production' ? 'error' : 'debug'),
        transport: process.env['NODE_ENV'] !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
        autoLogging: { ignore: (req: any) => req.url === '/api/health' },
        redact: ['req.headers.authorization'],
      },
    }),
    SupabaseModule,
    CacheModule,
    LlmModule,
    FootballApiModule,
    QuestionsModule,
    GameModule,
    AdminModule,
    AuthModule,
    SoloModule,
    BlitzModule,
    LeaderboardModule,
    NewsModule,
    DailyModule,
    ReportsModule,
    MayhemModule,
    SubscriptionModule,
    OnlineGameModule,
    AchievementsModule,
    NotificationsModule,
    DuelModule,
    BattleRoyaleModule,
    MatchHistoryModule,
    ProfileModule,
    BotModule,
    LogoQuizModule,
    XpModule,
    AppConfigModule,
    AnalyticsModule,
    OnboardingModule,
    PushModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Registers ThrottlerGuard globally, keyed by authenticated user id.
    // Routes inherit the `default` throttler (120/min); answer/fetch routes
    // opt into stricter named throttlers via @Throttle({ answer: {...} }).
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}
