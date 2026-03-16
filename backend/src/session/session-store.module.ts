import { Module } from '@nestjs/common';
import { SessionStoreService } from './session-store.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [SessionStoreService],
  exports: [SessionStoreService],
})
export class SessionStoreModule {}
