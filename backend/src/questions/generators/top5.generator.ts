import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion, Top5Entry, DifficultyFactors } from '../question.types';


@Injectable()
export class Top5Generator {
  private readonly logger = new Logger(Top5Generator.name);

  constructor(private llmService: LlmService) {}

  async generate(language: string = 'en'): Promise<GeneratedQuestion> {
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
    const systemPrompt = `You are a football statistics expert. Generate a "Name the Top 5" football quiz question.
Pick any interesting football top-5 ranking — all-time records, season stats, trophies, transfers, caps, etc. from any league or era.
Return ONLY valid JSON:
{
  "question_text": "Name the top 5 ...",
  "top5": [
    {"name": "Player or Club Name", "stat": "e.g. 260 goals"},
    {"name": "...", "stat": "..."},
    {"name": "...", "stat": "..."},
    {"name": "...", "stat": "..."},
    {"name": "...", "stat": "..."}
  ],
  "competition": "Competition or league name",
  "event_year": 2024,
  "fame_score": 7
}
The top5 array must have exactly 5 entries ordered from 1st to 5th place. All data must be factually accurate.
fame_score is 1-10: 10 = universally iconic ranking everyone knows, 1 = very obscure niche stat.${langInstruction}`;

    const userPrompt = `Generate a unique and interesting "Name the Top 5" football question. Make it varied — avoid repeating common rankings. Return JSON only.`;

    const result = await this.llmService.generateStructuredJson<{
      question_text: string;
      top5: Top5Entry[];
      competition: string;
      event_year: number;
      fame_score: number;
    }>(systemPrompt, userPrompt);

    if (!result.question_text || !result.top5 || result.top5.length !== 5) {
      throw new Error('Invalid LLM response: missing question_text or top5 array of 5');
    }

    const difficulty_factors: DifficultyFactors = {
      event_year: result.event_year ?? new Date().getFullYear(),
      competition: result.competition ?? 'Unknown',
      fame_score: result.fame_score ?? null,
    };

    return {
      id: crypto.randomUUID(),
      category: 'TOP_5',
      difficulty: 'EASY',
      points: 1,
      question_text: result.question_text,
      correct_answer: result.top5.map((e) => e.name).join(', '),
      fifty_fifty_hint: null,
      fifty_fifty_applicable: false,
      explanation: `The answers were: ${result.top5.map((e, i) => `${i + 1}. ${e.name} (${e.stat})`).join(', ')}`,
      image_url: null,
      meta: { top5: result.top5 },
      difficulty_factors,
    };
  }
}
