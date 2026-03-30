import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { DuelProGuard } from '../auth/duel-pro.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { DuelService } from './duel.service';
import { CreateDuelDto, JoinDuelByCodeDto, JoinQueueDto, DuelAnswerDto, DuelTimeoutDto, DuelGameType } from './duel.types';

type DuelRequest = { user: { id: string }; proStatus?: { is_pro: boolean; dailyDuelCount: number } };

@Controller('api/duel')
export class DuelController {
  constructor(
    private readonly service: DuelService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /** POST /api/duel — Create a new duel (host), generates invite code */
  @UseGuards(AuthGuard, DuelProGuard)
  @Post()
  async createGame(
    @Request() req: DuelRequest,
    @Body() dto: CreateDuelDto,
  ) {
    // Daily duel increment is handled atomically by DuelProGuard
    return this.service.createGame(req.user.id, dto);
  }

  /** GET /api/duel?gameType=standard|logo — List active duels for the current user, filtered by game type */
  @UseGuards(AuthGuard)
  @Get()
  listMyGames(
    @Request() req: { user: { id: string } },
    @Query('gameType') gameType?: DuelGameType,
  ) {
    return this.service.listMyGames(req.user.id, gameType);
  }

  /** POST /api/duel/queue — Join random matchmaking queue */
  @UseGuards(AuthGuard, DuelProGuard)
  @Post('queue')
  async joinQueue(
    @Request() req: DuelRequest,
    @Body() dto: JoinQueueDto,
  ) {
    // Daily duel increment is handled atomically by DuelProGuard
    return this.service.joinQueue(req.user.id, dto);
  }

  /** POST /api/duel/join — Join a duel by invite code */
  @UseGuards(AuthGuard, DuelProGuard)
  @Post('join')
  async joinByCode(
    @Request() req: DuelRequest,
    @Body() dto: JoinDuelByCodeDto,
  ) {
    // Daily duel increment is handled atomically by DuelProGuard
    return this.service.joinByCode(req.user.id, dto);
  }

  /** GET /api/duel/:id — Get full duel view for the current user */
  @UseGuards(AuthGuard)
  @Get(':id')
  getGame(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.service.getGame(req.user.id, id);
  }

  /** POST /api/duel/:id/ready — Mark self as ready to start */
  @UseGuards(AuthGuard)
  @Post(':id/ready')
  markReady(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.service.markReady(req.user.id, id);
  }

  /**
   * POST /api/duel/:id/answer — Submit a free-form answer
   * Rate-limited to 2 req/s per user to prevent spam submissions.
   */
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @Post(':id/answer')
  submitAnswer(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: DuelAnswerDto,
  ) {
    return this.service.submitAnswer(req.user.id, id, dto);
  }

  /** POST /api/duel/:id/timeout — Skip current question when client timer expires */
  @UseGuards(AuthGuard)
  @Post(':id/timeout')
  timeoutQuestion(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: DuelTimeoutDto,
  ) {
    return this.service.timeoutQuestion(req.user.id, id, dto.questionIndex);
  }

  /** POST /api/duel/:id/abandon — Forfeit the duel */
  @UseGuards(AuthGuard)
  @Post(':id/abandon')
  abandonGame(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.service.abandonGame(req.user.id, id);
  }
}
