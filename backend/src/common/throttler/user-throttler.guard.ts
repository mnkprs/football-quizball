import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit tracker that keys off the authenticated user id (populated by
 * AuthGuard into `req.user.id`) instead of the default IP address.
 *
 * Why per-user, not per-IP:
 *   • Carrier NAT means thousands of mobile users share an IP. IP throttling
 *     either blocks legit users (low limit) or does nothing to a single
 *     cheater (high limit).
 *   • A cheater on a jailbroken device can rotate IPs easily (VPN, tether,
 *     airplane-mode toggle) but cannot easily rotate auth tokens.
 *   • On un-auth'd routes we fall back to IP — a necessary compromise for
 *     the handful of public endpoints (health, teams list, etc.).
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = (req as { user?: { id?: string } }).user;
    if (user?.id) return `user:${user.id}`;
    const ip = (req as { ip?: string }).ip;
    return `ip:${ip ?? 'unknown'}`;
  }
}
