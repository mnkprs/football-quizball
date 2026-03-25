import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { StripeService } from '../subscription/stripe.service';

@Module({
  imports: [AuthModule, SupabaseModule],
  controllers: [ProfileController],
  providers: [StripeService],
})
export class ProfileModule {}
