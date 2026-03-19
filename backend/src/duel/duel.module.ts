import { Module } from '@nestjs/common';
import { DuelController } from './duel.controller';
import { DuelService } from './duel.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { QuestionsModule } from '../questions/questions.module';

@Module({
  imports: [AuthModule, SupabaseModule, QuestionsModule],
  controllers: [DuelController],
  providers: [DuelService],
  exports: [DuelService],
})
export class DuelModule {}
