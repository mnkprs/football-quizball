import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { XpService } from './xp.service';

@Module({
  imports: [SupabaseModule],
  providers: [XpService],
  exports: [XpService],
})
export class XpModule {}
