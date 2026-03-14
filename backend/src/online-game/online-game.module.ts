import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OnlineGameController } from './online-game.controller';
import { OnlineGameService } from './online-game.service';
import { AuthModule } from '../auth/auth.module';
import { QuestionsModule } from '../questions/questions.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [AuthModule, QuestionsModule, SupabaseModule, ScheduleModule.forRoot()],
  controllers: [OnlineGameController],
  providers: [OnlineGameService],
})
export class OnlineGameModule {}
