import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { MatchHistoryModule } from './match-history/match-history.module';
import { ProfileModule } from './profile/profile.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
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
    MatchHistoryModule,
    ProfileModule,
  ],
})
export class AppModule {}
