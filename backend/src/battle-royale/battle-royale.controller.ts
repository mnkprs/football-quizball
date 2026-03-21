import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { BattleRoyaleProGuard } from '../auth/battle-royale-pro.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { BattleRoyaleService } from './battle-royale.service';
import { CreateRoomDto, JoinRoomByCodeDto, BRAnswerDto } from './battle-royale.types';

interface AuthRequest extends Request {
  user: { id: string; username: string; email: string };
  proStatus?: { is_pro: boolean; trial_battle_royale_used: number };
}

@Controller('api/battle-royale')
export class BattleRoyaleController {
  constructor(
    private readonly brService: BattleRoyaleService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /** Create a new room and become the host */
  @Post()
  @UseGuards(AuthGuard, BattleRoyaleProGuard)
  async createRoom(@Request() req: AuthRequest, @Body() dto: CreateRoomDto) {
    if (!req.proStatus?.is_pro) {
      await this.supabaseService.incrementBattleRoyaleTrial(req.user.id);
    }
    return this.brService.createRoom(req.user.id, req.user.username);
  }

  /** Join a room by invite code */
  @Post('join')
  @UseGuards(AuthGuard, BattleRoyaleProGuard)
  async joinByCode(@Request() req: AuthRequest, @Body() dto: JoinRoomByCodeDto) {
    if (!req.proStatus?.is_pro) {
      await this.supabaseService.incrementBattleRoyaleTrial(req.user.id);
    }
    return this.brService.joinByCode(req.user.id, req.user.username, dto.inviteCode);
  }

  /** Join or create a random waiting room */
  @Post('queue')
  @UseGuards(AuthGuard, BattleRoyaleProGuard)
  async joinQueue(@Request() req: AuthRequest) {
    if (!req.proStatus?.is_pro) {
      await this.supabaseService.incrementBattleRoyaleTrial(req.user.id);
    }
    return this.brService.joinQueue(req.user.id, req.user.username);
  }

  /** Get public room view (correct answers stripped) */
  @Get(':id')
  @UseGuards(AuthGuard)
  async getRoom(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.brService.getRoom(id, req.user.id);
  }

  /** Host starts the game */
  @Post(':id/start')
  @UseGuards(AuthGuard)
  async startRoom(@Param('id') id: string, @Request() req: AuthRequest) {
    await this.brService.startRoom(id, req.user.id);
    return { ok: true };
  }

  /** Submit an answer for the current question */
  @Post(':id/answer')
  @UseGuards(AuthGuard)
  async submitAnswer(
    @Param('id') id: string,
    @Request() req: AuthRequest,
    @Body() dto: BRAnswerDto,
  ) {
    return this.brService.submitAnswer(id, req.user.id, dto.questionIndex, dto.answer);
  }

  /** Get live leaderboard */
  @Get(':id/leaderboard')
  @UseGuards(AuthGuard)
  async getLeaderboard(@Param('id') id: string) {
    return this.brService.getLeaderboard(id);
  }
}
