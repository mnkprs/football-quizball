import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeneratedQuestion, DifficultyFactors } from '../question.types';
import { v4 as uuidv4 } from 'uuid';

interface MatchData {
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  competition: string;
  date: string;
  significance: string;
  event_year: number;
  fame_score: number;
}

@Injectable()
export class GuessScoreGenerator {
  private readonly logger = new Logger(GuessScoreGenerator.name);

  constructor(
    private llmService: LlmService,
    private footballApiService: FootballApiService,
  ) {}

  async generate(): Promise<GeneratedQuestion> {
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

    const result = await this.llmService.generateStructuredJson<MatchData>(systemPrompt, userPrompt);

    if (!result.home_team || !result.away_team || result.home_score === undefined || result.away_score === undefined) {
      throw new Error('Invalid LLM response: missing team names or scores');
    }

    const correct_answer = `${result.home_score}-${result.away_score}`;
    const fifty_hint = `${result.home_team} scored ${result.home_score} goal${result.home_score !== 1 ? 's' : ''}`;

    const difficulty_factors: DifficultyFactors = {
      event_year: result.event_year ?? new Date().getFullYear(),
      competition: result.competition ?? 'Unknown',
      fame_score: result.fame_score ?? null,
    };

    return {
      id: uuidv4(),
      category: 'GUESS_SCORE',
      difficulty: 'EASY',
      points: 1,
      question_text: `What was the final score in ${result.competition}?\n${result.home_team} vs ${result.away_team} — ${result.date}`,
      correct_answer,
      fifty_fifty_hint: fifty_hint,
      fifty_fifty_applicable: true,
      explanation: `The final score was ${result.home_team} ${result.home_score}-${result.away_score} ${result.away_team}. ${result.significance || ''}`,
      image_url: null,
      meta: {
        home_team: result.home_team,
        away_team: result.away_team,
        home_score: result.home_score,
        away_score: result.away_score,
        competition: result.competition,
        date: result.date,
      },
      difficulty_factors,
    };
  }
}
