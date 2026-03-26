import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
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
import { DuelModule } from './duel/duel.module';
import { BattleRoyaleModule } from './battle-royale/battle-royale.module';
import { MatchHistoryModule } from './match-history/match-history.module';
import { ProfileModule } from './profile/profile.module';
import { BotModule } from './bot/bot.module';
import { LogoQuizModule } from './logo-quiz/logo-quiz.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redisService: RedisService) => ({
        throttlers: [{ ttl: 60000, limit: 60 }],
        storage: new ThrottlerStorageRedisService(redisService.client),
      }),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
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
    DuelModule,
    BattleRoyaleModule,
    MatchHistoryModule,
    ProfileModule,
    BotModule,
    LogoQuizModule,
  ],
})
export class AppModule {}
