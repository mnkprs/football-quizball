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
import { DuelService } from './duel.service';
import { CreateDuelDto, JoinDuelByCodeDto, DuelAnswerDto } from './duel.types';

@Controller('api/duel')
export class DuelController {
  constructor(private readonly service: DuelService) {}

  /** POST /api/duel — Create a new duel (host), generates invite code */
  @UseGuards(AuthGuard)
  @Post()
  createGame(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateDuelDto,
  ) {
    return this.service.createGame(req.user.id, dto);
  }

  /** GET /api/duel — List active duels for the current user */
  @UseGuards(AuthGuard)
  @Get()
  listMyGames(@Request() req: { user: { id: string } }) {
    return this.service.listMyGames(req.user.id);
  }

  /** POST /api/duel/queue — Join random matchmaking queue */
  @UseGuards(AuthGuard)
  @Post('queue')
  joinQueue(
    @Request() req: { user: { id: string } },
    @Query('language') language?: string,
  ) {
    const lang = language === 'el' ? 'el' : 'en';
    return this.service.joinQueue(req.user.id, lang);
  }

  /** POST /api/duel/join — Join a duel by invite code */
  @UseGuards(AuthGuard)
  @Post('join')
  joinByCode(
    @Request() req: { user: { id: string } },
    @Body() dto: JoinDuelByCodeDto,
  ) {
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
