import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MayhemQuestionGenerator } from './mayhem-question.generator';
import { MayhemStatGuessGenerator } from './mayhem-stat-guess.generator';
import { MayhemService } from './mayhem.service';
import { MayhemSessionService } from './mayhem-session.service';
import { MayhemController } from './mayhem.controller';
import { LlmModule } from '../llm/llm.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { QuestionsModule } from '../questions/questions.module';
import { AuthModule } from '../auth/auth.module';
import { SessionStoreModule } from '../session/session-store.module';
import { EloService } from '../solo/elo.service';

@Module({
  imports: [ConfigModule, LlmModule, SupabaseModule, QuestionsModule, AuthModule, SessionStoreModule],
  providers: [MayhemQuestionGenerator, MayhemStatGuessGenerator, MayhemService, MayhemSessionService, EloService],
  controllers: [MayhemController],
  exports: [MayhemService, MayhemSessionService],
})
export class MayhemModule {}
