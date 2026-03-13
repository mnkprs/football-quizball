import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { GeneratedQuestion } from '../questions/question.types';
import { getCompactQuestionInstruction } from '../questions/diversity-hints';
import type { NewsHeadline } from '../common/interfaces/news.interface';

@Injectable()
export class NewsQuestionGenerator {
  private readonly logger = new Logger(NewsQuestionGenerator.name);

  constructor(private llmService: LlmService) {}

  /**
   * Generates trivia questions from a batch of news headlines.
   * Returns 1-2 questions per headline; facts must be derivable from the headline or common knowledge.
   */
  async generateFromHeadlines(headlines: NewsHeadline[]): Promise<GeneratedQuestion[]> {
    if (headlines.length === 0) return [];

    const headlinesText = headlines
      .map((h, i) => `[${i + 1}] ${h.headline}`)
      .join('\n');

    const systemPrompt = `You are a football trivia expert. Given recent football news headlines, generate trivia questions.
Rules:
- Each question must be factually correct and derivable from the headline or widely known football knowledge.
- Prefer questions about: transfers, match results, manager appointments, injuries, records, trophies.
- Answer must be SHORT: a name, team, score, year, or number (1-5 words).
- Generate 1-2 questions per headline. Skip headlines that don't yield a clear trivia question.
- Avoid questions that would be outdated in a week (e.g. "who is currently manager" - prefer "who was appointed manager in March 2025").
${getCompactQuestionInstruction()}
Return ONLY a valid JSON object:
{
  "questions": [
    {
      "question_text": "the question",
      "correct_answer": "short answer",
      "fifty_fifty_hint": "plausible wrong answer — SAME type as correct_answer (name→name, team→team, year→year). NOT a description.",
      "explanation": "brief explanation",
      "source_url": "URL to verify the answer (e.g. news article, official source)",
      "headline_index": 1
    }
  ]
}`;

    const userPrompt = `Generate football trivia questions from these headlines:\n\n${headlinesText}\n\nReturn JSON with "questions" array only.`;

    try {
      const result = await this.llmService.generateStructuredJson<{
        questions: Array<{
          question_text: string;
          correct_answer: string;
          fifty_fifty_hint: string;
          explanation: string;
          source_url?: string;
          headline_index?: number;
        }>;
      }>(systemPrompt, userPrompt);

      const questions = result?.questions ?? [];
      if (!Array.isArray(questions) || questions.length === 0) {
        this.logger.warn('[NewsQuestionGenerator] No questions in LLM response');
        return [];
      }

      return questions
        .filter((q) => q.question_text?.trim() && q.correct_answer?.trim())
        .map((q) => this.toGeneratedQuestion(q, headlines));
    } catch (err) {
      this.logger.error(`[NewsQuestionGenerator] Failed: ${(err as Error).message}`);
      return [];
    }
  }

  private toGeneratedQuestion(
    q: {
      question_text: string;
      correct_answer: string;
      fifty_fifty_hint?: string;
      explanation?: string;
      source_url?: string;
    },
    headlines: NewsHeadline[],
  ): GeneratedQuestion {
    const id = crypto.randomUUID();
    return {
      id,
      category: 'NEWS',
      difficulty: 'MEDIUM',
      points: 2,
      question_text: q.question_text.trim(),
      correct_answer: q.correct_answer.trim(),
      fifty_fifty_hint: q.fifty_fifty_hint?.trim() || null,
      fifty_fifty_applicable: true,
      explanation: q.explanation?.trim() || '',
      source_url: typeof q.source_url === 'string' && q.source_url.trim() ? q.source_url.trim() : undefined,
      image_url: null,
      difficulty_factors: {
        event_year: new Date().getFullYear(),
        competition: 'News',
        fame_score: 6,
        category: 'NEWS',
        answer_type: 'name',
        specificity_score: 2,
        combinational_thinking_score: 3,
      },
    };
  }
}
