import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { AnalyticsService } from './analytics.service';
import type { AnalyticsSummary } from './analytics.types';

@Controller('api/analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly supabase: SupabaseService,
  ) {}

  @UseGuards(AuthGuard)
  @Get('me')
  async me(@Req() req: Request & { user: { id: string } }): Promise<AnalyticsSummary> {
    const status = await this.supabase.getProStatus(req.user.id);
    if (!status?.is_pro) {
      throw new ForbiddenException('Pro subscription required');
    }
    return this.analytics.getForUser(req.user.id);
  }
}
