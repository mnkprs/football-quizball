import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { QuestionsService } from './questions.service';
import { QuestionPoolService } from './question-pool.service';
import { QuestionDrawService } from './question-draw.service';
import { PoolSeedService } from './pool-seed.service';
import { PoolAdminService } from './pool-admin.service';
import { PoolIntegrityVerifierService } from './pool-integrity-verifier.service';
import { AnswerValidator } from './validators/answer.validator';
import { QuestionValidator } from './validators/question.validator';
import { QuestionIntegrityService } from './validators/question-integrity.service';
import { QuestionClassifierService } from './classifiers/question-classifier.service';
import { AnswerTypeModifierService } from './answer-type-modifier.service';
import { DifficultyScorer } from './difficulty-scorer.service';
import { ThresholdConfigService } from './threshold-config.service';
import { HistoryGenerator } from './generators/history.generator';
import { PlayerIdGenerator } from './generators/player-id.generator';
import { HigherOrLowerGenerator } from './generators/higher-or-lower.generator';
import { GuessScoreGenerator } from './generators/guess-score.generator';
import { Top5Generator } from './generators/top5.generator';
import { GeographyGenerator } from './generators/geography.generator';
import { GossipGenerator } from './generators/gossip.generator';
import { MigratePoolDifficultyService } from './migrate-pool-difficulty.service';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [ScheduleModule.forRoot(), LlmModule],
  providers: [
    AnswerTypeModifierService,
    ThresholdConfigService,
    QuestionsService,
    QuestionPoolService,
    QuestionDrawService,
    PoolSeedService,
    PoolAdminService,
    PoolIntegrityVerifierService,
    AnswerValidator,
    QuestionValidator,
    QuestionIntegrityService,
    QuestionClassifierService,
    DifficultyScorer,
    HistoryGenerator,
    PlayerIdGenerator,
    HigherOrLowerGenerator,
    GuessScoreGenerator,
    Top5Generator,
    GeographyGenerator,
    GossipGenerator,
    MigratePoolDifficultyService,
  ],
  exports: [
    QuestionsService,
    QuestionPoolService,
    QuestionDrawService,
    PoolSeedService,
    PoolAdminService,
    PoolIntegrityVerifierService,
    AnswerValidator,
    QuestionValidator,
    QuestionIntegrityService,
    QuestionClassifierService,
    ThresholdConfigService,
    MigratePoolDifficultyService,
    DifficultyScorer,
  ],
})
export class QuestionsModule {}
