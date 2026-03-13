import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import Stripe from 'stripe';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(private supabaseService: SupabaseService) {}

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.['userId'];
        if (!userId) {
          this.logger.warn(`Webhook ${event.type} missing userId metadata, skipping`);
          return;
        }
        const isActive = sub.status === 'active' || sub.status === 'trialing';
        await this.supabaseService.setProStatus(userId, isActive, sub.customer as string, sub.id);
        this.logger.log(`User ${userId} pro status set to ${isActive} via ${event.type}`);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.['userId'];
        if (!userId) {
          this.logger.warn('Webhook subscription.deleted missing userId metadata, skipping');
          return;
        }
        await this.supabaseService.setProStatus(userId, false);
        this.logger.log(`User ${userId} pro status revoked via subscription.deleted`);
        break;
      }
      default:
        // Unhandled events — no-op
        break;
    }
  }
}
