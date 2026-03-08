import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeneratedQuestion, DifficultyFactors } from '../question.types';


interface HolData {
  player: string;
  stat_description: string;
  shown_value: number;
  real_value: number;
  competition: string;
  season: string;
  event_year: number;
  fame_score: number;
  specificity_score?: number;
  question_text?: string;
  explanation?: string;
}

@Injectable()
export class HigherOrLowerGenerator {
  private readonly logger = new Logger(HigherOrLowerGenerator.name);

  constructor(
    private llmService: LlmService,
    private footballApiService: FootballApiService,
  ) {}

  async generate(language: string = 'en'): Promise<GeneratedQuestion> {
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
    const systemPrompt = `You are a football statistics expert. Create a "Higher or Lower" question.
The question shows a player's stat with a WRONG value, and the player must guess if the real value is Higher or Lower.
The "shown_value" should be plausibly wrong (within 20-30% of real value, either above or below).
Pick any interesting football statistic — any era, any league.
Return ONLY valid JSON:
{
  "player": "Player Full Name",
  "stat_description": "brief stat description (e.g. 'goals in the 2023-24 Premier League')",
  "shown_value": 25,
  "real_value": 30,
  "competition": "League/Cup name",
  "season": "YYYY-YY or YYYY",
  "event_year": 2024,
  "fame_score": 7,
  "specificity_score": 3,
  "question_text": "Full question sentence shown to the player",
  "explanation": "Brief explanation of the correct answer"
}
fame_score is 1-10: 10 = universally iconic stat, 1 = obscure niche stat.
specificity_score is 1-5: 1 = widely known career total, 3 = season-specific stat, 5 = very obscure sub-statistic.${langInstruction}`;

    const userPrompt = `Generate a unique Higher or Lower football question with accurate statistics. It can be from any league or era. Return JSON only.`;

    const result = await this.llmService.generateStructuredJson<HolData>(systemPrompt, userPrompt);

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
    };

    const question_text = result.question_text
      ?? `${result.player} scored ${result.shown_value} ${result.stat_description} in ${result.season}. Is the real number higher or lower?`;
    const explanation = result.explanation
      ?? `The real number is ${correct_answer}. ${result.player} actually scored ${result.real_value} ${result.stat_description} in ${result.season}.`;

    return {
      id: crypto.randomUUID(),
      category: 'HIGHER_OR_LOWER',
      difficulty: 'EASY',
      points: 1,
      question_text,
      correct_answer,
      fifty_fifty_hint: null,
      fifty_fifty_applicable: false,
      explanation,
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
