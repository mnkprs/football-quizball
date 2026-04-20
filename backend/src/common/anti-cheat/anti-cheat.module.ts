import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../supabase/supabase.module';
import { AnomalyFlagService } from './anomaly-flag.service';

@Module({
  imports: [SupabaseModule],
  providers: [AnomalyFlagService],
  exports: [AnomalyFlagService],
})
export class AntiCheatModule {}
