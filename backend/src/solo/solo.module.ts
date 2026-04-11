import { Module } from '@nestjs/common';
import { SoloController } from './solo.controller';
import { SoloService } from './solo.service';
import { EloService } from './elo.service';
import { SoloQuestionGenerator } from './solo-question.generator';
import { AuthModule } from '../auth/auth.module';
import { SessionStoreModule } from '../session/session-store.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { QuestionsModule } from '../questions/questions.module';
import { LlmModule } from '../llm/llm.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, SessionStoreModule, SupabaseModule, QuestionsModule, LlmModule, AchievementsModule, NotificationsModule],
  controllers: [SoloController],
  providers: [SoloService, EloService, SoloQuestionGenerator],
})
export class SoloModule {}
