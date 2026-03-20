import { Injectable, Logger } from '@nestjs/common';
import {
  GeneratedQuestion,
  QuestionCategory,
  Difficulty,
  CATEGORY_BATCH_SIZES,
  CATEGORY_DIFFICULTY_SLOTS,
  resolveQuestionPoints,
} from './config';
import { LIVE_CATEGORIES } from './config/category.config';
import { minorityScaleForDifficulty } from './diversity-hints';
import { AnswerTypeModifierService } from './answer-type-modifier.service';
import { DifficultyScorer } from './difficulty-scorer.service';
import { GeneratorOptions, GeneratorBatchOptions } from './generators/base-generator';
import { colorize, colorRawScoreOrNa, ANSI } from './utils/logger-colors';
import { HistoryGenerator } from './generators/history.generator';
import { PlayerIdGenerator } from './generators/player-id.generator';
import { HigherOrLowerGenerator } from './generators/higher-or-lower.generator';
import { GuessScoreGenerator } from './generators/guess-score.generator';
import { Top5Generator } from './generators/top5.generator';
import { GeographyGenerator } from './generators/geography.generator';
import { GossipGenerator } from './generators/gossip.generator';

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    private answerTypeModifierService: AnswerTypeModifierService,
    private difficultyScorer: DifficultyScorer,
    private historyGenerator: HistoryGenerator,
    private playerIdGenerator: PlayerIdGenerator,
    private higherOrLowerGenerator: HigherOrLowerGenerator,
    private guessScoreGenerator: GuessScoreGenerator,
    private top5Generator: Top5Generator,
    private geographyGenerator: GeographyGenerator,
    private gossipGenerator: GossipGenerator,
  ) {}

  /**
   * Generates a full board (one question per slot) for all LIVE_CATEGORIES.
   * Matches generated questions to slots by category and difficulty.
   */
  async generateBoard(language: string = 'en'): Promise<GeneratedQuestion[]> {
    const tasks: Promise<GeneratedQuestion[]>[] = LIVE_CATEGORIES.map((category) =>
      this.generateBatch(category, language, {
        questionCount: CATEGORY_BATCH_SIZES[category] ?? 2,
      }),
    );
    const results = await Promise.allSettled(tasks);
    const scored: Array<{ question: GeneratedQuestion; difficulty: Difficulty; points: number; index: number }> = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        for (const q of result.value) {
          scored.push({ question: q, difficulty: q.difficulty, points: q.points, index: i });
        }
      } else {
        this.logger.error(`Candidate generation failed: ${result.reason}`);
      }
    });

    this.logger.log(`Generated ${scored.length} scoreable batch questions`);
    const board: GeneratedQuestion[] = [];
    const usedIndices = new Set<number>();

    for (const category of LIVE_CATEGORIES) {
      const slots = CATEGORY_DIFFICULTY_SLOTS[category];
      for (const difficulty of slots) {
        const matchIdx = scored.findIndex(
          (s, i) =>
            !usedIndices.has(i) &&
            s.question.category === category &&
            s.difficulty === difficulty,
        );

        if (matchIdx !== -1) {
          usedIndices.add(matchIdx);
          const { question, difficulty: d } = scored[matchIdx];
          board.push({ ...question, difficulty: d, points: resolveQuestionPoints(question.category, d) });
        } else {
          const fallbackIdx = scored.findIndex(
            (s, i) => !usedIndices.has(i) && s.question.category === category,
          );

          if (fallbackIdx !== -1) {
            usedIndices.add(fallbackIdx);
            const { question } = scored[fallbackIdx];
            board.push({ ...question, difficulty, points: resolveQuestionPoints(question.category, difficulty) });
          } else {
            this.logger.error(`No candidates available for ${category}/${difficulty}`);
          }
        }
      }
    }

    this.logger.log(`Board assembled: ${board.length} questions`);
    return board;
  }

  /**
   * Generates, scores, and validates a single question. Used by pool seeding.
   * @throws Error if generation fails after retries or question is rejected.
   */
  async generateOne(
    category: QuestionCategory,
    difficulty: Difficulty,
    language: string = 'en',
    options?: GeneratorOptions,
  ): Promise<GeneratedQuestion> {
    const scale = options?.minorityScale ?? minorityScaleForDifficulty(difficulty);
    const question = await this.generateRawWithRetry(category, language, { ...options, minorityScale: scale });
    const scoredQuestion = this.scoreQuestion(question, language);
    if (!scoredQuestion) {
      throw new Error(`Rejected ${category} question while scoring`);
    }
    return scoredQuestion;
  }

  /**
   * Generates a batch of questions for a category, scores each, filters rejected.
   */
  async generateBatch(
    category: QuestionCategory,
    language: string = 'en',
    options?: GeneratorBatchOptions,
  ): Promise<GeneratedQuestion[]> {
    const results = await this.generateRawBatch(category, language, options);
    return results
      .map((question) => this.scoreQuestion(question, language))
      .filter((question): question is GeneratedQuestion => question !== null);
  }

  private async generateRawWithRetry(
    category: QuestionCategory,
    language: string = 'en',
    options?: GeneratorOptions,
    maxRetries = 3,
  ): Promise<GeneratedQuestion> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const question = await this.generateRaw(category, language, options);
        this.validateQuestion(question);
        return question;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(`Attempt ${attempt} for ${category} failed: ${lastError.message}`);
      }
    }

    throw lastError || new Error(`Failed to generate ${category}`);
  }

  private async generateRaw(
    category: QuestionCategory,
    language: string = 'en',
    options?: GeneratorOptions,
  ): Promise<GeneratedQuestion> {
    const genOpts =
      options?.avoidAnswers?.length || options?.slotIndex !== undefined || options?.minorityScale !== undefined || options?.forBlitz
        ? { avoidAnswers: options.avoidAnswers, slotIndex: options.slotIndex, minorityScale: options.minorityScale, forBlitz: options.forBlitz }
        : undefined;
    switch (category) {
      case 'HISTORY':         return this.historyGenerator.generate(language, genOpts);
      case 'PLAYER_ID':       return this.playerIdGenerator.generate(language, genOpts);
      case 'HIGHER_OR_LOWER': return this.higherOrLowerGenerator.generate(language, genOpts);
      case 'GUESS_SCORE':     return this.guessScoreGenerator.generate(language, genOpts);
      case 'TOP_5':           return this.top5Generator.generate(language, genOpts);
      case 'GEOGRAPHY':       return this.geographyGenerator.generate(language, genOpts);
      case 'GOSSIP':          return this.gossipGenerator.generate(language, genOpts);
      case 'NEWS':            throw new Error('NEWS has no live generator — use news ingestion service');
      default:                throw new Error(`Unknown category: ${category}`);
    }
  }

  private async generateRawBatch(
    category: QuestionCategory,
    language: string = 'en',
    options?: GeneratorBatchOptions,
  ): Promise<GeneratedQuestion[]> {
    switch (category) {
      case 'HISTORY':
        return this.historyGenerator.generateBatch(language, options);
      case 'PLAYER_ID':
        return this.playerIdGenerator.generateBatch(language, options);
      case 'HIGHER_OR_LOWER':
        return this.higherOrLowerGenerator.generateBatch(language, options);
      case 'GUESS_SCORE':
        return this.guessScoreGenerator.generateBatch(language, options);
      case 'TOP_5':
        return this.top5Generator.generateBatch(language, options);
      case 'GEOGRAPHY':
        return this.geographyGenerator.generateBatch(language, options);
      case 'GOSSIP':
        return this.gossipGenerator.generateBatch(language, options);
      case 'NEWS':
        throw new Error('NEWS has no live generator — use news ingestion service');
      default:
        throw new Error(`Unknown category: ${category}`);
    }
  }

  /**
   * Scores a question's difficulty from difficulty_factors. Returns null if rejected.
   * @param categoryOverride When set (e.g. from migration), uses this category instead of factors.category for slot consistency.
   */
  scoreQuestion(
    question: GeneratedQuestion,
    language: string = 'en',
    options?: { categoryOverride?: QuestionCategory },
  ): GeneratedQuestion | null {
    const details = this.scoreQuestionWithDetails(question, language, options);
    return details.scored;
  }

  /**
   * Same as scoreQuestion but returns reject reason when rejected. Useful for migration/debugging.
   */
  scoreQuestionWithDetails(
    question: GeneratedQuestion,
    language: string = 'en',
    options?: { categoryOverride?: QuestionCategory },
  ): { scored: GeneratedQuestion | null; rejectReason?: string } {
    if (!question.difficulty_factors) {
      return {
        scored: null,
        rejectReason: 'missing difficulty_factors',
      };
    }
    const factors = options?.categoryOverride
      ? { ...question.difficulty_factors, category: options.categoryOverride }
      : question.difficulty_factors;
    const result = this.difficultyScorer.score(factors);
    this.answerTypeModifierService
      .ensureAnswerType(factors.answer_type, factors.category)
      .catch(() => {});
    if (result.rejected) {
      this.logger.debug(`[scoreQuestion] Rejected ${question.category}: ${result.rejectReason}`);
      return {
        scored: null,
        rejectReason: result.rejectReason ?? 'scorer rejected',
      };
    }
    const scoredQuestion = {
      ...question,
      difficulty: result.difficulty,
      allowedDifficulties: result.allowedDifficulties,
      points: result.points,
      raw_score: result.raw,
    };
    if (
      process.env.LOG_GENERATED_QUESTIONS === '1' ||
      process.env.LOG_GENERATED_QUESTIONS === 'true'
    ) {
      const f = factors;
      const factorsStr = [
        `fame=${f.fame_score ?? 'n/a'}`,
        `spec=${f.specificity_score ?? 'n/a'}`,
        f.combinational_thinking_score != null ? `comb=${f.combinational_thinking_score}` : null,
        `year=${f.event_year ?? 'n/a'}`,
        `raw=${colorRawScoreOrNa(result.raw)}`,
      ]
        .filter(Boolean)
        .join(' ');
      this.logger.log(
        `${colorize('[scored]', ANSI.boldWhite)} ${colorize(`"${scoredQuestion.question_text}"`, ANSI.boldWhite)} ${colorize(factorsStr, ANSI.dim)}`,
      );
    }
    return { scored: scoredQuestion };
  }

  private validateQuestion(question: GeneratedQuestion): void {
    if (!question.question_text?.trim()) {
      throw new Error('Question text is empty');
    }
    if (!question.correct_answer?.trim()) {
      throw new Error('Correct answer is empty');
    }
    if (!question.id) {
      throw new Error('Question ID is missing');
    }
  }

  /**
   * Finds a question by ID and strips server-only fields (difficulty_factors, raw_score).
   */
  getQuestionById(questions: GeneratedQuestion[], id: string): GeneratedQuestion | undefined {
    const question = questions.find((q) => q.id === id);
    if (!question) return undefined;
    const { difficulty_factors, raw_score, allowedDifficulties, ...safeQuestion } = question;
    return safeQuestion;
  }
}
