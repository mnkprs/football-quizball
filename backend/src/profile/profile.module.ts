import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [AuthModule, SupabaseModule],
  controllers: [ProfileController],
})
export class ProfileModule {}
