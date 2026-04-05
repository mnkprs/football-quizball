import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async validateToken(token: string): Promise<{ id: string; email: string }> {
    const { data, error } = await this.supabaseService.client.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Invalid or expired token');
    return { id: data.user.id, email: data.user.email ?? '' };
  }
}
