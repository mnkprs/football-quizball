import { Injectable, Logger } from '@nestjs/common';
import { GeneratedQuestion, QuestionCategory, Difficulty, DIFFICULTY_POINTS } from './question.types';
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

// Difficulties (slots) to fill on the board per category.
// GOSSIP has 2 fixed MEDIUM slots; all others use EASY/MEDIUM/HARD.
const CATEGORY_SLOTS: Partial<Record<QuestionCategory, Difficulty[]>> = {
  GOSSIP: ['MEDIUM', 'MEDIUM'],
  TOP_5: ['HARD', 'HARD'],
};
const DEFAULT_DIFFICULTIES: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

const CANDIDATES_PER_CATEGORY = 5;

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

  async generateBoard(): Promise<GeneratedQuestion[]> {
    // Generate 5 candidates per category in parallel (25 total)
    const tasks: Promise<GeneratedQuestion>[] = CATEGORIES.flatMap((category) =>
      Array.from({ length: CANDIDATES_PER_CATEGORY }, () =>
        this.generateRawWithRetry(category),
      ),
    );

    const results = await Promise.allSettled(tasks);

    // Score all successful candidates
    const scored: Array<{ question: GeneratedQuestion; difficulty: Difficulty; points: number; index: number }> = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const q = result.value;
        if (q.difficulty_factors) {
          const { difficulty, points } = this.difficultyScorer.score(q.difficulty_factors);
          scored.push({ question: q, difficulty, points, index: i });
        } else {
          this.logger.warn(`Question missing difficulty_factors: ${q.category}`);
        }
      } else {
        this.logger.error(`Candidate generation failed: ${result.reason}`);
      }
    });

    this.logger.log(`Generated ${scored.length}/${results.length} scoreable candidates`);

    // Fill board slots greedily (3 per standard category, 2 MEDIUM for GOSSIP)
    const board: GeneratedQuestion[] = [];
    const usedIndices = new Set<number>();

    const resolvePoints = (q: GeneratedQuestion, d: Difficulty) => {
      if (q.category === 'TOP_5') return 3;
      if (q.category === 'GOSSIP') return 2;
      return DIFFICULTY_POINTS[d];
    };

    for (const category of CATEGORIES) {
      const slots = CATEGORY_SLOTS[category] ?? DEFAULT_DIFFICULTIES;
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
          board.push({ ...question, difficulty: d, points: resolvePoints(question, d) });
        } else {
          // Rebucket fallback: any unused question from this category
          const fallbackIdx = scored.findIndex(
            (s, i) => !usedIndices.has(i) && s.question.category === category,
          );

          if (fallbackIdx !== -1) {
            usedIndices.add(fallbackIdx);
            const { question } = scored[fallbackIdx];
            board.push({ ...question, difficulty, points: resolvePoints(question, difficulty) });
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
  async generateOne(category: QuestionCategory, difficulty: Difficulty): Promise<GeneratedQuestion> {
    const question = await this.generateRawWithRetry(category);
    const { difficulty: scoredDiff, points } = this.difficultyScorer.score(question.difficulty_factors!);
    // Use the requested difficulty if the scored one doesn't match (pool stores by requested slot)
    return { ...question, difficulty: scoredDiff ?? difficulty, points };
  }

  private async generateRawWithRetry(
    category: QuestionCategory,
    maxRetries = 3,
  ): Promise<GeneratedQuestion> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const question = await this.generateRaw(category);
        this.validateQuestion(question);
        return question;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(`Attempt ${attempt} for ${category} failed: ${lastError.message}`);
      }
    }

    throw lastError || new Error(`Failed to generate ${category}`);
  }

  private async generateRaw(category: QuestionCategory): Promise<GeneratedQuestion> {
    switch (category) {
      case 'HISTORY':         return this.historyGenerator.generate();
      case 'PLAYER_ID':       return this.playerIdGenerator.generate();
      case 'HIGHER_OR_LOWER': return this.higherOrLowerGenerator.generate();
      case 'GUESS_SCORE':     return this.guessScoreGenerator.generate();
      case 'TOP_5':           return this.top5Generator.generate();
      case 'GEOGRAPHY':       return this.geographyGenerator.generate();
      case 'GOSSIP':          return this.gossipGenerator.generate();
    }
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
    const { difficulty_factors, ...safeQuestion } = question;
    return safeQuestion;
  }
}
