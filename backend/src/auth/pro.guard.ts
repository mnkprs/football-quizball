import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ProGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Validate JWT and attach user (AuthGuard may have already done this)
    if (!request.user) {
      const authHeader = request.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
      request.user = await this.authService.validateToken(authHeader.slice(7));
    }

    const status = await this.supabaseService.getProStatus(request.user.id);
    const isPro = status?.is_pro ?? false;

    // Solo and Blitz are now free — this guard allows all authenticated users through.
    // Kept for backwards compatibility; remove if no longer referenced.
    request.proStatus = { is_pro: isPro };
    return true;
  }
}
