import { Module } from '@nestjs/common';
import { BlitzController } from './blitz.controller';
import { BlitzService } from './blitz.service';
import { BlitzPoolSeederService } from './blitz-pool-seeder.service';
import { AuthModule } from '../auth/auth.module';
import { SessionStoreModule } from '../session/session-store.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { QuestionsModule } from '../questions/questions.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [AuthModule, SessionStoreModule, SupabaseModule, QuestionsModule, LlmModule],
  controllers: [BlitzController],
  providers: [BlitzService, BlitzPoolSeederService],
  exports: [BlitzPoolSeederService],
})
export class BlitzModule {}
