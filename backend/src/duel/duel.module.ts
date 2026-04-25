import { Module } from '@nestjs/common';
import { DuelController } from './duel.controller';
import { DuelService } from './duel.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { QuestionsModule } from '../questions/questions.module';
import { LogoQuizModule } from '../logo-quiz/logo-quiz.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { XpModule } from '../xp/xp.module';

@Module({
  imports: [AuthModule, SupabaseModule, QuestionsModule, LogoQuizModule, AchievementsModule, NotificationsModule, XpModule],
  controllers: [DuelController],
  providers: [DuelService],
  exports: [DuelService],
})
export class DuelModule {}
