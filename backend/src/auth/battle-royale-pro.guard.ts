import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';

const BATTLE_ROYALE_TRIAL_LIMIT = 1;

@Injectable()
export class BattleRoyaleProGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private supabaseService: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    if (!request.user) {
      const authHeader = request.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
      request.user = await this.authService.validateToken(authHeader.slice(7));
    }

    const status = await this.supabaseService.getProStatus(request.user.id);
    const isPro = status?.is_pro ?? false;
    const trialUsed = status?.trial_battle_royale_used ?? 0;

    if (isPro || trialUsed < BATTLE_ROYALE_TRIAL_LIMIT) {
      request.proStatus = { is_pro: isPro, trial_battle_royale_used: trialUsed };
      return true;
    }

    throw new HttpException('Pro subscription required', 402);
  }
}
