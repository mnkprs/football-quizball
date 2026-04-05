import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { getCompactQuestionInstruction } from '../questions/diversity-hints';
import type { DailyQuestion } from '../common/interfaces/daily.interface';

@Injectable()
export class TodayGenerator {
  private readonly logger = new Logger(TodayGenerator.name);

  constructor(private readonly llmService: LlmService) {}

  /**
   * Generates 8-10 trivia questions about events that happened on this day in football history.
   */
  async generateForDate(day: number, month: number): Promise<DailyQuestion[]> {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const dateStr = `${monthNames[month - 1]} ${day}`;

    const systemPrompt = `You are a football trivia expert. Generate "on this day in football history" questions.
Rules:
- Each question must be about a real event that happened on ${dateStr} in any year.
- Events: transfers, match results, trophies won, records set, managerial appointments, retirements, etc.
- Answer must be SHORT: a name, team, year, score, or number (1-5 words).
- Generate exactly 8 questions. Each must have 2 plausible wrong choices.
- Vary the years (different decades) and topics.
${getCompactQuestionInstruction()}
Return ONLY a valid JSON object:
{
  "questions": [
    {
      "question_text": "On ${dateStr} in 2019, which club did Eden Hazard join from Chelsea?",
      "correct_answer": "Real Madrid",
      "wrong_choices": ["Barcelona", "Bayern Munich"],
      "explanation": "Eden Hazard completed his move to Real Madrid on ${dateStr}, 2019."
    }
  ]
}`;

    const userPrompt = `Generate 8 football trivia questions about events on ${dateStr}. Return JSON with "questions" array only.`;

    try {
      const result = await this.llmService.generateStructuredJson<{
        questions: DailyQuestion[];
      }>(systemPrompt, userPrompt);

      const questions = result?.questions ?? [];
      if (!Array.isArray(questions) || questions.length === 0) {
        this.logger.warn('[TodayGenerator] No questions in LLM response');
        return [];
      }

      return questions
        .filter((q) => q.question_text?.trim() && q.correct_answer?.trim())
        .map((q) => ({
          question_text: q.question_text.trim(),
          correct_answer: q.correct_answer.trim(),
          wrong_choices: Array.isArray(q.wrong_choices)
            ? q.wrong_choices.filter((s): s is string => typeof s === 'string' && s.trim() !== '').slice(0, 2)
            : [],
          explanation: (q.explanation ?? '').trim(),
        }))
        .filter((q) => q.wrong_choices.length >= 2)
        .slice(0, 10);
    } catch (err) {
      this.logger.error(`[TodayGenerator] Failed: ${(err as Error).message}`);
      return [];
    }
  }
}
