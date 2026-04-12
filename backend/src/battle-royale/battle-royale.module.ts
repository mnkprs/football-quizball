import { Module } from '@nestjs/common';
import { BattleRoyaleController } from './battle-royale.controller';
import { BattleRoyaleService } from './battle-royale.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { BlitzModule } from '../blitz/blitz.module';
import { LogoQuizModule } from '../logo-quiz/logo-quiz.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { XpModule } from '../xp/xp.module';

@Module({
  imports: [AuthModule, SupabaseModule, BlitzModule, LogoQuizModule, AchievementsModule, XpModule],
  controllers: [BattleRoyaleController],
  providers: [BattleRoyaleService],
  exports: [BattleRoyaleService],
})
export class BattleRoyaleModule {}
