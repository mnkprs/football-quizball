import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeneratedQuestion, DifficultyFactors } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

interface MatchSeed {
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  competition: string;
  date: string;
  significance: string;
}

interface AnnotatedMatchSeed extends MatchSeed {
  difficulty_factors: DifficultyFactors;
}

const SEED_BANK: AnnotatedMatchSeed[] = [
  { home_team: 'Germany', away_team: 'Brazil', home_score: 7, away_score: 1, competition: 'FIFA World Cup Semi-Final', date: '8 July 2014', significance: 'The Mineirazo',
    difficulty_factors: { event_year: 2014, competition: 'FIFA World Cup', fame_score: 10 } },
  { home_team: 'Barcelona', away_team: 'Real Madrid', home_score: 5, away_score: 0, competition: 'La Liga', date: '29 November 2010', significance: 'Historic El Clásico',
    difficulty_factors: { event_year: 2010, competition: 'La Liga', fame_score: 9 } },
  { home_team: 'Manchester United', away_team: 'Arsenal', home_score: 8, away_score: 2, competition: 'Premier League', date: '28 August 2011', significance: "One of Arsenal's worst defeats",
    difficulty_factors: { event_year: 2011, competition: 'Premier League', fame_score: 8 } },
  { home_team: 'Liverpool', away_team: 'Barcelona', home_score: 4, away_score: 0, competition: 'UEFA Champions League Semi-Final', date: '7 May 2019', significance: 'Anfield miracle (aggregate 4-3)',
    difficulty_factors: { event_year: 2019, competition: 'UEFA Champions League', fame_score: 9 } },
  { home_team: 'England', away_team: 'West Germany', home_score: 4, away_score: 2, competition: 'World Cup Final', date: '30 July 1966', significance: "England's only World Cup win",
    difficulty_factors: { event_year: 1966, competition: 'FIFA World Cup', fame_score: 9 } },
  { home_team: 'Italy', away_team: 'West Germany', home_score: 4, away_score: 3, competition: 'FIFA World Cup Semi-Final', date: '17 June 1970', significance: 'The Game of the Century',
    difficulty_factors: { event_year: 1970, competition: 'FIFA World Cup', fame_score: 7 } },
  { home_team: 'Real Madrid', away_team: 'Juventus', home_score: 4, away_score: 1, competition: 'UEFA Champions League Final', date: '3 June 2017', significance: 'UCL Final 2017',
    difficulty_factors: { event_year: 2017, competition: 'UEFA Champions League', fame_score: 7 } },
  { home_team: 'Manchester City', away_team: 'QPR', home_score: 3, away_score: 2, competition: 'Premier League', date: '13 May 2012', significance: 'Aguerooooo',
    difficulty_factors: { event_year: 2012, competition: 'Premier League', fame_score: 9 } },
  { home_team: 'Barcelona', away_team: 'PSG', home_score: 6, away_score: 1, competition: 'UEFA Champions League', date: '8 March 2017', significance: 'La Remontada',
    difficulty_factors: { event_year: 2017, competition: 'UEFA Champions League', fame_score: 9 } },
  { home_team: 'France', away_team: 'Croatia', home_score: 4, away_score: 2, competition: 'World Cup Final', date: '15 July 2018', significance: 'Russia 2018 Final',
    difficulty_factors: { event_year: 2018, competition: 'FIFA World Cup', fame_score: 9 } },
];

@Injectable()
export class GuessScoreGenerator {
  private readonly logger = new Logger(GuessScoreGenerator.name);

  constructor(
    private llmService: LlmService,
    private footballApiService: FootballApiService,
  ) {}

  async generate(): Promise<GeneratedQuestion> {
    try {
      return await this.generateFromLlm();
    } catch (err) {
      this.logger.warn(`Guess Score LLM generation failed, using seed: ${(err as Error).message}`);
      return this.getSeedQuestion();
    }
  }

  private async generateFromLlm(): Promise<GeneratedQuestion> {
    const systemPrompt = `You are a football historian. Generate a "Guess the Score" question.
Pick any real, historically accurate match — any era, any competition.
Return ONLY valid JSON:
{
  "home_team": "Team Name",
  "away_team": "Team Name",
  "home_score": 3,
  "away_score": 1,
  "competition": "Competition Name",
  "date": "Day Month Year",
  "significance": "brief note about the match",
  "event_year": 2019,
  "fame_score": 8
}
fame_score is 1-10: 10 = universally iconic match, 1 = obscure match only experts know.`;

    const userPrompt = `Generate a unique guess-the-score football question with accurate historical data. It can be from any era or league. Return JSON only.`;

    const result = await this.llmService.generateStructuredJson<
      MatchSeed & { event_year: number; fame_score: number }
    >(systemPrompt, userPrompt);

    if (!result.home_team || !result.away_team || result.home_score === undefined || result.away_score === undefined) {
      throw new Error('Invalid match data from LLM');
    }

    const difficulty_factors: DifficultyFactors = {
      event_year: result.event_year ?? new Date().getFullYear(),
      competition: result.competition ?? 'Unknown',
      fame_score: result.fame_score ?? null,
    };

    return this.buildQuestion(result, difficulty_factors);
  }

  private buildQuestion(data: MatchSeed, difficulty_factors: DifficultyFactors): GeneratedQuestion {
    const correct_answer = `${data.home_score}-${data.away_score}`;
    const fifty_hint = `${data.home_team} scored ${data.home_score} goal${data.home_score !== 1 ? 's' : ''}`;

    return {
      id: uuidv4(),
      category: 'GUESS_SCORE',
      difficulty: 'EASY',
      points: 1,
      question_text: `What was the final score in ${data.competition}?\n${data.home_team} vs ${data.away_team} — ${data.date}`,
      correct_answer,
      fifty_fifty_hint: fifty_hint,
      fifty_fifty_applicable: true,
      explanation: `The final score was ${data.home_team} ${data.home_score}-${data.away_score} ${data.away_team}. ${data.significance || ''}`,
      image_url: null,
      meta: {
        home_team: data.home_team,
        away_team: data.away_team,
        home_score: data.home_score,
        away_score: data.away_score,
        competition: data.competition,
        date: data.date,
      },
      difficulty_factors,
    };
  }

  private getSeedQuestion(): GeneratedQuestion {
    const seed = SEED_BANK[Math.floor(Math.random() * SEED_BANK.length)];
    return this.buildQuestion(seed, seed.difficulty_factors);
  }
}
