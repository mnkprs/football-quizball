import { Injectable, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe | null = null;
  private readonly webhookSecret: string;
  private readonly priceId: string;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
    this.priceId = this.configService.get<string>('STRIPE_PRICE_ID') ?? '';
    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    }
  }

  get isConfigured(): boolean {
    return !!this.stripe;
  }

  private requireStripe(): Stripe {
    if (!this.stripe) throw new HttpException('Stripe is not configured', 503);
    return this.stripe;
  }

  async createCheckoutSession(
    userId: string,
    email: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<string> {
    const session = await this.requireStripe().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: this.priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
      subscription_data: { metadata: { userId } },
    });
    return session.url!;
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<string> {
    const session = await this.requireStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }

  constructWebhookEvent(rawBody: Buffer, sig: string): Stripe.Event {
    return this.requireStripe().webhooks.constructEvent(rawBody, sig, this.webhookSecret);
  }

  async listActiveSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    const result = await this.requireStripe().subscriptions.list({
      customer: customerId,
      status: 'active',
    });
    return result.data;
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.requireStripe().subscriptions.cancel(subscriptionId);
  }
}
