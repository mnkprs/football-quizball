import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [AuthModule, SupabaseModule],
  controllers: [SubscriptionController],
  providers: [StripeService, SubscriptionService],
})
export class SubscriptionModule {}
