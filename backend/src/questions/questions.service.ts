import { Injectable, Logger } from '@nestjs/common';
import { GeneratedQuestion, QuestionCategory, Difficulty, DIFFICULTY_POINTS } from './question.types';
import { DifficultyScorer } from './difficulty-scorer.service';
import { HistoryGenerator } from './generators/history.generator';
import { PlayerIdGenerator } from './generators/player-id.generator';
import { LogoQuizGenerator } from './generators/logo-quiz.generator';
import { HigherOrLowerGenerator } from './generators/higher-or-lower.generator';
import { GuessScoreGenerator } from './generators/guess-score.generator';
import { Top5Generator } from './generators/top5.generator';

const CATEGORIES: QuestionCategory[] = [
  'HISTORY',
  'PLAYER_ID',
  'LOGO_QUIZ',
  'HIGHER_OR_LOWER',
  'GUESS_SCORE',
  'TOP_5',
];

const DIFFICULTIES: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];
const CANDIDATES_PER_CATEGORY = 5;

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    private difficultyScorer: DifficultyScorer,
    private historyGenerator: HistoryGenerator,
    private playerIdGenerator: PlayerIdGenerator,
    private logoQuizGenerator: LogoQuizGenerator,
    private higherOrLowerGenerator: HigherOrLowerGenerator,
    private guessScoreGenerator: GuessScoreGenerator,
    private top5Generator: Top5Generator,
  ) {}

  async generateBoard(): Promise<GeneratedQuestion[]> {
    // Generate 5 candidates per category in parallel (30 total)
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

    this.logger.log(`Generated ${scored.length}/${tasks.length} scoreable candidates`);

    // Fill 18 board slots (6 categories × 3 difficulties) greedily
    const board: GeneratedQuestion[] = [];
    const usedIndices = new Set<number>();

    for (const category of CATEGORIES) {
      for (const difficulty of DIFFICULTIES) {
        // Try to find a natural match: correct category + scored difficulty
        const matchIdx = scored.findIndex(
          (s, i) =>
            !usedIndices.has(i) &&
            s.question.category === category &&
            s.difficulty === difficulty,
        );

        if (matchIdx !== -1) {
          usedIndices.add(matchIdx);
          const { question, difficulty: d, points } = scored[matchIdx];
          board.push({ ...question, difficulty: d, points });
        } else {
          // Rebucket fallback: any unused question from this category, override difficulty/points
          const fallbackIdx = scored.findIndex(
            (s, i) => !usedIndices.has(i) && s.question.category === category,
          );

          if (fallbackIdx !== -1) {
            usedIndices.add(fallbackIdx);
            const { question } = scored[fallbackIdx];
            board.push({ ...question, difficulty, points: DIFFICULTY_POINTS[difficulty] });
          } else {
            this.logger.error(`No candidates available for ${category}/${difficulty}`);
          }
        }
      }
    }

    this.logger.log(`Board assembled: ${board.length}/18 questions`);
    return board;
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
      case 'LOGO_QUIZ':       return this.logoQuizGenerator.generate();
      case 'HIGHER_OR_LOWER': return this.higherOrLowerGenerator.generate();
      case 'GUESS_SCORE':     return this.guessScoreGenerator.generate();
      case 'TOP_5':           return Promise.resolve(this.top5Generator.generate());
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
    // Strip internal scoring factors before returning
    const { difficulty_factors, ...safeQuestion } = question;
    return safeQuestion;
  }
}
