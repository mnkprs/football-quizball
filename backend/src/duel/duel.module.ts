import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DuelController } from './duel.controller';
import { DuelService } from './duel.service';
import { DuelTimeoutService } from './duel-timeout.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { QuestionsModule } from '../questions/questions.module';

@Module({
  imports: [AuthModule, SupabaseModule, QuestionsModule, ScheduleModule],
  controllers: [DuelController],
  providers: [DuelService, DuelTimeoutService],
  exports: [DuelService],
})
export class DuelModule {}
