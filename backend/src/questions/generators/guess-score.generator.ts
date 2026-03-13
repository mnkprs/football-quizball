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
  getFactualAccuracyInstruction,
} from '../diversity-hints';
import { BaseGenerator, GeneratorOptions, GeneratorBatchOptions } from './base-generator';

interface MatchPayload {
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  competition: string;
  date: string;
  significance: string;
  event_year: number;
  fame_score: number;
  specificity_score?: number;
  combinational_thinking_score?: number;
  question_text?: string;
  explanation?: string;
}

@Injectable()
export class GuessScoreGenerator extends BaseGenerator {
  constructor(llmService: LlmService) {
    super(llmService);
  }

  async generate(language = 'en', options?: GeneratorOptions): Promise<GeneratedQuestion> {
    const systemPrompt = `You are a football historian. Generate a "Guess the Score" question.
Prefer matches from the last decade (2015 onwards). Exception: very famous matches in football history (iconic World Cup/Euros finals, legendary Champions League comebacks, etc.) may be older.${getSingleAnswerInstruction()}${getAntiConvergenceInstruction('GUESS_SCORE')}${getCompactQuestionInstruction()}${getFactualAccuracyInstruction()}
Return ONLY valid JSON. home_score and away_score must be the EXACT numbers you know — never guess:
{
  "home_team": "Team Name",
  "away_team": "Team Name",
  "home_score": 0,
  "away_score": 0,
  "competition": "Competition Name",
  "date": "Day Month Year",
  "significance": "brief note about the match",
  "event_year": 2022,
  "fame_score": 9,
  "specificity_score": 2,
  "combinational_thinking_score": 2,
  "question_text": "Full question sentence shown to the player",
  "explanation": "Brief explanation of the correct answer"
}
fame_score is 1-10: 10 = universally iconic, 8-9 = well-known match most fans recall. Prefer 8-10 for relevant questions.
specificity_score is 1-5: Prefer 1-2 (famous finals, widely recallable matches). Avoid 4-5 (obscure).
combinational_thinking_score 1-10: 1 = single match recall, 5 = combines teams+competition+context, 10 = multi-dimensional reasoning.
CRITICAL: Do NOT mention the final score (e.g. 7-1, 4-0, 3-0) anywhere in question_text. Describe the match context (teams, competition, significance) without revealing the score. Example: "What was the score when Germany met Brazil in the 2014 World Cup semi-final?" NOT "where Germany defeated Brazil 7-1?".${this.langInstruction(language)}`;

    const { promptPart, constraints } = getExplicitConstraintsWithMeta('GUESS_SCORE', options?.slotIndex, options?.minorityScale);
    this.logConstraints('GUESS_SCORE', options?.slotIndex, constraints);
    const userPrompt = `Generate a guess-the-score question. Only use matches whose exact score you are confident about. Return JSON only.${promptPart}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<MatchPayload>(systemPrompt, userPrompt);
    return this.mapQuestion(result);
  }

  async generateBatch(language = 'en', options?: GeneratorBatchOptions): Promise<GeneratedQuestion[]> {
    const questionCount = options?.questionCount ?? 3;
    const systemPrompt = `You are a football historian. Generate ${questionCount} questions about matches and user need to remember the score.
Prefer matches from the last decade (2015 onwards). Exception: very famous matches in football history (iconic World Cup/Euros finals, legendary Champions League comebacks, etc.) may be older. 
Prefer well-known matches so players can recall the score.${getSingleAnswerInstruction()}${getAntiConvergenceInstruction('GUESS_SCORE')}${getCompactQuestionInstruction()}${getFactualAccuracyInstruction()}
Return ONLY valid JSON. home_score and away_score must be EXACT numbers you know for each match:
{
  "questions": [
    {
      "home_team": "Team Name",
      "away_team": "Team Name",
      "home_score": 0,
      "away_score": 0,
      "competition": "Competition Name",
      "date": "Day Month Year",
      "significance": "brief note about the match",
      "event_year": 2022,
      "fame_score": 9,
      "specificity_score": 2,
      "combinational_thinking_score": 2,
      "question_text": "Full question sentence shown to the player",
      "explanation": "Brief explanation of the correct answer"
    }
  ]
}
${getLeagueFameGuidanceForBatch('GUESS_SCORE', language === 'el' ? 'el' : 'en', options?.targetDifficulty)}
CRITICAL: Do NOT mention the final score (e.g. 7-1, 4-0, 3-0) anywhere in question_text. Describe the match context (teams, competition, significance) without revealing the score. Example: "What was the score when Liverpool hosted Barcelona in the 2019 Champions League semi-final second leg?" NOT "where Liverpool overturned a 3-0 first-leg deficit?".${this.langInstruction(language)}`;
    const userPrompt = `Generate ${questionCount} guess-the-score questions. Only include matches whose exact score you are confident about. ${getRelativityConstraint('GUESS_SCORE', questionCount, language === 'el' ? 'el' : 'en')}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<{ questions: MatchPayload[] }>(systemPrompt, userPrompt);
    return this.mapBatchItems(result.questions ?? [], (item) => this.mapQuestion(item));
  }

  private mapQuestion(result: MatchPayload): GeneratedQuestion {
    if (!result.home_team || !result.away_team || result.home_score === undefined || result.away_score === undefined) {
      throw new Error('Invalid LLM response: missing team names or scores');
    }

    const correct_answer = `${result.home_score}-${result.away_score}`;
    const fifty_fifty_hint = this.buildWrongScore(result.home_score, result.away_score, correct_answer);

    const difficulty_factors: DifficultyFactors = {
      event_year: result.event_year ?? new Date().getFullYear(),
      competition: result.competition ?? 'Unknown',
      fame_score: result.fame_score ?? null,
      category: 'GUESS_SCORE',
      answer_type: 'score',
      specificity_score: result.specificity_score ?? 4,
      combinational_thinking_score: result.combinational_thinking_score,
    };

    return {
      id: crypto.randomUUID(),
      category: 'GUESS_SCORE',
      difficulty: 'EASY',
      points: 1,
      question_text: result.question_text
        ?? `What was the final score in ${result.competition}?\n${result.home_team} vs ${result.away_team} — ${result.date}`,
      correct_answer,
      fifty_fifty_hint,
      fifty_fifty_applicable: true,
      explanation: result.explanation
        ?? `The final score was ${result.home_team} ${result.home_score}-${result.away_score} ${result.away_team}. ${result.significance || ''}`,
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

  /**
   * Generates a plausible wrong score for the 50-50 hint by shifting one score by ±1.
   * Guards against producing the same string as `correct_answer`.
   */
  private buildWrongScore(homeScore: number, awayScore: number, correctAnswer: string): string {
    let wrongHome = homeScore + (Math.random() < 0.5 ? 1 : -1);
    let wrongAway = wrongHome === homeScore ? awayScore + 1 : awayScore;
    wrongHome = Math.max(0, wrongHome);
    wrongAway = Math.max(0, wrongAway);
    const candidate = `${wrongHome}-${wrongAway}`;
    if (candidate === correctAnswer) {
      // 0-0 edge case: shift produces same score; fallback to 1-0
      return homeScore === 0 && awayScore === 0 ? '1-0' : `${homeScore + 1}-${awayScore}`;
    }
    return candidate;
  }
}
