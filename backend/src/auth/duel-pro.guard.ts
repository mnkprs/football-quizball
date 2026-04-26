import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Read-only quota gate for duel entry. The trial is **consumed** by
 * DuelService.acceptGame / markReady when the match actually starts — see
 * SupabaseService.consumeDuelTrial. This guard only verifies that the user
 * still has quota AND isn't currently inside a no-show cooldown.
 */
@Injectable()
export class DuelProGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Ensure user is authenticated
    if (!request.user) {
      const authHeader = request.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
      request.user = await this.authService.validateToken(authHeader.slice(7));
    }

    const status = await this.supabaseService.getProStatus(request.user.id);
    const isPro = status?.is_pro ?? false;

    // Pro users get unlimited duels and bypass the cooldown.
    if (isPro) {
      request.proStatus = { is_pro: true, dailyDuelCount: 0 };
      return true;
    }

    const { remaining, blockedUntil } = await this.supabaseService.checkDuelQuota(request.user.id);

    // Cooldown takes precedence — surface its retry_after so the frontend
    // countdown rehydrates against the same wall-clock the server used.
    // Cooldown only applies to /queue (random matchmaking); invite-code
    // create/join paths are intentionally exempt per the design decision.
    const isQueueRoute = request.route?.path?.endsWith('/queue')
      || (typeof request.url === 'string' && request.url.includes('/duel/queue'));
    if (isQueueRoute && blockedUntil) {
      throw new HttpException(
        {
          message: 'Duel queue temporarily unavailable',
          retry_after: blockedUntil,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (remaining <= 0) {
      // At limit — compute next midnight UTC for retry_after
      const now = new Date();
      const nextMidnight = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0,
      ));

      throw new HttpException(
        {
          message: 'Daily duel limit reached',
          retry_after: nextMidnight.toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS, // 429
      );
    }

    request.proStatus = { is_pro: false, dailyDuelCount: 1 - remaining };
    return true;
  }
}
