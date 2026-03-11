import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { QuestionPoolService } from '../questions/question-pool.service';
import { Difficulty } from '../questions/question.types';
import { SoloQuestion } from './solo.types';
import {
  getExplicitConstraints,
  getAntiConvergenceInstruction,
  getCompactQuestionInstruction,
  minorityScaleForElo,
} from '../questions/diversity-hints';

@Injectable()
export class SoloQuestionGenerator {
  private readonly logger = new Logger(SoloQuestionGenerator.name);

  constructor(
    private llmService: LlmService,
    private questionPoolService: QuestionPoolService,
  ) {}

  async generate(difficulty: Difficulty, elo: number = 1000): Promise<SoloQuestion> {
    // Use pool first — no LLM call when questions exist in DB
    const fromPool = await this.questionPoolService.drawOneForSolo(difficulty, 'en');
    if (fromPool) {
      return {
        id: fromPool.id,
        question_text: fromPool.question_text,
        correct_answer: fromPool.correct_answer,
        explanation: fromPool.explanation ?? '',
        difficulty,
        difficulty_factor: 0.5,
      };
    }

    // Pool empty — fall back to LLM
    const difficultyGuide: Record<Difficulty, string> = {
      EASY: 'well-known fact, easily recalled (e.g., which club did Messi win the 2015 Champions League with?)',
      MEDIUM: 'moderate difficulty, requires real football knowledge (e.g., year of a specific title win, top scorer in a specific season)',
      HARD: 'highly specific, niche fact only a true enthusiast would know (e.g., exact transfer fee, squad number in a specific year, obscure stat)',
    };

    const systemPrompt = `You are a football trivia expert generating solo ranked quiz questions.
Generate a single football question. The question should be ${difficultyGuide[difficulty]}.
Cover any football topic: history, players, clubs, transfers, trophies, scores, records, gossip, geography.
Phrase questions to be SPECIFIC and harder to Google quickly (avoid simple "who scored in the 2014 World Cup final" style).
The answer must be a SHORT, precise text answer (a name, number, year, score, or country — NOT a long sentence).${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}
Return ONLY valid JSON:
{
  "question_text": "...",
  "correct_answer": "...",
  "explanation": "...",
  "difficulty_factor": 0.5
}
difficulty_factor: float 0.1–1.0 (how hard within the difficulty tier)`;

    const scale = minorityScaleForElo(elo);
    const diversityConstraints = getExplicitConstraints('HISTORY', undefined, scale);
    const userPrompt = `Generate a ${difficulty} football trivia question. Return only the JSON object.${diversityConstraints}`;

    const raw = await this.llmService.generateStructuredJson<{
      question_text: string;
      correct_answer: string;
      explanation: string;
      difficulty_factor: number;
    }>(systemPrompt, userPrompt);

    return {
      id: crypto.randomUUID(),
      question_text: raw.question_text,
      correct_answer: raw.correct_answer,
      explanation: raw.explanation,
      difficulty,
      difficulty_factor: Math.max(0.1, Math.min(1.0, raw.difficulty_factor ?? 0.5)),
    };
  }
}
