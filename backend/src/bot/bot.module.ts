import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SupabaseModule } from '../supabase/supabase.module';
import { DuelModule } from '../duel/duel.module';
import { BattleRoyaleModule } from '../battle-royale/battle-royale.module';
import { OnlineGameModule } from '../online-game/online-game.module';
import { BotService } from './bot.service';
import { BotMatchmakerService } from './bot-matchmaker.service';
import { BotDuelRunner } from './bot-duel-runner.service';
import { BotBattleRoyaleRunner } from './bot-battle-royale-runner.service';
import { BotOnlineGameRunner } from './bot-online-game-runner.service';

@Module({
  imports: [ScheduleModule, SupabaseModule, DuelModule, BattleRoyaleModule, OnlineGameModule],
  providers: [BotService, BotMatchmakerService, BotDuelRunner, BotBattleRoyaleRunner, BotOnlineGameRunner],
  exports: [BotMatchmakerService, BotOnlineGameRunner],
})
export class BotModule {}
