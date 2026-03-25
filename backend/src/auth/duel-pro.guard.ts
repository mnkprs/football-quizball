import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';

const DAILY_DUEL_LIMIT = 3;

@Injectable()
export class DuelProGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private supabaseService: SupabaseService,
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

    // Pro users get unlimited duels
    if (isPro) {
      request.proStatus = { is_pro: true, dailyDuelCount: 0 };
      return true;
    }

    // Free users: try to increment daily duel counter (auto-resets at midnight UTC)
    // Returns -1 if already at limit (no increment applied), or new count 1-3 if allowed
    const count = await this.supabaseService.incrementDailyDuel(request.user.id);

    if (count > 0) {
      request.proStatus = { is_pro: false, dailyDuelCount: count };
      return true;
    }

    // At limit (count === -1) — compute next midnight UTC for retry_after
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
}
