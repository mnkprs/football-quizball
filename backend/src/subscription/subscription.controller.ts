import { Controller, Post, Get, Req, Body, UseGuards, HttpCode, HttpException, HttpStatus, Headers, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../auth/auth.guard';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';
import { IapValidationService } from './iap-validation.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('api/subscription')
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

  constructor(
    private stripeService: StripeService,
    private subscriptionService: SubscriptionService,
    private iapValidationService: IapValidationService,
    private supabaseService: SupabaseService,
    private configService: ConfigService,
  ) {}

  // ─── IAP Endpoints ──────────────────────────────────────────────────

  @Get('status')
  @UseGuards(AuthGuard)
  async getStatus(@Req() req: any) {
    const status = await this.supabaseService.getProStatus(req.user.id);
    const dailyDuelsRemaining = await this.supabaseService.getDailyDuelsRemaining(req.user.id);

    return {
      is_pro: status?.is_pro ?? false,
      purchase_type: status?.purchase_type ?? null,
      daily_duels_remaining: dailyDuelsRemaining,
      trial_battle_royale_remaining: Math.max(0, 1 - (status?.trial_battle_royale_used ?? 0)),
    };
  }

  @Post('validate-receipt')
  @UseGuards(AuthGuard)
  async validateReceipt(
    @Req() req: any,
    @Body() body: { platform: 'ios' | 'android'; receipt: string; productId: string },
  ) {
    const { platform, receipt, productId } = body;

    if (!platform || !receipt || !productId) {
      throw new HttpException('Missing required fields: platform, receipt, productId', HttpStatus.BAD_REQUEST);
    }

    if (platform !== 'ios' && platform !== 'android') {
      throw new HttpException('Platform must be ios or android', HttpStatus.BAD_REQUEST);
    }

    let result;
    if (platform === 'ios') {
      result = await this.iapValidationService.validateAppleReceipt(receipt, productId);
    } else {
      result = await this.iapValidationService.validateGoogleReceipt(receipt, productId);
    }

    if (!result.valid) {
      throw new HttpException('Receipt validation failed', HttpStatus.BAD_REQUEST);
    }

    // Set pro status in DB
    const isLifetime = result.purchaseType === 'lifetime';
    await this.supabaseService.setProStatus(req.user.id, {
      isPro: true,
      proSource: result.purchaseType,
      proLifetimeOwned: isLifetime ? true : undefined,
      proExpiresAt: result.expiresAt ?? null,
      iapPlatform: platform,
      iapOriginalTransactionId: result.originalTransactionId ?? result.transactionId,
    });

    this.logger.log(`User ${req.user.id} validated ${platform} receipt: ${result.purchaseType} (${result.productId})`);

    return {
      success: true,
      purchaseType: result.purchaseType,
    };
  }

  @Post('apple-notification')
  @HttpCode(200)
  async handleAppleNotification(@Req() req: any) {
    try {
      await this.subscriptionService.handleAppleNotification(req.body);
      return { received: true };
    } catch (err: any) {
      this.logger.error(`Apple notification handling failed: ${err.message}`);
      // Return 200 anyway to prevent Apple from retrying endlessly
      return { received: true, error: err.message };
    }
  }

  @Post('google-notification')
  @HttpCode(200)
  async handleGoogleNotification(@Req() req: any) {
    try {
      await this.subscriptionService.handleGoogleNotification(req.body);
      return { received: true };
    } catch (err: any) {
      this.logger.error(`Google notification handling failed: ${err.message}`);
      // Return 200 to acknowledge receipt
      return { received: true, error: err.message };
    }
  }

  // ─── STRIPE: feature-flagged — re-enable if IAP rejected ───────────
  //
  // @Post('checkout')
  // @UseGuards(AuthGuard)
  // async createCheckout(@Req() req: any) {
  //   const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
  //   try {
  //     const url = await this.stripeService.createCheckoutSession(
  //       req.user.id,
  //       req.user.email,
  //       `${frontendUrl}/?pro=success`,
  //       `${frontendUrl}/?pro=cancel`,
  //     );
  //     return { url };
  //   } catch (err: any) {
  //     console.error('Stripe checkout error:', err.message, err.raw ?? '');
  //     throw new HttpException(err.message ?? 'Stripe checkout failed', err.statusCode ?? 500);
  //   }
  // }
  //
  // @Post('portal')
  // @UseGuards(AuthGuard)
  // async createPortal(@Req() req: any) {
  //   const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
  //   const status = await this.supabaseService.getProStatus(req.user.id);
  //   if (!status?.stripe_customer_id) {
  //     throw new HttpException('No active subscription found', 404);
  //   }
  //   const url = await this.stripeService.createPortalSession(status.stripe_customer_id, frontendUrl);
  //   return { url };
  // }
  //
  // @Post('webhook')
  // @HttpCode(200)
  // async handleWebhook(@Req() req: any, @Headers('stripe-signature') sig: string) {
  //   if (!sig) throw new HttpException('Missing stripe-signature header', 400);
  //
  //   let event;
  //   try {
  //     event = this.stripeService.constructWebhookEvent(req.rawBody, sig);
  //   } catch (err: any) {
  //     throw new HttpException(`Webhook signature verification failed: ${err.message}`, 400);
  //   }
  //
  //   await this.subscriptionService.handleWebhookEvent(event);
  //   return { received: true };
  // }
  //
  // ─── END STRIPE feature-flagged ────────────────────────────────────
}
