import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DuelController } from './duel.controller';
import { DuelService } from './duel.service';
import { DuelTimeoutService } from './duel-timeout.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { QuestionsModule } from '../questions/questions.module';
import { LogoQuizModule } from '../logo-quiz/logo-quiz.module';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [AuthModule, SupabaseModule, QuestionsModule, ScheduleModule, LogoQuizModule, AchievementsModule],
  controllers: [DuelController],
  providers: [DuelService, DuelTimeoutService],
  exports: [DuelService],
})
export class DuelModule {}
