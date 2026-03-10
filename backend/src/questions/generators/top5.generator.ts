import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion, Top5Entry, DifficultyFactors } from '../question.types';
import {
  getExplicitConstraintsWithMeta,
  getAvoidInstruction,
  getAntiConvergenceInstruction,
  getRelativityConstraint,
  getLeagueFameGuidanceForBatch,
} from '../diversity-hints';

interface Top5Payload {
  question_text: string;
  top5: Top5Entry[];
  competition: string;
  event_year: number;
  fame_score: number;
  specificity_score?: number;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function leaksTop5Answer(questionText: string, top5: Top5Entry[]): boolean {
  const normalizedQuestion = ` ${normalizeText(questionText)} `;
  return top5.some((entry) => {
    const normalizedName = normalizeText(entry.name);
    return normalizedName.length >= 3 && normalizedQuestion.includes(` ${normalizedName} `);
  });
}


@Injectable()
export class Top5Generator {
  private readonly logger = new Logger(Top5Generator.name);

  constructor(private llmService: LlmService) {}

  async generate(language: string = 'en', options?: { avoidAnswers?: string[]; slotIndex?: number; minorityScale?: number }): Promise<GeneratedQuestion> {
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
    const systemPrompt = `You are a football statistics expert. Generate a "Name the Top 5" football quiz question.
Pick any interesting football top-5 ranking — all-time records, season stats, trophies, transfers, caps, etc. from any league or era.${getAntiConvergenceInstruction()}
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
  "fame_score": 7,
  "specificity_score": 3
}
The top5 array must have exactly 5 entries ordered from 1st to 5th place. All data must be factually accurate.
Question text must be compact and straightforward.
Ask directly. Do not add background trivia, setup sentences, or explanatory lead-ins before the actual ask.
Do not mention any of the 5 answer names anywhere in question_text.
fame_score is 1-10: 10 = universally iconic ranking everyone knows, 1 = very obscure niche stat.
specificity_score is 1-5: 1 = all-time list everyone can name, 3 = specific season/competition ranking, 5 = very obscure sub-statistic ranking.${langInstruction}`;

    const { promptPart, constraints } = getExplicitConstraintsWithMeta('TOP_5', options?.slotIndex, options?.minorityScale);
    this.logger.log(`[TOP_5] slotIndex=${options?.slotIndex} constraints=${JSON.stringify(constraints)}`);
    const userPrompt = `Generate a unique and interesting "Name the Top 5" football question. Make it varied — avoid repeating common rankings. Return JSON only.${promptPart}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<Top5Payload>(systemPrompt, userPrompt);

    return this.mapQuestion(result);
  }

  async generateBatch(
    language: string = 'en',
    options?: { avoidAnswers?: string[]; questionCount?: number },
  ): Promise<GeneratedQuestion[]> {
    const questionCount = options?.questionCount ?? 2;
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
    const systemPrompt = `You are a football statistics expert. Generate ${questionCount} "Name the Top 5" football quiz questions.
These questions are hard by nature, but they must still be findable because the competition context is familiar.${getAntiConvergenceInstruction()}
Return ONLY valid JSON:
{
  "questions": [
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
      "fame_score": 5,
      "specificity_score": 10
    }
  ]
}
Each question_text must be compact and straightforward.
Ask directly. Do not add background trivia, setup sentences, or explanatory lead-ins before the actual ask.
Do not mention any answer name from the top5 array anywhere in question_text.
${getLeagueFameGuidanceForBatch('TOP_5', language === 'el' ? 'el' : 'en')}${langInstruction}`;
    const userPrompt = `Generate ${questionCount} Top 5 questions in one batch. ${getRelativityConstraint('TOP_5', questionCount, language === 'el' ? 'el' : 'en')}${getAvoidInstruction(options?.avoidAnswers)}`;
    const result = await this.llmService.generateStructuredJson<{ questions: Top5Payload[] }>(
      systemPrompt,
      userPrompt,
    );
    return (result.questions ?? [])
      .map((item) => {
        try {
          return this.mapQuestion(item);
        } catch {
          return null;
        }
      })
      .filter((item): item is GeneratedQuestion => item !== null);
  }

  private mapQuestion(result: Top5Payload): GeneratedQuestion {
    if (!result.question_text || !result.top5 || result.top5.length !== 5) {
      throw new Error('Invalid LLM response: missing question_text or top5 array of 5');
    }
    if (leaksTop5Answer(result.question_text, result.top5)) {
      throw new Error('Invalid LLM response: question_text leaks a top5 answer');
    }

    const difficulty_factors: DifficultyFactors = {
      event_year: result.event_year ?? new Date().getFullYear(),
      competition: result.competition ?? 'Unknown',
      fame_score: result.fame_score ?? null,
      category: 'TOP_5',
      answer_type: 'name',
      specificity_score: result.specificity_score ?? 10,
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
