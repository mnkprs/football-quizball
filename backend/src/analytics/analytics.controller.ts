import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ProGuard } from '../auth/pro.guard';
import { AnalyticsService } from './analytics.service';
import type { AnalyticsSummary } from './analytics.types';

@Controller('api/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @UseGuards(AuthGuard, ProGuard)
  @Get('me')
  async me(@Req() req: Request & { user: { id: string } }): Promise<AnalyticsSummary> {
    return this.analytics.getForUser(req.user.id);
  }
}
