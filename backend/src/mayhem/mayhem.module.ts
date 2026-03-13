import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MayhemQuestionGenerator } from './mayhem-question.generator';
import { MayhemService } from './mayhem.service';
import { MayhemController } from './mayhem.controller';
import { LlmModule } from '../llm/llm.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { QuestionsModule } from '../questions/questions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, LlmModule, SupabaseModule, QuestionsModule, AuthModule],
  providers: [MayhemQuestionGenerator, MayhemService],
  controllers: [MayhemController],
  exports: [MayhemService],
})
export class MayhemModule {}
