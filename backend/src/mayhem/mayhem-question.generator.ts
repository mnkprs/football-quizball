import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { GeneratedQuestion } from '../questions/question.types';

const MAYHEM_BATCH_SIZE = 10;

@Injectable()
export class MayhemQuestionGenerator {
  private readonly logger = new Logger(MayhemQuestionGenerator.name);

  constructor(private llmService: LlmService) {}

  async generateBatch(): Promise<GeneratedQuestion[]> {
    const systemPrompt = `You are an elite football trivia expert specializing in EXTREMELY hard, obscure football knowledge from around the world.

Generate ${MAYHEM_BATCH_SIZE} multiple-choice football trivia questions that are genuinely difficult — designed to challenge even hardcore football fans.

REQUIREMENTS:
- Facts must be 100% verifiable and accurate. When in doubt, skip the question.
- Focus EXCLUSIVELY on: exact stats/numbers, lesser-known records, non-big-5-league history, precise transfer fees, exact years/scores/dates, obscure player achievements, world football outside England/Spain/Germany/Italy/France.
- Worldwide scope: Africa (CAF), Asia (AFC), South America (CONMEBOL), Eastern Europe, historic records, lower divisions, national team obscurities.
- AVOID: questions about Messi/Ronaldo/top-5 common facts, Champions League finals everyone knows, obvious World Cup records.
- The correct answer must be SHORT: 1-5 words (exact number, name, year, club, country).
- Provide exactly 3 wrong choices: plausible but incorrect, same type/format as correct answer (name→name, year→year, number→number). Make them deceptive — similar enough to confuse.
- No 50/50 hint needed.

Return ONLY a valid JSON object:
{
  "questions": [
    {
      "question_text": "the question",
      "correct_answer": "short answer",
      "wrong_choices": ["wrong1", "wrong2", "wrong3"],
      "explanation": "brief explanation why this is the answer",
      "source_url": "URL to verify (Wikipedia, transfermarkt, official stats, etc.)"
    }
  ]
}`;

    const userPrompt = `Generate ${MAYHEM_BATCH_SIZE} extremely hard, obscure football trivia questions with multiple choice answers. Return JSON only.`;

    try {
      const result = await this.llmService.generateStructuredJson<{
        questions: Array<{
          question_text: string;
          correct_answer: string;
          wrong_choices: string[];
          explanation: string;
          source_url?: string;
        }>;
      }>(systemPrompt, userPrompt);

      const questions = result?.questions ?? [];
      if (!Array.isArray(questions) || questions.length === 0) {
        this.logger.warn('[MayhemQuestionGenerator] No questions in LLM response');
        return [];
      }

      return questions
        .filter((q) => {
          if (!q.question_text?.trim() || !q.correct_answer?.trim()) return false;
          if (!Array.isArray(q.wrong_choices) || q.wrong_choices.length < 3) return false;
          return true;
        })
        .map((q) => this.toGeneratedQuestion(q));
    } catch (err) {
      this.logger.error(`[MayhemQuestionGenerator] Failed: ${(err as Error).message}`);
      return [];
    }
  }

  private toGeneratedQuestion(q: {
    question_text: string;
    correct_answer: string;
    wrong_choices: string[];
    explanation?: string;
    source_url?: string;
  }): GeneratedQuestion {
    const id = crypto.randomUUID();
    return {
      id,
      category: 'MAYHEM',
      difficulty: 'HARD',
      points: 3,
      question_text: q.question_text.trim(),
      correct_answer: q.correct_answer.trim(),
      wrong_choices: q.wrong_choices.map((w) => w.trim()).slice(0, 3),
      fifty_fifty_hint: null,
      fifty_fifty_applicable: false,
      explanation: q.explanation?.trim() || '',
      source_url: typeof q.source_url === 'string' && q.source_url.trim() ? q.source_url.trim() : undefined,
      image_url: null,
      difficulty_factors: {
        event_year: new Date().getFullYear(),
        competition: 'World Football',
        fame_score: 2,
        category: 'MAYHEM',
        answer_type: 'mixed',
        specificity_score: 10,
        combinational_thinking_score: 10,
      },
    };
  }
}
