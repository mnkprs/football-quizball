import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { MatchHistoryService } from './match-history.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/match-history')
export class MatchHistoryController {
  constructor(private readonly matchHistoryService: MatchHistoryService) {}

  @Post()
  @UseGuards(AuthGuard)
  async saveMatch(
    @Request() req: { user: { id: string } },
    @Body() body: {
      player1_id: string;
      player2_id: string | null;
      player1_username: string;
      player2_username: string;
      winner_id: string | null;
      player1_score: number;
      player2_score: number;
      match_mode: 'local' | 'online' | 'duel' | 'battle_royale' | 'team_logo_battle';
      game_ref_id?: string;
      game_ref_type?: string;
    },
  ) {
    await this.matchHistoryService.saveMatch(req.user.id, body);
    return { ok: true };
  }

  @Get(':matchId/details')
  @UseGuards(AuthGuard)
  async getMatchDetail(
    @Request() req: { user: { id: string } },
    @Param('matchId') matchId: string,
  ) {
    return this.matchHistoryService.getMatchDetail(matchId, req.user.id);
  }

  @Get(':userId')
  @UseGuards(AuthGuard)
  async getHistory(
    @Request() req: { user: { id: string } },
    @Param('userId') userId: string,
  ) {
    // Return the target user's history; gate depth on the REQUESTING user's is_pro
    // (only when viewing their own profile).
    return this.matchHistoryService.getHistory(userId, req.user.id);
  }
}
