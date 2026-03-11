import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion } from '../question.types';
import {
  getExplicitConstraintsWithMeta,
  getAvoidInstruction,
  getAntiConvergenceInstruction,
  getCompactQuestionInstruction,
  getRelativityConstraint,
  getLeagueFameGuidanceForBatch,
} from '../diversity-hints';

interface HistoryPayload {
  question_text: string;
  correct_answer: string;
  answer_type: string;
  fifty_fifty_hint: string;
  wrong_choices?: string[];
  explanation: string;
  event_year: number;
  competition: string;
  fame_score: number;
  specificity_score: number;
}

@Injectable()
export class HistoryGenerator {
  private readonly logger = new Logger(HistoryGenerator.name);

  constructor(private llmService: LlmService) {}

  async generate(language: string = 'en', options?: { avoidAnswers?: string[]; slotIndex?: number; minorityScale?: number; forBlitz?: boolean }): Promise<GeneratedQuestion> {
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
    const wrongChoicesBlock = options?.forBlitz
      ? '\n  "wrong_choices": ["plausible wrong answer 1", "plausible wrong answer 2"],  // two plausible but incorrect options, similar in type to correct_answer'
      : '';
    const systemPrompt = `You are a football trivia expert. Generate an interesting football history question on any topic.
Topics can include: World Cup history, club history, famous matches, records, trophies, historic moments.${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}
Return ONLY a valid JSON object with these exact fields:
{
  "question_text": "the question",
  "correct_answer": "the answer (short, 1-5 words)",
  "answer_type": "name",
  "fifty_fifty_hint": "a plausible but incorrect answer (different from correct_answer), e.g. if correct is 'Brazil' write 'Argentina'",${wrongChoicesBlock}
  "explanation": "brief explanation of why this is correct (1-2 sentences)",
  "event_year": 1966,
  "competition": "Competition or league name e.g. FIFA World Cup, Premier League, UEFA Champions League",
  "fame_score": 8,
  "specificity_score": 3
}
fame_score is 1-10: 10 = universally iconic like Zidane headbutt, 1 = hyper-niche fact.
answer_type: one of "name", "team", "number", "score", "year", "country" — pick whichever matches the correct_answer.
specificity_score is 1-5: 1 = general knowledge ("Who won the 2022 World Cup?"), 3 = moderate (specific match/season detail), 5 = very specific (exact shirt number or obscure stat).${langInstruction}`;

    const { promptPart, constraints } = getExplicitConstraintsWithMeta('HISTORY', options?.slotIndex, options?.minorityScale);
    this.logger.log(`[HISTORY] slotIndex=${options?.slotIndex} constraints=${JSON.stringify(constraints)}`);
    const userPrompt = `Generate a unique football history trivia question. Make it specific and interesting. Return JSON only.${promptPart}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<HistoryPayload>(systemPrompt, userPrompt);

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
    const systemPrompt = `You are a football trivia expert. Generate ${questionCount} interesting football history questions on real events.
The questions must be factual, answerable, and clearly distinct.${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}
Return ONLY a valid JSON object:
{
  "questions": [
    {
      "question_text": "the question",
      "correct_answer": "the answer",
      "answer_type": "name",
      "fifty_fifty_hint": "a plausible but wrong answer",
      "explanation": "brief explanation",
      "event_year": 1999,
      "competition": "UEFA Champions League",
      "fame_score": 8,
      "specificity_score": 3
    }
  ]
}
${getLeagueFameGuidanceForBatch('HISTORY', language === 'el' ? 'el' : 'en')}${langInstruction}`;
    const userPrompt = `Generate ${questionCount} football history questions in one batch. ${getRelativityConstraint('HISTORY', questionCount, language === 'el' ? 'el' : 'en')}${getAvoidInstruction(options?.avoidAnswers)}`;
    const result = await this.llmService.generateStructuredJson<{ questions: HistoryPayload[] }>(
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

  private mapQuestion(result: HistoryPayload, forBlitz = false): GeneratedQuestion {
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
      category: 'HISTORY',
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
        category: 'HISTORY',
        answer_type: (result.answer_type as any) ?? 'name',
        specificity_score: result.specificity_score ?? 3,
      },
    };
  }
}
