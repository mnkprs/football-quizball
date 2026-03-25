import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { IapValidationService } from './iap-validation.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [AuthModule, SupabaseModule],
  controllers: [SubscriptionController],
  providers: [
    IapValidationService,
    SubscriptionService,
    StripeService, // STRIPE: feature-flagged — kept as provider, routes commented out in controller
  ],
})
export class SubscriptionModule {}
