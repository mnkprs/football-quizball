import { Injectable, Logger } from '@nestjs/common';
import {
  GeneratedQuestion,
  QuestionCategory,
  Difficulty,
  CATEGORY_BATCH_SIZES,
  CATEGORY_DIFFICULTY_SLOTS,
  resolveQuestionPoints,
} from './question.types';
import { minorityScaleForDifficulty } from './diversity-hints';
import { DifficultyScorer } from './difficulty-scorer.service';
import { HistoryGenerator } from './generators/history.generator';
import { PlayerIdGenerator } from './generators/player-id.generator';
import { HigherOrLowerGenerator } from './generators/higher-or-lower.generator';
import { GuessScoreGenerator } from './generators/guess-score.generator';
import { Top5Generator } from './generators/top5.generator';
import { GeographyGenerator } from './generators/geography.generator';
import { GossipGenerator } from './generators/gossip.generator';

const CATEGORIES: QuestionCategory[] = [
  'HISTORY',
  'PLAYER_ID',
  'HIGHER_OR_LOWER',
  'GUESS_SCORE',
  'TOP_5',
  'GEOGRAPHY',
  'GOSSIP',
];

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  boldWhite: '\x1b[1;37m',
} as const;

function colorize(text: string, color: string): string {
  return `${color}${text}${ANSI.reset}`;
}

function colorRawScore(raw: number): string {
  if (raw < 0.36) return colorize(raw.toFixed(2), ANSI.green);
  if (raw < 0.62) return colorize(raw.toFixed(2), ANSI.yellow);
  return colorize(raw.toFixed(2), ANSI.red);
}

function colorRawScoreBefore(raw: number | undefined): string {
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    return colorize('n/a', ANSI.magenta);
  }
  return colorRawScore(raw);
}

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    private difficultyScorer: DifficultyScorer,
    private historyGenerator: HistoryGenerator,
    private playerIdGenerator: PlayerIdGenerator,
    private higherOrLowerGenerator: HigherOrLowerGenerator,
    private guessScoreGenerator: GuessScoreGenerator,
    private top5Generator: Top5Generator,
    private geographyGenerator: GeographyGenerator,
    private gossipGenerator: GossipGenerator,
  ) {}

  async generateBoard(language: string = 'en'): Promise<GeneratedQuestion[]> {
    const tasks: Promise<GeneratedQuestion[]>[] = CATEGORIES.map((category) =>
      this.generateBatch(category, language, {
        questionCount: CATEGORY_BATCH_SIZES[category] ?? 3,
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

    for (const category of CATEGORIES) {
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

  /** Generate and score a single question for use by the pool service. */
  async generateOne(
    category: QuestionCategory,
    difficulty: Difficulty,
    language: string = 'en',
    options?: { avoidAnswers?: string[]; slotIndex?: number; minorityScale?: number; forBlitz?: boolean },
  ): Promise<GeneratedQuestion> {
    const scale = options?.minorityScale ?? minorityScaleForDifficulty(difficulty);
    const question = await this.generateRawWithRetry(category, language, { ...options, minorityScale: scale });
    const scoredQuestion = this.scoreQuestion(question, language);
    if (!scoredQuestion) {
      throw new Error(`Rejected ${category} question while scoring`);
    }
    return scoredQuestion;
  }

  async generateBatch(
    category: QuestionCategory,
    language: string = 'en',
    options?: { avoidAnswers?: string[]; questionCount?: number },
  ): Promise<GeneratedQuestion[]> {
    const results = await this.generateRawBatch(category, language, options);
    return results
      .map((question) => this.scoreQuestion(question, language))
      .filter((question): question is GeneratedQuestion => question !== null);
  }

  private async generateRawWithRetry(
    category: QuestionCategory,
    language: string = 'en',
    options?: { avoidAnswers?: string[]; slotIndex?: number; minorityScale?: number; forBlitz?: boolean },
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
    options?: { avoidAnswers?: string[]; slotIndex?: number; minorityScale?: number; forBlitz?: boolean },
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
    }
  }

  private async generateRawBatch(
    category: QuestionCategory,
    language: string = 'en',
    options?: { avoidAnswers?: string[]; questionCount?: number },
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
    }
  }

  scoreQuestion(question: GeneratedQuestion, language: string = 'en'): GeneratedQuestion | null {
    if (!question.difficulty_factors) {
      this.logger.warn(`Question missing difficulty_factors: ${question.category}`);
      return null;
    }
    const factors = question.difficulty_factors;
    const result = this.difficultyScorer.score(question.difficulty_factors);
    if (result.rejected) {
      this.logger.warn(`[scoreQuestion] Rejected ${question.category}: ${result.rejectReason}`);
      return null;
    }
    const scoredQuestion = {
      ...question,
      difficulty: result.difficulty,
      points: result.points,
      raw_score: result.raw,
    };
    if (
      process.env.LOG_GENERATED_QUESTIONS === '1' ||
      process.env.LOG_GENERATED_QUESTIONS === 'true'
    ) {
      const rawBefore = question.raw_score;
      this.logger.log(
        `${colorize('[scored]', ANSI.boldWhite)} ${colorize(`"${scoredQuestion.question_text}"`, ANSI.boldWhite)} ${colorize('raw_before=', ANSI.dim)}${colorRawScoreBefore(rawBefore)} ${colorize('raw_after=', ANSI.dim)}${colorRawScore(result.raw)}`,
      );
    }
    return scoredQuestion;
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

  getQuestionById(questions: GeneratedQuestion[], id: string): GeneratedQuestion | undefined {
    const question = questions.find((q) => q.id === id);
    if (!question) return undefined;
    const { difficulty_factors, raw_score, ...safeQuestion } = question;
    return safeQuestion;
  }
}
