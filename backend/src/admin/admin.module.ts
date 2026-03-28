import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminScriptsService } from './admin-scripts.service';
import { QuestionsModule } from '../questions/questions.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [QuestionsModule, SupabaseModule, BotModule],
  controllers: [AdminController],
  providers: [AdminScriptsService],
})
export class AdminModule {}
