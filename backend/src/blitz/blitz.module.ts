import { Module } from '@nestjs/common';
import { BlitzController } from './blitz.controller';
import { BlitzService } from './blitz.service';
import { BlitzPoolSeederService } from './blitz-pool-seeder.service';
import { AuthModule } from '../auth/auth.module';
import { CacheModule } from '../cache/cache.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { QuestionsModule } from '../questions/questions.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [AuthModule, CacheModule, SupabaseModule, QuestionsModule, LlmModule],
  controllers: [BlitzController],
  providers: [BlitzService, BlitzPoolSeederService],
  exports: [BlitzPoolSeederService],
})
export class BlitzModule {}
