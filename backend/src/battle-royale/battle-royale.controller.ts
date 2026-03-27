import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { BattleRoyaleService } from './battle-royale.service';
import { CreateRoomDto, JoinRoomByCodeDto, BRAnswerDto } from './battle-royale.types';

interface AuthRequest extends Request {
  user: { id: string; email: string };
}

@Controller('api/battle-royale')
export class BattleRoyaleController {
  constructor(
    private readonly brService: BattleRoyaleService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /** Create a new room and become the host */
  @Post()
  @UseGuards(AuthGuard)
  async createRoom(@Request() req: AuthRequest, @Body() dto: CreateRoomDto) {
    return this.brService.createRoom(req.user.id);
  }

  /** Join a room by invite code */
  @Post('join')
  @UseGuards(AuthGuard)
  async joinByCode(@Request() req: AuthRequest, @Body() dto: JoinRoomByCodeDto) {
    return this.brService.joinByCode(req.user.id, undefined, dto.inviteCode);
  }

  /** Join or create a random waiting room */
  @Post('queue')
  @UseGuards(AuthGuard)
  async joinQueue(@Request() req: AuthRequest) {
    return this.brService.joinQueue(req.user.id);
  }

  /** List public waiting rooms (lobby browser) */
  @Get('rooms')
  @UseGuards(AuthGuard)
  async getPublicRooms(@Request() req: AuthRequest) {
    return this.brService.getPublicRooms();
  }

  /** Create a new Team Logo Battle Royale room (friends-only, private) */
  @Post('team-logo')
  @UseGuards(AuthGuard)
  async createTeamLogoRoom(@Request() req: AuthRequest): Promise<{ roomId: string; inviteCode: string }> {
    return this.brService.createTeamLogoRoom(req.user.id);
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

  /** Leave a waiting room; host transfer or room deletion handled server-side */
  @Delete(':id/leave')
  @UseGuards(AuthGuard)
  async leaveRoom(@Param('id') id: string, @Request() req: AuthRequest) {
    await this.brService.leaveRoom(id, req.user.id);
    return { ok: true };
  }
}
