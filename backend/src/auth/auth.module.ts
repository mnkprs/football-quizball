import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { ProGuard } from './pro.guard';
import { DuelProGuard } from './duel-pro.guard';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [AuthService, AuthGuard, ProGuard, DuelProGuard],
  exports: [AuthService, AuthGuard, ProGuard, DuelProGuard],
})
export class AuthModule {}
