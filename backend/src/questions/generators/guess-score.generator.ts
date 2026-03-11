import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { FootballApiService } from '../../football-api/football-api.service';
import { GeneratedQuestion, DifficultyFactors } from '../question.types';
import {
  getExplicitConstraintsWithMeta,
  getAvoidInstruction,
  getAntiConvergenceInstruction,
  getCompactQuestionInstruction,
  getRelativityConstraint,
  getLeagueFameGuidanceForBatch,
} from '../diversity-hints';


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

  async generate(language: string = 'en', options?: { avoidAnswers?: string[]; slotIndex?: number; minorityScale?: number }): Promise<GeneratedQuestion> {
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
    const systemPrompt = `You are a football historian. Generate a "Guess the Score" question.
Prefer matches from the last decade (2015 onwards). Exception: very famous matches in football history (iconic World Cup/Euros finals, legendary Champions League comebacks, etc.) may be older.${getAntiConvergenceInstruction('GUESS_SCORE')}${getCompactQuestionInstruction()}
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
  "fame_score": 7,
  "specificity_score": 4,
  "question_text": "Full question sentence shown to the player",
  "explanation": "Brief explanation of the correct answer"
}
fame_score is 1-10: 10 = universally iconic, 7 = well-known match most fans recall, 4 = notable but not top-of-mind, 1 = obscure.
specificity_score is 1-5: Prefer 1-3 (famous finals, widely recallable matches). Avoid 5 (very obscure).${langInstruction}`;

    const { promptPart, constraints } = getExplicitConstraintsWithMeta('GUESS_SCORE', options?.slotIndex, options?.minorityScale);
    this.logger.log(`[GUESS_SCORE] slotIndex=${options?.slotIndex} constraints=${JSON.stringify(constraints)}`);
    const userPrompt = `Generate a unique guess-the-score football question with accurate historical data. Return JSON only.${promptPart}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<MatchData & { specificity_score?: number }>(systemPrompt, userPrompt);

    return this.mapQuestion(result);
  }

  async generateBatch(
    language: string = 'en',
    options?: { avoidAnswers?: string[]; questionCount?: number },
  ): Promise<GeneratedQuestion[]> {
    const questionCount = options?.questionCount ?? 3;
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
    const systemPrompt = `You are a football historian. Generate ${questionCount} "Guess the Score" questions.
Prefer matches from the last decade (2015 onwards). Exception: very famous matches in football history (iconic World Cup/Euros finals, legendary Champions League comebacks, etc.) may be older. Prefer well-known matches so players can recall the score.${getAntiConvergenceInstruction('GUESS_SCORE')}${getCompactQuestionInstruction()}
Return ONLY valid JSON:
{
  "questions": [
    {
      "home_team": "Team Name",
      "away_team": "Team Name",
      "home_score": 3,
      "away_score": 1,
      "competition": "Competition Name",
      "date": "Day Month Year",
      "significance": "brief note about the match",
      "event_year": 2019,
      "fame_score": 7,
      "specificity_score": 3,
      "question_text": "Full question sentence shown to the player",
      "explanation": "Brief explanation of the correct answer"
    }
  ]
}
${getLeagueFameGuidanceForBatch('GUESS_SCORE', language === 'el' ? 'el' : 'en')}${langInstruction}`;
    const userPrompt = `Generate ${questionCount} guess-the-score questions in one batch. ${getRelativityConstraint('GUESS_SCORE', questionCount, language === 'el' ? 'el' : 'en')}${getAvoidInstruction(options?.avoidAnswers)}`;
    const result = await this.llmService.generateStructuredJson<{ questions: Array<MatchData & { specificity_score?: number }> }>(
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

  private mapQuestion(result: MatchData & { specificity_score?: number }): GeneratedQuestion {
    if (!result.home_team || !result.away_team || result.home_score === undefined || result.away_score === undefined) {
      throw new Error('Invalid LLM response: missing team names or scores');
    }

    const correct_answer = `${result.home_score}-${result.away_score}`;
    // Generate a plausible wrong score by shifting one score by ±1. Must differ from correct (e.g. 0-0 → avoid 0-0).
    let wrongHome = result.home_score + (Math.random() < 0.5 ? 1 : -1);
    let wrongAway = wrongHome === result.home_score ? result.away_score + 1 : result.away_score;
    wrongHome = Math.max(0, wrongHome);
    wrongAway = Math.max(0, wrongAway);
    let fifty_hint = `${wrongHome}-${wrongAway}`;
    if (fifty_hint === correct_answer) {
      // 0-0 can produce 0-0; use 1-0 or 0-1 instead
      fifty_hint = result.home_score === 0 && result.away_score === 0 ? '1-0' : `${result.home_score + 1}-${result.away_score}`;
    }

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
