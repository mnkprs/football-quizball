import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminScriptsService } from './admin-scripts.service';
import { QuestionsModule } from '../questions/questions.module';
import { BlitzModule } from '../blitz/blitz.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [QuestionsModule, BlitzModule, SupabaseModule],
  controllers: [AdminController],
  providers: [AdminScriptsService],
})
export class AdminModule {}
