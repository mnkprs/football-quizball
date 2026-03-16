import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { MatchHistoryService } from './match-history.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/match-history')
export class MatchHistoryController {
  constructor(private matchHistoryService: MatchHistoryService) {}

  @Post()
  @UseGuards(AuthGuard)
  async saveMatch(
    @Request() req: { user: { sub: string } },
    @Body() body: {
      player1_id: string;
      player2_id: string | null;
      player1_username: string;
      player2_username: string;
      winner_id: string | null;
      player1_score: number;
      player2_score: number;
      match_mode: 'local' | 'online';
    },
  ) {
    await this.matchHistoryService.saveMatch(req.user.sub, body);
    return { ok: true };
  }

  @Get(':userId')
  async getHistory(@Param('userId') userId: string) {
    return this.matchHistoryService.getHistory(userId);
  }
}
