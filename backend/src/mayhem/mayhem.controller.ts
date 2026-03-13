import { Controller, Post, Get, Body, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { MayhemService } from './mayhem.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/mayhem')
export class MayhemController {
  constructor(private mayhemService: MayhemService) {}

  @Post('ingest')
  async ingest() {
    const result = await this.mayhemService.ingestMayhem();
    return result;
  }

  @Post('expire')
  async expire() {
    const deleted = await this.mayhemService.expireOldMayhem();
    return { deleted };
  }

  @Get('mode/questions')
  @UseGuards(AuthGuard)
  async getMayhemQuestions(@Query('excludeIds') excludeIds?: string) {
    const ids = excludeIds ? excludeIds.split(',').filter(Boolean) : [];
    return this.mayhemService.getMayhemQuestions(ids);
  }

  @Post('mode/answer')
  @UseGuards(AuthGuard)
  async checkAnswer(@Body() body: { questionId: string; selectedAnswer: string }) {
    const result = await this.mayhemService.checkMayhemAnswer(body.questionId, body.selectedAnswer);
    if (!result) throw new NotFoundException('Question not found or expired');
    return result;
  }
}
