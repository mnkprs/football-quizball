import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { ProGuard } from './pro.guard';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [AuthService, AuthGuard, ProGuard],
  exports: [AuthService, AuthGuard, ProGuard],
})
export class AuthModule {}
