import { Module } from '@nestjs/common';
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
  ],
})
export class SubscriptionModule {}
