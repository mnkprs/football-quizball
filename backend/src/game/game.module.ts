import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { LlmModule } from '../llm/llm.module';
import { QuestionsModule } from '../questions/questions.module';

@Module({
  imports: [LlmModule, QuestionsModule],
  controllers: [GameController],
  providers: [GameService],
})
export class GameModule {}
