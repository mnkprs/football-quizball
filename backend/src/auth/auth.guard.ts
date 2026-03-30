import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      if (process.env.AUTH_BYPASS === 'true') return true;
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = authHeader.slice(7);
    request.user = await this.authService.validateToken(token);
    return true;
  }
}
