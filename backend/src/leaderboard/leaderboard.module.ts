import { Module } from '@nestjs/common';
import { LeaderboardController } from './leaderboard.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [LeaderboardController],
})
export class LeaderboardModule {}
