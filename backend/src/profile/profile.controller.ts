import {
  Controller,
  Patch,
  Delete,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('api/profile')
export class ProfileController {
  constructor(
    private readonly supabaseService: SupabaseService,
  ) {}

  @Patch('username')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async setUsername(
    @Body() body: { username: string },
    @Request() req: { user: { id: string } },
  ): Promise<void> {
    const { username } = body;

    if (!username || typeof username !== 'string') {
      throw new BadRequestException('Username is required');
    }

    const trimmed = username.trim();

    if (trimmed.length < 3 || trimmed.length > 20) {
      throw new BadRequestException('Username must be 3–20 characters');
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      throw new BadRequestException('Username may only contain letters, numbers, and underscores');
    }

    try {
      await this.supabaseService.updateUsername(req.user.id, trimmed);
    } catch (err: any) {
      // Unique constraint violation (Postgres error code 23505)
      if (err?.code === '23505' || err?.message?.includes('unique') || err?.message?.includes('duplicate')) {
        throw new ConflictException('Username already taken');
      }
      throw err;
    }
  }

  @Patch('country')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async setCountry(
    @Body() body: { country_code: string },
    @Request() req: { user: { id: string } },
  ): Promise<void> {
    const { country_code } = body;

    if (!country_code || typeof country_code !== 'string') {
      throw new BadRequestException('country_code is required');
    }

    if (!/^[A-Z]{2}$/.test(country_code)) {
      throw new BadRequestException('country_code must be a 2-character uppercase string (ISO 3166-1 alpha-2)');
    }

    await this.supabaseService.updateCountryCode(req.user.id, country_code);
  }

  @Delete('account')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@Request() req: { user: { id: string } }): Promise<void> {
    await this.supabaseService.deleteUser(req.user.id);
  }

  @Get('export')
  @UseGuards(AuthGuard)
  async exportData(@Request() req: { user: { id: string } }): Promise<Record<string, unknown>> {
    return this.supabaseService.exportUserData(req.user.id);
  }
}
