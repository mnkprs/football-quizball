import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GameService } from './game.service';
import { CreateGameDto, SubmitAnswerDto, UseLifelineDto, Top5GuessDto } from './game.types';

@Controller('api/games')
export class GameController {
  constructor(private gameService: GameService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createGame(@Body() dto: CreateGameDto) {
    const session = await this.gameService.createGame(dto);
    return {
      game_id: session.id,
      players: session.players.map((p) => ({ name: p.name, score: p.score })),
      question_count: session.questions.length,
      status: session.status,
    };
  }

  @Get(':id')
  getGame(@Param('id') id: string) {
    return this.gameService.getBoardState(id);
  }

  @Get(':id/questions/:questionId')
  getQuestion(@Param('id') id: string, @Param('questionId') questionId: string) {
    return this.gameService.getQuestion(id, questionId);
  }

  @Post(':id/answer')
  @HttpCode(HttpStatus.OK)
  submitAnswer(@Param('id') id: string, @Body() dto: SubmitAnswerDto) {
    return this.gameService.submitAnswer(id, dto);
  }

  @Post(':id/fifty')
  @HttpCode(HttpStatus.OK)
  useLifeline(@Param('id') id: string, @Body() dto: UseLifelineDto) {
    return this.gameService.useLifeline(id, dto);
  }

  @Post(':id/override')
  @HttpCode(HttpStatus.OK)
  overrideAnswer(
    @Param('id') id: string,
    @Body() body: { questionId: string; isCorrect: boolean; playerIndex: 0 | 1 },
  ) {
    return this.gameService.overrideAnswer(id, body.questionId, body.isCorrect, body.playerIndex);
  }

  @Post(':id/top5/guess')
  @HttpCode(HttpStatus.OK)
  submitTop5Guess(@Param('id') id: string, @Body() dto: Top5GuessDto) {
    return this.gameService.submitTop5Guess(id, dto);
  }

  @Post(':id/top5/stop')
  @HttpCode(HttpStatus.OK)
  stopTop5Early(@Param('id') id: string, @Body() body: { questionId: string; playerIndex: 0 | 1 }) {
    return this.gameService.stopTop5Early(id, body);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  endGame(@Param('id') id: string) {
    const session = this.gameService.endGame(id);
    return {
      game_id: session.id,
      status: session.status,
      final_scores: [session.players[0].score, session.players[1].score],
      winner:
        session.players[0].score > session.players[1].score
          ? session.players[0].name
          : session.players[1].score > session.players[0].score
            ? session.players[1].name
            : 'Draw',
    };
  }
}
