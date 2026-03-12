import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion } from '../question.types';
import {
  getExplicitConstraintsWithMeta,
  getAvoidInstruction,
  getAntiConvergenceInstruction,
  getCompactQuestionInstruction,
  getSingleAnswerInstruction,
  getRelativityConstraint,
  getLeagueFameGuidanceForBatch,
} from '../diversity-hints';
import { BaseGenerator, GeneratorOptions, GeneratorBatchOptions } from './base-generator';

interface GeographyPayload {
  question_text: string;
  correct_answer: string;
  answer_type?: string;
  fifty_fifty_hint: string;
  wrong_choices?: string[];
  explanation: string;
  event_year: number;
  competition: string;
  fame_score: number;
  specificity_score: number;
  combinational_thinking_score?: number;
}

@Injectable()
export class GeographyGenerator extends BaseGenerator {
  constructor(llmService: LlmService) {
    super(llmService);
  }

  async generate(language = 'en', options?: GeneratorOptions): Promise<GeneratedQuestion> {
    const systemPrompt = `You are a football geography expert. Generate a football-related geography question.
      Topics can include: countries with famous clubs, cities and their football teams, stadium locations, nationalities of famous players, nations that have hosted tournaments, FIFA/UEFA confederation memberships.
      ${getSingleAnswerInstruction()}${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}
      Return ONLY a valid JSON object with these exact fields:
      {
        "question_text": "the question",
        "correct_answer": "the answer (short, 1-5 words)",
        "answer_type": "country",
        "fifty_fifty_hint": "a plausible but incorrect answer (different from correct_answer), e.g. if correct is 'Germany' write 'France'",${this.wrongChoicesPromptBlock(options?.forBlitz ?? false)}
        "explanation": "brief explanation (1-2 sentences)",
        "event_year": 2010,
        "competition": "Competition or league name e.g. FIFA World Cup, Premier League",
        "fame_score": 7,
        "specificity_score": 2,
        "combinational_thinking_score": 3
      }
      answer_type: What the question asks for (e.g. country, city, stadium, player nationality). Use lowercase, 1-3 words.
      fame_score is 1-10: 10 = universally known geography fact, 1 = very obscure.
      specificity_score is 1-5: 1 = general knowledge (country/continent), 3 = moderate (city/stadium), 5 = very specific (confederation zone, exact capacity).
      combinational_thinking_score 1-10: 1 = single fact recall, 5 = combines 2-3 dimensions (country+competition+context), 10 = multi-dimensional reasoning.${this.langInstruction(language)}`;

    const { promptPart, constraints } = getExplicitConstraintsWithMeta('GEOGRAPHY', options?.slotIndex, options?.minorityScale);
    this.logConstraints('GEOGRAPHY', options?.slotIndex, constraints);
    const userPrompt = `Generate a unique football geography trivia question. Make it interesting. Return JSON only.${promptPart}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<GeographyPayload>(systemPrompt, userPrompt);
    return this.mapQuestion(result, options?.forBlitz);
  }

  async generateBatch(language = 'en', options?: GeneratorBatchOptions): Promise<GeneratedQuestion[]> {
    const questionCount = options?.questionCount ?? 3;
    const systemPrompt = `You are a football geography expert. Generate ${questionCount} football geography questions.
They should range from easy to hard while staying answerable in familiar contexts.
${getSingleAnswerInstruction()}${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}
Return ONLY a valid JSON object with a "questions" array. Each item must include question_text, correct_answer, answer_type, fifty_fifty_hint, explanation, event_year, competition, fame_score, specificity_score, combinational_thinking_score.
    ${getLeagueFameGuidanceForBatch('GEOGRAPHY', language === 'el' ? 'el' : 'en')}${this.langInstruction(language)}`;
    const userPrompt = `Generate ${questionCount} football geography questions in one batch. ${getRelativityConstraint('GEOGRAPHY', questionCount, language === 'el' ? 'el' : 'en')}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<{ questions: GeographyPayload[] }>(systemPrompt, userPrompt);
    return this.mapBatchItems(result.questions ?? [], (item) => this.mapQuestion(item, false));
  }

  private mapQuestion(result: GeographyPayload, forBlitz = false): GeneratedQuestion {
    if (!result.question_text || !result.correct_answer) {
      throw new Error('Invalid LLM response: missing question_text or correct_answer');
    }
    return {
      id: crypto.randomUUID(),
      category: 'GEOGRAPHY',
      difficulty: 'EASY',
      points: 1,
      question_text: result.question_text,
      correct_answer: result.correct_answer,
      wrong_choices: this.extractWrongChoices(forBlitz, result.wrong_choices, result.correct_answer),
      fifty_fifty_hint: result.fifty_fifty_hint || null,
      fifty_fifty_applicable: true,
      explanation: result.explanation || '',
      image_url: null,
      difficulty_factors: {
        event_year: result.event_year ?? new Date().getFullYear(),
        competition: result.competition ?? 'Unknown',
        fame_score: result.fame_score ?? null,
        category: 'GEOGRAPHY',
        answer_type: (result.answer_type ?? 'country').trim().toLowerCase() || 'country',
        specificity_score: result.specificity_score ?? 2,
        combinational_thinking_score: result.combinational_thinking_score,
      },
    };
  }
}
