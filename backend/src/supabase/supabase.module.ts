import { Module, Global } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { ProfileRepository } from './profile.repository';
import { EloRepository } from './elo.repository';
import { LeaderboardRepository } from './leaderboard.repository';

@Global()
@Module({
  providers: [SupabaseService, ProfileRepository, EloRepository, LeaderboardRepository],
  exports: [SupabaseService, ProfileRepository, EloRepository, LeaderboardRepository],
})
export class SupabaseModule {}
