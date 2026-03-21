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
import { AuthGuard } from '../auth/auth.guard';
import { OnlineGameService } from './online-game.service';
import {
  CreateOnlineGameDto,
  JoinByCodeDto,
  OnlineSubmitAnswerDto,
  OnlineUseLifelineDto,
  OnlineTop5GuessDto,
  OnlineStopTop5Dto,
} from './online-game.types';

@Controller('api/online-games')
export class OnlineGameController {
  constructor(private readonly service: OnlineGameService) {}

  /** POST /api/online-games — Create a new game (waiting for guest via invite) */
  @UseGuards(AuthGuard)
  @Post()
  createGame(@Request() req: { user: { id: string } }, @Body() dto: CreateOnlineGameDto) {
    return this.service.createGame(req.user.id, dto);
  }

  /** GET /api/online-games — List active games for the current user */
  @UseGuards(AuthGuard)
  @Get()
  listMyGames(@Request() req: { user: { id: string } }) {
    return this.service.listMyGames(req.user.id);
  }

  /** GET /api/online-games/count — Count active games + pro status */
  @UseGuards(AuthGuard)
  @Get('count')
  getGameCount(@Request() req: { user: { id: string } }) {
    return this.service.getGameCount(req.user.id);
  }

  /** POST /api/online-games/queue — Join the random matchmaking queue */
  @UseGuards(AuthGuard)
  @Post('queue')
  joinQueue(@Request() req: { user: { id: string } }) {
    return this.service.joinQueue(req.user.id, 'en');
  }

  /** GET /api/online-games/preview/:code — Public preview of an invite link (no auth) */
  @Get('preview/:code')
  previewInvite(@Param('code') code: string) {
    return this.service.previewInvite(code);
  }

  /** POST /api/online-games/join — Join a game by invite code */
  @UseGuards(AuthGuard)
  @Post('join')
  joinByCode(@Request() req: { user: { id: string } }, @Body() dto: JoinByCodeDto) {
    return this.service.joinByCode(req.user.id, dto);
  }

  /** GET /api/online-games/:id — Get full game view for the current user */
  @UseGuards(AuthGuard)
  @Get(':id')
  getGame(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.service.getGame(req.user.id, id);
  }

  /** GET /api/online-games/:id/questions/:qid — Get a question (only when it's your turn) */
  @UseGuards(AuthGuard)
  @Get(':id/questions/:qid')
  getQuestion(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('qid') qid: string,
  ) {
    return this.service.getQuestion(req.user.id, id, qid);
  }

  /** POST /api/online-games/:id/answer — Submit an answer */
  @UseGuards(AuthGuard)
  @Post(':id/answer')
  submitAnswer(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: OnlineSubmitAnswerDto,
  ) {
    return this.service.submitAnswer(req.user.id, id, dto);
  }

  /** POST /api/online-games/:id/fifty — Use 50-50 lifeline */
  @UseGuards(AuthGuard)
  @Post(':id/fifty')
  useLifeline(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: OnlineUseLifelineDto,
  ) {
    return this.service.useLifeline(req.user.id, id, dto);
  }

  /** POST /api/online-games/:id/top5/guess — Submit a Top 5 guess */
  @UseGuards(AuthGuard)
  @Post(':id/top5/guess')
  submitTop5Guess(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: OnlineTop5GuessDto,
  ) {
    return this.service.submitTop5Guess(req.user.id, id, dto);
  }

  /** POST /api/online-games/:id/top5/stop — Stop Top 5 early (4/5 found) */
  @UseGuards(AuthGuard)
  @Post(':id/top5/stop')
  stopTop5Early(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: OnlineStopTop5Dto,
  ) {
    return this.service.stopTop5Early(req.user.id, id, dto.questionId);
  }

  /** POST /api/online-games/:id/abandon — Abandon a game */
  @UseGuards(AuthGuard)
  @Post(':id/abandon')
  abandonGame(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.service.abandonGame(req.user.id, id);
  }
}
