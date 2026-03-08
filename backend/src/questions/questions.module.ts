import { Module } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { AnswerValidator } from './validators/answer.validator';
import { HistoryGenerator } from './generators/history.generator';
import { PlayerIdGenerator } from './generators/player-id.generator';
import { LogoQuizGenerator } from './generators/logo-quiz.generator';
import { HigherOrLowerGenerator } from './generators/higher-or-lower.generator';
import { GuessScoreGenerator } from './generators/guess-score.generator';
import { Top5Generator } from './generators/top5.generator';
import { LlmModule } from '../llm/llm.module';
import { FootballApiModule } from '../football-api/football-api.module';

@Module({
  imports: [LlmModule, FootballApiModule],
  providers: [
    QuestionsService,
    AnswerValidator,
    HistoryGenerator,
    PlayerIdGenerator,
    LogoQuizGenerator,
    HigherOrLowerGenerator,
    GuessScoreGenerator,
    Top5Generator,
  ],
  exports: [QuestionsService, AnswerValidator],
})
export class QuestionsModule {}
