import { Module } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { AnswerValidator } from './validators/answer.validator';
import { DifficultyScorer } from './difficulty-scorer.service';
import { HistoryGenerator } from './generators/history.generator';
import { PlayerIdGenerator } from './generators/player-id.generator';
import { HigherOrLowerGenerator } from './generators/higher-or-lower.generator';
import { GuessScoreGenerator } from './generators/guess-score.generator';
import { Top5Generator } from './generators/top5.generator';
import { GeographyGenerator } from './generators/geography.generator';
import { GossipGenerator } from './generators/gossip.generator';
import { LlmModule } from '../llm/llm.module';
import { FootballApiModule } from '../football-api/football-api.module';

@Module({
  imports: [LlmModule, FootballApiModule],
  providers: [
    QuestionsService,
    AnswerValidator,
    DifficultyScorer,
    HistoryGenerator,
    PlayerIdGenerator,
    HigherOrLowerGenerator,
    GuessScoreGenerator,
    Top5Generator,
    GeographyGenerator,
    GossipGenerator,
  ],
  exports: [QuestionsService, AnswerValidator],
})
export class QuestionsModule {}
