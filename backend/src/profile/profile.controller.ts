import { Controller, Patch, Body, UseGuards, Request, HttpCode, HttpStatus, ConflictException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('api/profile')
export class ProfileController {
  constructor(private readonly supabaseService: SupabaseService) {}

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
}
