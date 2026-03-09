import { Module } from '@nestjs/common';
import { TodayGenerator } from './today.generator';
import { DailyService } from './daily.service';
import { DailyController } from './daily.controller';
import { LlmModule } from '../llm/llm.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [LlmModule, SupabaseModule],
  providers: [TodayGenerator, DailyService],
  controllers: [DailyController],
  exports: [DailyService],
})
export class DailyModule {}
