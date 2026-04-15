import { Controller, ForbiddenException, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { AnalyticsService } from './analytics.service';
import type { AnalyticsSummary } from './analytics.types';

const VALID_MODES = ['solo', 'logo_quiz', 'logo_quiz_hardcore'] as const;
type AnalyticsMode = (typeof VALID_MODES)[number];

@Controller('api/analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly supabase: SupabaseService,
  ) {}

  @UseGuards(AuthGuard)
  @Get('me')
  async me(
    @Req() req: Request & { user: { id: string } },
    @Query('mode') mode?: string,
  ): Promise<AnalyticsSummary> {
    const resolvedMode: AnalyticsMode = VALID_MODES.includes(mode as AnalyticsMode)
      ? (mode as AnalyticsMode)
      : 'solo';
    const status = await this.supabase.getProStatus(req.user.id);
    if (!status?.is_pro) {
      throw new ForbiddenException('Pro subscription required');
    }
    return this.analytics.getForUser(req.user.id, resolvedMode);
  }
}
