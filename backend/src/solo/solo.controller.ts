import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SoloService } from './solo.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('api/solo')
export class SoloController {
  constructor(
    private soloService: SoloService,
    private supabaseService: SupabaseService,
  ) {}

  @Post('session')
  @UseGuards(AuthGuard)
  startSession(@Req() req: any) {
    return this.soloService.startSession(req.user.id);
  }

  @Get('session/:id/next')
  @UseGuards(AuthGuard)
  getNextQuestion(@Param('id') id: string, @Req() req: any) {
    return this.soloService.getNextQuestion(id, req.user.id);
  }

  @Post('session/:id/answer')
  @UseGuards(AuthGuard)
  submitAnswer(@Param('id') id: string, @Body() body: { answer: string }, @Req() req: any) {
    return this.soloService.submitAnswer(id, req.user.id, body.answer);
  }

  @Post('session/:id/end')
  @UseGuards(AuthGuard)
  endSession(@Param('id') id: string, @Req() req: any) {
    return this.soloService.endSession(id, req.user.id);
  }

  @Get('leaderboard')
  getLeaderboard() {
    return this.supabaseService.getLeaderboard(20);
  }

  @Get('profile/:userId')
  async getProfile(@Param('userId') userId: string) {
    const profile = await this.supabaseService.getProfile(userId);
    const history = await this.supabaseService.getEloHistory(userId, 20);
    return { profile, history };
  }
}
