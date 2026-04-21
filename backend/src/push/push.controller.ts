import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PushService } from './push.service';
import { RegisterTokenDto } from './dto/register-token.dto';
import { UnregisterTokenDto } from './dto/unregister-token.dto';
import type { AuthenticatedRequest } from '../common/interfaces/request.interface';

@Controller('api/push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('register')
  @UseGuards(AuthGuard)
  async register(@Req() req: AuthenticatedRequest, @Body() body: RegisterTokenDto) {
    await this.pushService.registerToken(req.user.id, body.token, body.platform);
    return { success: true };
  }

  @Post('unregister')
  @UseGuards(AuthGuard)
  async unregister(@Req() req: AuthenticatedRequest, @Body() body: UnregisterTokenDto) {
    await this.pushService.unregisterToken(req.user.id, body.token);
    return { success: true };
  }
}
