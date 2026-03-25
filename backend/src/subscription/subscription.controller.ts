import { Controller, Post, Get, Req, UseGuards, HttpCode, HttpException, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../auth/auth.guard';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('api/subscription')
export class SubscriptionController {
  constructor(
    private stripeService: StripeService,
    private subscriptionService: SubscriptionService,
    private supabaseService: SupabaseService,
    private configService: ConfigService,
  ) {}

  @Get('status')
  @UseGuards(AuthGuard)
  async getStatus(@Req() req: any) {
    const status = await this.supabaseService.getProStatus(req.user.id);
    return {
      is_pro: status?.is_pro ?? false,
      trial_games_used: status?.trial_games_used ?? 0,
      trial_battle_royale_used: status?.trial_battle_royale_used ?? 0,
      trial_duel_used: status?.trial_duel_used ?? 0,
    };
  }

  @Post('checkout')
  @UseGuards(AuthGuard)
  async createCheckout(@Req() req: any) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
    try {
      const url = await this.stripeService.createCheckoutSession(
        req.user.id,
        req.user.email,
        `${frontendUrl}/?pro=success`,
        `${frontendUrl}/?pro=cancel`,
      );
      return { url };
    } catch (err: any) {
      console.error('Stripe checkout error:', err.message, err.raw ?? '');
      throw new HttpException(err.message ?? 'Stripe checkout failed', err.statusCode ?? 500);
    }
  }

  @Post('portal')
  @UseGuards(AuthGuard)
  async createPortal(@Req() req: any) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
    const status = await this.supabaseService.getProStatus(req.user.id);
    if (!status?.stripe_customer_id) {
      throw new HttpException('No active subscription found', 404);
    }
    const url = await this.stripeService.createPortalSession(status.stripe_customer_id, frontendUrl);
    return { url };
  }

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Req() req: any, @Headers('stripe-signature') sig: string) {
    if (!sig) throw new HttpException('Missing stripe-signature header', 400);

    let event;
    try {
      event = this.stripeService.constructWebhookEvent(req.rawBody, sig);
    } catch (err: any) {
      throw new HttpException(`Webhook signature verification failed: ${err.message}`, 400);
    }

    await this.subscriptionService.handleWebhookEvent(event);
    return { received: true };
  }
}
