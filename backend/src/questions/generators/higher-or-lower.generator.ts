import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion, DifficultyFactors } from '../question.types';
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

interface HolPayload {
  player: string;
  stat_description: string;
  shown_value: number;
  real_value: number;
  competition: string;
  season: string;
  event_year: number;
  fame_score: number;
  specificity_score?: number;
  combinational_thinking_score?: number;
  question_text?: string;
  explanation?: string;
}

@Injectable()
export class HigherOrLowerGenerator extends BaseGenerator {
  constructor(llmService: LlmService) {
    super(llmService);
  }

  async generate(language = 'en', options?: GeneratorOptions): Promise<GeneratedQuestion> {
    const systemPrompt = `You are a football statistics expert. Create a "Higher or Lower" question.
The question shows a player's stat with a WRONG value, and the player must guess if the real value is Higher or Lower.
The "shown_value" should be plausibly wrong (within 20-30% of real value, either above or below).
Pick any interesting football statistic — any era, any league.${getSingleAnswerInstruction()}${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}
Return ONLY valid JSON:
{
  "player": "Player Full Name",
  "stat_description": "brief stat description (e.g. 'goals in the 2023-24 Premier League')",
  "shown_value": 25,
  "real_value": 30,
  "competition": "League/Cup name",
  "season": "YYYY-YY or YYYY",
  "event_year": 2024,
  "fame_score": 8,
  "specificity_score": 2,
  "combinational_thinking_score": 2,
  "question_text": "Full question sentence shown to the player",
  "explanation": "Brief explanation of the correct answer"
}
fame_score is 1-10: 10 = universally iconic stat, 1 = obscure niche stat.
specificity_score is 1-5: 1 = widely known career total, 3 = season-specific stat, 5 = very obscure sub-statistic.
combinational_thinking_score 1-10: 1 = single stat recall, 5 = combines player+season+competition+stat type, 10 = multi-dimensional reasoning.${this.langInstruction(language)}`;

    const { promptPart, constraints } = getExplicitConstraintsWithMeta('HIGHER_OR_LOWER', options?.slotIndex, options?.minorityScale);
    this.logConstraints('HIGHER_OR_LOWER', options?.slotIndex, constraints);
    const userPrompt = `Generate a unique Higher or Lower football question with accurate statistics. Return JSON only.${promptPart}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<HolPayload>(systemPrompt, userPrompt);
    return this.mapQuestion(result);
  }

  async generateBatch(language = 'en', options?: GeneratorBatchOptions): Promise<GeneratedQuestion[]> {
    const questionCount = options?.questionCount ?? 2;
    const systemPrompt = `You are a football statistics expert. Create ${questionCount} "Higher or Lower" questions.
Each question must show a player's stat with a wrong number and ask whether the real number is higher or lower.${getSingleAnswerInstruction()}${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}
Return ONLY valid JSON:
{
  "questions": [
    {
      "player": "Player Full Name",
      "stat_description": "brief stat description",
      "shown_value": 25,
      "real_value": 30,
      "competition": "League/Cup name",
      "season": "YYYY-YY or YYYY",
      "event_year": 2024,
      "fame_score": 8,
      "specificity_score": 2,
      "combinational_thinking_score": 2,
      "question_text": "Full question sentence shown to the player",
      "explanation": "Brief explanation"
    }
  ]
}
${getLeagueFameGuidanceForBatch('HIGHER_OR_LOWER', language === 'el' ? 'el' : 'en')}${this.langInstruction(language)}`;
    const userPrompt = `Generate ${questionCount} Higher or Lower questions in one batch. ${getRelativityConstraint('HIGHER_OR_LOWER', questionCount, language === 'el' ? 'el' : 'en')}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<{ questions: HolPayload[] }>(systemPrompt, userPrompt);
    return this.mapBatchItems(result.questions ?? [], (item) => this.mapQuestion(item));
  }

  private mapQuestion(result: HolPayload): GeneratedQuestion {
    if (!result.player || result.real_value === undefined || result.shown_value === undefined) {
      throw new Error('Invalid LLM response: missing player, real_value, or shown_value');
    }

    const isHigher = result.real_value > result.shown_value;
    const correct_answer = isHigher ? 'higher' : 'lower';

    const difficulty_factors: DifficultyFactors = {
      event_year: result.event_year ?? new Date().getFullYear(),
      competition: result.competition ?? 'Unknown',
      fame_score: result.fame_score ?? null,
      category: 'HIGHER_OR_LOWER',
      answer_type: 'number',
      specificity_score: result.specificity_score ?? 3,
      combinational_thinking_score: result.combinational_thinking_score,
    };

    return {
      id: crypto.randomUUID(),
      category: 'HIGHER_OR_LOWER',
      difficulty: 'EASY',
      points: 1,
      question_text: result.question_text
        ?? `${result.player} scored ${result.shown_value} ${result.stat_description} in ${result.season}. Is the real number higher or lower?`,
      correct_answer,
      fifty_fifty_hint: null,
      fifty_fifty_applicable: false,
      explanation: result.explanation
        ?? `The real number is ${correct_answer}. ${result.player} actually scored ${result.real_value} ${result.stat_description} in ${result.season}.`,
      image_url: null,
      meta: {
        player: result.player,
        shown_value: result.shown_value,
        real_value: result.real_value,
        competition: result.competition,
        season: result.season,
      },
      difficulty_factors,
    };
  }
}
