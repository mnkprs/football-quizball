import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface UsernameValidation {
  valid: boolean;
  error?: string;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
  ) {}

  validateUsername(username: unknown): UsernameValidation {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required' };
    }

    const trimmed = username.trim();

    if (trimmed.length < 3 || trimmed.length > 20) {
      return { valid: false, error: 'Username must be 3–20 characters' };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return { valid: false, error: 'Username may only contain letters, numbers, and underscores' };
    }

    return { valid: true };
  }

  validateCountryCode(countryCode: unknown): { valid: boolean; error?: string } {
    if (!countryCode || typeof countryCode !== 'string') {
      return { valid: false, error: 'country_code is required' };
    }

    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return { valid: false, error: 'country_code must be a 2-character uppercase string (ISO 3166-1 alpha-2)' };
    }

    return { valid: true };
  }

  async setUsername(userId: string, username: string): Promise<void> {
    const trimmed = username.trim();
    await this.supabaseService.updateUsername(userId, trimmed);
  }

  async setCountry(userId: string, countryCode: string): Promise<void> {
    await this.supabaseService.updateCountryCode(userId, countryCode);
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.supabaseService.deleteUser(userId);
  }
}
