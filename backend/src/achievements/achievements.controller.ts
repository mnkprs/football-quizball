import { Controller, Get, Param } from '@nestjs/common';
import { AchievementsService } from './achievements.service';

@Controller('api/achievements')
export class AchievementsController {
  constructor(private achievementsService: AchievementsService) {}

  @Get(':userId')
  async getForUser(@Param('userId') userId: string) {
    return this.achievementsService.getForUser(userId);
  }
}
