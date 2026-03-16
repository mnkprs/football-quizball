import { Module } from '@nestjs/common';
import { SoloController } from './solo.controller';
import { SoloService } from './solo.service';
import { EloService } from './elo.service';
import { SoloQuestionGenerator } from './solo-question.generator';
import { AuthModule } from '../auth/auth.module';
import { CacheModule } from '../cache/cache.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { QuestionsModule } from '../questions/questions.module';
import { LlmModule } from '../llm/llm.module';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [AuthModule, CacheModule, SupabaseModule, QuestionsModule, LlmModule, AchievementsModule],
  controllers: [SoloController],
  providers: [SoloService, EloService, SoloQuestionGenerator],
})
export class SoloModule {}
