import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion } from '../question.types';
import {
  getExplicitConstraintsWithMeta,
  getAvoidInstruction,
  getAntiConvergenceInstruction,
  getRelativityConstraint,
  getLeagueFameGuidanceForBatch,
} from '../diversity-hints';

interface GeographyPayload {
  question_text: string;
  correct_answer: string;
  fifty_fifty_hint: string;
  wrong_choices?: string[];
  explanation: string;
  event_year: number;
  competition: string;
  fame_score: number;
  specificity_score: number;
}


@Injectable()
export class GeographyGenerator {
  private readonly logger = new Logger(GeographyGenerator.name);

  constructor(private llmService: LlmService) {}

  async generate(language: string = 'en', options?: { avoidAnswers?: string[]; slotIndex?: number; minorityScale?: number; forBlitz?: boolean }): Promise<GeneratedQuestion> {
    const wrongChoicesBlock = options?.forBlitz
      ? '\n  "wrong_choices": ["plausible wrong answer 1", "plausible wrong answer 2"],'
      : '';
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
    const systemPrompt = `You are a football geography expert. Generate a football-related geography question.
Topics can include: countries with famous clubs, cities and their football teams, stadium locations, nationalities of famous players, nations that have hosted tournaments, FIFA/UEFA confederation memberships.${getAntiConvergenceInstruction()}
Return ONLY a valid JSON object with these exact fields:
{
  "question_text": "the question",
  "correct_answer": "the answer (short, 1-5 words)",
  "fifty_fifty_hint": "a plausible but incorrect answer (different from correct_answer), e.g. if correct is 'Germany' write 'France'",${wrongChoicesBlock}
  "explanation": "brief explanation (1-2 sentences)",
  "event_year": 2010,
  "competition": "Competition or league name e.g. FIFA World Cup, Premier League",
  "fame_score": 7,
  "specificity_score": 2
}
fame_score is 1-10: 10 = universally known geography fact, 1 = very obscure.
specificity_score is 1-5: 1 = general knowledge (country/continent), 3 = moderate (city/stadium), 5 = very specific (confederation zone, exact capacity).${langInstruction}`;

    const { promptPart, constraints } = getExplicitConstraintsWithMeta('GEOGRAPHY', options?.slotIndex, options?.minorityScale);
    this.logger.log(`[GEOGRAPHY] slotIndex=${options?.slotIndex} constraints=${JSON.stringify(constraints)}`);
    const userPrompt = `Generate a unique football geography trivia question. Make it interesting. Return JSON only.${promptPart}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<GeographyPayload>(systemPrompt, userPrompt);

    return this.mapQuestion(result, options?.forBlitz);
  }

  async generateBatch(
    language: string = 'en',
    options?: { avoidAnswers?: string[]; questionCount?: number },
  ): Promise<GeneratedQuestion[]> {
    const questionCount = options?.questionCount ?? 3;
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
    const systemPrompt = `You are a football geography expert. Generate ${questionCount} football geography questions.
They should range from easy to hard while staying answerable in familiar contexts.${getAntiConvergenceInstruction()}
Return ONLY a valid JSON object with a "questions" array. Each item must include question_text, correct_answer, fifty_fifty_hint, explanation, event_year, competition, fame_score, specificity_score.
${getLeagueFameGuidanceForBatch('GEOGRAPHY', language === 'el' ? 'el' : 'en')}${langInstruction}`;
    const userPrompt = `Generate ${questionCount} football geography questions in one batch. ${getRelativityConstraint('GEOGRAPHY', questionCount, language === 'el' ? 'el' : 'en')}${getAvoidInstruction(options?.avoidAnswers)}`;
    const result = await this.llmService.generateStructuredJson<{ questions: GeographyPayload[] }>(
      systemPrompt,
      userPrompt,
    );
    return (result.questions ?? [])
      .map((item) => {
        try {
          return this.mapQuestion(item, false);
        } catch {
          return null;
        }
      })
      .filter((item): item is GeneratedQuestion => item !== null);
  }

  private mapQuestion(result: GeographyPayload, forBlitz = false): GeneratedQuestion {
    if (!result.question_text || !result.correct_answer) {
      throw new Error('Invalid LLM response: missing question_text or correct_answer');
    }

    const rawWrong = forBlitz && Array.isArray(result.wrong_choices)
      ? result.wrong_choices
          .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
          .filter((s) => s.trim().toLowerCase() !== result.correct_answer.trim().toLowerCase())
          .slice(0, 2)
      : [];
    const wrongChoices = rawWrong.length >= 2 ? rawWrong : undefined;

    return {
      id: crypto.randomUUID(),
      category: 'GEOGRAPHY',
      difficulty: 'EASY',
      points: 1,
      question_text: result.question_text,
      correct_answer: result.correct_answer,
      wrong_choices: wrongChoices,
      fifty_fifty_hint: result.fifty_fifty_hint || null,
      fifty_fifty_applicable: true,
      explanation: result.explanation || '',
      image_url: null,
      difficulty_factors: {
        event_year: result.event_year ?? new Date().getFullYear(),
        competition: result.competition ?? 'Unknown',
        fame_score: result.fame_score ?? null,
        category: 'GEOGRAPHY',
        answer_type: 'country',
        specificity_score: result.specificity_score ?? 2,
      },
    };
  }
}
