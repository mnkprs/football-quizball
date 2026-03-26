import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { LogoQuizController } from './logo-quiz.controller';
import { LogoQuizService } from './logo-quiz.service';
import { EloService } from '../solo/elo.service';

@Module({
  imports: [AuthModule, SupabaseModule],
  controllers: [LogoQuizController],
  providers: [LogoQuizService, EloService],
  exports: [LogoQuizService],
})
export class LogoQuizModule {}
