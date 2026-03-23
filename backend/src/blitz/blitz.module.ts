import { Module } from '@nestjs/common';
import { BlitzController } from './blitz.controller';
import { BlitzService } from './blitz.service';
import { AuthModule } from '../auth/auth.module';
import { SessionStoreModule } from '../session/session-store.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [AuthModule, SessionStoreModule, SupabaseModule],
  controllers: [BlitzController],
  providers: [BlitzService],
  exports: [BlitzService],
})
export class BlitzModule {}
