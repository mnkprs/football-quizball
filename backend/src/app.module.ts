import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from './cache/cache.module';
import { LlmModule } from './llm/llm.module';
import { FootballApiModule } from './football-api/football-api.module';
import { QuestionsModule } from './questions/questions.module';
import { GameModule } from './game/game.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule,
    LlmModule,
    FootballApiModule,
    QuestionsModule,
    GameModule,
  ],
})
export class AppModule {}
