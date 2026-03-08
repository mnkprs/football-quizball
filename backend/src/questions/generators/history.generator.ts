import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion } from '../question.types';


@Injectable()
export class HistoryGenerator {
  private readonly logger = new Logger(HistoryGenerator.name);

  constructor(private llmService: LlmService) {}

  async generate(language: string = 'en'): Promise<GeneratedQuestion> {
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
    const systemPrompt = `You are a football trivia expert. Generate an interesting football history question on any topic.
Topics can include: World Cup history, club history, famous matches, records, trophies, historic moments.
Return ONLY a valid JSON object with these exact fields:
{
  "question_text": "the question",
  "correct_answer": "the answer (short, 1-5 words)",
  "fifty_fifty_hint": "a plausible but incorrect answer (different from correct_answer), e.g. if correct is 'Brazil' write 'Argentina'",
  "explanation": "brief explanation of why this is correct (1-2 sentences)",
  "event_year": 1966,
  "competition": "Competition or league name e.g. FIFA World Cup, Premier League, UEFA Champions League",
  "fame_score": 8
}
fame_score is 1-10: 10 = universally iconic like Zidane headbutt, 1 = hyper-niche fact.${langInstruction}`;

    const userPrompt = `Generate a unique football history trivia question. It can be about any era, league, or competition. Make it specific and interesting. Return JSON only.`;

    const result = await this.llmService.generateStructuredJson<{
      question_text: string;
      correct_answer: string;
      fifty_fifty_hint: string;
      explanation: string;
      event_year: number;
      competition: string;
      fame_score: number;
    }>(systemPrompt, userPrompt);

    if (!result.question_text || !result.correct_answer) {
      throw new Error('Invalid LLM response: missing question_text or correct_answer');
    }

    return {
      id: crypto.randomUUID(),
      category: 'HISTORY',
      difficulty: 'EASY',
      points: 1,
      question_text: result.question_text,
      correct_answer: result.correct_answer,
      fifty_fifty_hint: result.fifty_fifty_hint || null,
      fifty_fifty_applicable: true,
      explanation: result.explanation || '',
      image_url: null,
      difficulty_factors: {
        event_year: result.event_year ?? new Date().getFullYear(),
        competition: result.competition ?? 'Unknown',
        fame_score: result.fame_score ?? null,
      },
    };
  }
}
