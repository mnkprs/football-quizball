import { Controller, Get, Patch, Post, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ChallengeDto } from './dto/challenge.dto';
import type { AuthenticatedRequest } from '../common/interfaces/request.interface';

@Controller('api/notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async getNotifications(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const l = Math.min(Math.max(parseInt(limit ?? '50', 10) || 50, 1), 100);
    const o = Math.max(parseInt(offset ?? '0', 10) || 0, 0);
    return this.notificationsService.getForUser(req.user.id, l, o);
  }

  @Patch(':id/read')
  @UseGuards(AuthGuard)
  async markAsRead(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    await this.notificationsService.markAsRead(req.user.id, id);
    return { success: true };
  }

  @Patch('read-all')
  @UseGuards(AuthGuard)
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    await this.notificationsService.markAllAsRead(req.user.id);
    return { success: true };
  }

  @Get('unread-count')
  @UseGuards(AuthGuard)
  async getUnreadCount(@Req() req: AuthenticatedRequest) {
    const count = await this.notificationsService.getUnreadCount(req.user.id);
    return { count };
  }

  @Post('challenge')
  @UseGuards(AuthGuard)
  async sendChallenge(@Req() req: AuthenticatedRequest, @Body() body: ChallengeDto) {
    if (body.targetUserId === req.user.id) {
      return { success: false, error: 'Cannot challenge yourself' };
    }

    const target = await this.supabaseService.getProfile(body.targetUserId);
    if (!target) {
      return { success: false, error: 'User not found' };
    }

    const challenger = await this.supabaseService.getProfile(req.user.id);
    const challengerName = challenger?.username ?? 'Someone';
    const modeLabel = body.gameType === 'logo' ? 'Logo Duel' : 'Standard Duel';
    const route = body.gameType === 'logo' ? '/duel?mode=logo' : '/duel';

    await this.notificationsService.create({
      userId: body.targetUserId,
      type: 'challenge_received',
      title: `${challengerName} challenged you!`,
      body: `${modeLabel} — tap to accept`,
      icon: '⚔️',
      route,
      metadata: {
        challengerId: req.user.id,
        challengerName,
        gameType: body.gameType,
        message: body.message,
      },
    });

    return { success: true };
  }
}
