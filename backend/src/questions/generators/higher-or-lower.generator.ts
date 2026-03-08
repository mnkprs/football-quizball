import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeneratedQuestion, DifficultyFactors } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

interface HolSeed {
  player: string;
  stat_description: string;
  shown_value: number;
  real_value: number;
  competition: string;
  season: string;
}

interface AnnotatedHolSeed extends HolSeed {
  difficulty_factors: DifficultyFactors;
}

const SEED_BANK: AnnotatedHolSeed[] = [
  { player: 'Lionel Messi', stat_description: 'goals in La Liga', shown_value: 30, real_value: 34, competition: 'La Liga', season: '2011-12',
    difficulty_factors: { event_year: 2012, competition: 'La Liga', fame_score: 9 } },
  { player: 'Cristiano Ronaldo', stat_description: 'goals in La Liga', shown_value: 40, real_value: 50, competition: 'La Liga', season: '2011-12',
    difficulty_factors: { event_year: 2012, competition: 'La Liga', fame_score: 9 } },
  { player: 'Mohamed Salah', stat_description: 'Premier League goals', shown_value: 28, real_value: 32, competition: 'Premier League', season: '2017-18',
    difficulty_factors: { event_year: 2018, competition: 'Premier League', fame_score: 8 } },
  { player: 'Erling Haaland', stat_description: 'Premier League goals in his debut season', shown_value: 30, real_value: 36, competition: 'Premier League', season: '2022-23',
    difficulty_factors: { event_year: 2023, competition: 'Premier League', fame_score: 8 } },
  { player: 'Harry Kane', stat_description: 'Premier League goals in 2016-17', shown_value: 25, real_value: 29, competition: 'Premier League', season: '2016-17',
    difficulty_factors: { event_year: 2017, competition: 'Premier League', fame_score: 7 } },
  { player: 'Thierry Henry', stat_description: 'Premier League goals in 2002-03', shown_value: 20, real_value: 24, competition: 'Premier League', season: '2002-03',
    difficulty_factors: { event_year: 2003, competition: 'Premier League', fame_score: 7 } },
  { player: 'Gerd Müller', stat_description: 'goals in the 1970 World Cup', shown_value: 8, real_value: 10, competition: 'FIFA World Cup', season: '1970',
    difficulty_factors: { event_year: 1970, competition: 'FIFA World Cup', fame_score: 7 } },
  { player: 'Just Fontaine', stat_description: 'goals in one World Cup tournament', shown_value: 10, real_value: 13, competition: 'FIFA World Cup', season: '1958',
    difficulty_factors: { event_year: 1958, competition: 'FIFA World Cup', fame_score: 5 } },
  { player: 'Ronaldo (R9)', stat_description: 'career World Cup goals', shown_value: 12, real_value: 15, competition: 'FIFA World Cup', season: 'Career',
    difficulty_factors: { event_year: 2006, competition: 'FIFA World Cup', fame_score: 7 } },
  { player: 'Alan Shearer', stat_description: 'career Premier League goals', shown_value: 200, real_value: 260, competition: 'Premier League', season: 'Career',
    difficulty_factors: { event_year: 2006, competition: 'Premier League', fame_score: 6 } },
];

@Injectable()
export class HigherOrLowerGenerator {
  private readonly logger = new Logger(HigherOrLowerGenerator.name);

  constructor(
    private llmService: LlmService,
    private footballApiService: FootballApiService,
  ) {}

  async generate(): Promise<GeneratedQuestion> {
    try {
      return await this.generateFromLlm();
    } catch (err) {
      this.logger.warn(`Higher/Lower LLM generation failed, using seed: ${(err as Error).message}`);
      return this.getSeedQuestion();
    }
  }

  private async generateFromLlm(): Promise<GeneratedQuestion> {
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
  "fame_score": 7
}
fame_score is 1-10: 10 = universally iconic stat, 1 = obscure niche stat.`;

    const userPrompt = `Generate a unique Higher or Lower football question with accurate statistics. It can be from any league or era. Return JSON only.`;

    const result = await this.llmService.generateStructuredJson<
      HolSeed & { event_year: number; fame_score: number }
    >(systemPrompt, userPrompt);

    if (!result.player || result.real_value === undefined || result.shown_value === undefined) {
      throw new Error('Invalid HoL response from LLM');
    }

    const difficulty_factors: DifficultyFactors = {
      event_year: result.event_year ?? new Date().getFullYear(),
      competition: result.competition ?? 'Unknown',
      fame_score: result.fame_score ?? null,
    };

    return this.buildQuestion(result, difficulty_factors);
  }

  private buildQuestion(data: HolSeed, difficulty_factors: DifficultyFactors): GeneratedQuestion {
    const isHigher = data.real_value > data.shown_value;
    const correct_answer = isHigher ? 'higher' : 'lower';

    return {
      id: uuidv4(),
      category: 'HIGHER_OR_LOWER',
      difficulty: 'EASY',
      points: 1,
      question_text: `${data.player} scored ${data.shown_value} ${data.stat_description} in ${data.season}. Is the real number higher or lower?`,
      correct_answer,
      fifty_fifty_hint: null,
      fifty_fifty_applicable: false,
      explanation: `The real number is ${correct_answer}. ${data.player} actually scored ${data.real_value} ${data.stat_description} in ${data.season}.`,
      image_url: null,
      meta: {
        player: data.player,
        shown_value: data.shown_value,
        real_value: data.real_value,
        competition: data.competition,
        season: data.season,
      },
      difficulty_factors,
    };
  }

  private getSeedQuestion(): GeneratedQuestion {
    const seed = SEED_BANK[Math.floor(Math.random() * SEED_BANK.length)];
    return this.buildQuestion(seed, seed.difficulty_factors);
  }
}
