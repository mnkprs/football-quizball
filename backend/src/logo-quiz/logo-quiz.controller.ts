import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { LogoQuizService } from './logo-quiz.service';
import type { Difficulty } from '../common/interfaces/question.interface';

interface AuthenticatedRequest extends Request {
  user: { id: string; email?: string };
}

@Controller('api/logo-quiz')
export class LogoQuizController {
  constructor(private logoQuizService: LogoQuizService) {}

  /**
   * GET /api/logo-quiz/question?difficulty=EASY
   * Returns a random logo question at the given difficulty.
   * If no difficulty specified, uses the user's logo quiz ELO.
   */
  @Get('question')
  @UseGuards(AuthGuard)
  async getQuestion(
    @Req() req: AuthenticatedRequest,
    @Query('difficulty') difficulty?: string,
    @Query('hardcore') hardcore?: string,
  ) {
    const diff = ['EASY', 'HARD'].includes(difficulty?.toUpperCase() ?? '')
      ? (difficulty!.toUpperCase() as Difficulty)
      : undefined;
    return this.logoQuizService.getQuestion(req.user.id, diff, hardcore === 'true');
  }

  /**
   * POST /api/logo-quiz/answer
   * Body: { question_id, answer, timed_out? }
   */
  @Post('answer')
  @UseGuards(AuthGuard)
  async submitAnswer(
    @Req() req: AuthenticatedRequest,
    @Body() body: { question_id: string; answer: string; timed_out?: boolean; hardcore?: boolean },
  ) {
    return this.logoQuizService.submitAnswer(
      req.user.id,
      body.question_id,
      body.answer,
      body.timed_out ?? false,
      body.hardcore ?? false,
    );
  }

  /**
   * POST /api/logo-quiz/check-achievements
   * Called when frontend ends a logo quiz session to check for newly unlocked achievements.
   */
  @Post('check-achievements')
  @UseGuards(AuthGuard)
  async checkAchievements(@Req() req: AuthenticatedRequest) {
    return this.logoQuizService.checkAchievements(req.user.id);
  }

  /**
   * GET /api/logo-quiz/teams
   * Returns all team names for the searchable select field.
   * Public endpoint — no auth required (names are not sensitive).
   */
  @Get('teams')
  async getTeamNames() {
    return this.logoQuizService.getTeamNames();
  }
}
