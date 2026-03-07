import { Injectable, Logger } from '@nestjs/common';
import { GeneratedQuestion, QuestionCategory, Difficulty, DIFFICULTY_POINTS } from './question.types';
import { HistoryGenerator } from './generators/history.generator';
import { PlayerIdGenerator } from './generators/player-id.generator';
import { LogoQuizGenerator } from './generators/logo-quiz.generator';
import { HigherOrLowerGenerator } from './generators/higher-or-lower.generator';
import { GuessScoreGenerator } from './generators/guess-score.generator';

const CATEGORIES: QuestionCategory[] = [
  'HISTORY',
  'PLAYER_ID',
  'LOGO_QUIZ',
  'HIGHER_OR_LOWER',
  'GUESS_SCORE',
];

const DIFFICULTIES: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    private historyGenerator: HistoryGenerator,
    private playerIdGenerator: PlayerIdGenerator,
    private logoQuizGenerator: LogoQuizGenerator,
    private higherOrLowerGenerator: HigherOrLowerGenerator,
    private guessScoreGenerator: GuessScoreGenerator,
  ) {}

  async generateBoard(): Promise<GeneratedQuestion[]> {
    const tasks: Promise<GeneratedQuestion>[] = [];

    for (const category of CATEGORIES) {
      for (const difficulty of DIFFICULTIES) {
        const points = DIFFICULTY_POINTS[difficulty];
        tasks.push(this.generateWithRetry(category, difficulty, points));
      }
    }

    const results = await Promise.allSettled(tasks);
    const questions: GeneratedQuestion[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        questions.push(result.value);
      } else {
        this.logger.error(`Question generation failed: ${result.reason}`);
      }
    }

    this.logger.log(`Generated ${questions.length}/15 questions`);
    return questions;
  }

  private async generateWithRetry(
    category: QuestionCategory,
    difficulty: Difficulty,
    points: number,
    maxRetries = 3,
  ): Promise<GeneratedQuestion> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const question = await this.generateQuestion(category, difficulty, points);
        this.validateQuestion(question);
        return question;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(`Attempt ${attempt} for ${category}/${difficulty} failed: ${lastError.message}`);
      }
    }

    throw lastError || new Error(`Failed to generate ${category}/${difficulty}`);
  }

  private async generateQuestion(
    category: QuestionCategory,
    difficulty: Difficulty,
    points: number,
  ): Promise<GeneratedQuestion> {
    switch (category) {
      case 'HISTORY':
        return this.historyGenerator.generate(difficulty, points);
      case 'PLAYER_ID':
        return this.playerIdGenerator.generate(difficulty, points);
      case 'LOGO_QUIZ':
        return this.logoQuizGenerator.generate(difficulty, points);
      case 'HIGHER_OR_LOWER':
        return this.higherOrLowerGenerator.generate(difficulty, points);
      case 'GUESS_SCORE':
        return this.guessScoreGenerator.generate(difficulty, points);
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
    return questions.find((q) => q.id === id);
  }
}
