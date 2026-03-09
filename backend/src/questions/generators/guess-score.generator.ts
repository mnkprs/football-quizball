import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeneratedQuestion, DifficultyFactors } from '../question.types';
import { getDiversityHints, getAvoidInstruction } from '../diversity-hints';


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
  question_text?: string;
  explanation?: string;
}

@Injectable()
export class GuessScoreGenerator {
  private readonly logger = new Logger(GuessScoreGenerator.name);

  constructor(
    private llmService: LlmService,
    private footballApiService: FootballApiService,
  ) {}

  async generate(language: string = 'en', options?: { avoidAnswers?: string[] }): Promise<GeneratedQuestion> {
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
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
  "fame_score": 8,
  "specificity_score": 4,
  "question_text": "Full question sentence shown to the player",
  "explanation": "Brief explanation of the correct answer"
}
fame_score is 1-10: 10 = universally iconic match, 1 = obscure match only experts know.
specificity_score is 1-5: 1 = famous final everyone recalls, 3 = notable but not top-of-mind, 5 = very obscure match detail.${langInstruction}`;

    const userPrompt = `Generate a unique guess-the-score football question with accurate historical data. It can be from any era or league. Return JSON only.${getDiversityHints('GUESS_SCORE')}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<MatchData & { specificity_score?: number }>(systemPrompt, userPrompt);

    if (!result.home_team || !result.away_team || result.home_score === undefined || result.away_score === undefined) {
      throw new Error('Invalid LLM response: missing team names or scores');
    }

    const correct_answer = `${result.home_score}-${result.away_score}`;
    // Generate a plausible wrong score by shifting one score by ±1
    const wrongHome = result.home_score + (Math.random() < 0.5 ? 1 : -1);
    const wrongAway = wrongHome === result.home_score ? result.away_score + 1 : result.away_score;
    const fifty_hint = `${Math.max(0, wrongHome)}-${Math.max(0, wrongAway)}`;

    const difficulty_factors: DifficultyFactors = {
      event_year: result.event_year ?? new Date().getFullYear(),
      competition: result.competition ?? 'Unknown',
      fame_score: result.fame_score ?? null,
      category: 'GUESS_SCORE',
      answer_type: 'score',
      specificity_score: result.specificity_score ?? 4,
    };

    const question_text = result.question_text
      ?? `What was the final score in ${result.competition}?\n${result.home_team} vs ${result.away_team} — ${result.date}`;
    const explanation = result.explanation
      ?? `The final score was ${result.home_team} ${result.home_score}-${result.away_score} ${result.away_team}. ${result.significance || ''}`;

    return {
      id: crypto.randomUUID(),
      category: 'GUESS_SCORE',
      difficulty: 'EASY',
      points: 1,
      question_text,
      correct_answer,
      fifty_fifty_hint: fifty_hint,
      fifty_fifty_applicable: true,
      explanation,
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
