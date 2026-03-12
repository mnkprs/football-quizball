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

interface CareerEntry {
  club: string;
  from: string;
  to: string;
  is_loan?: boolean;
}

interface PlayerIdPayload {
  player_name: string;
  career: CareerEntry[];
  nationality: string;
  position: string;
  wrong_player_name: string;
  wrong_choices?: string[];
  image_url: string | null;
  competition: string;
  event_year: number;
  fame_score: number;
  specificity_score?: number;
  combinational_thinking_score?: number;
  question_text?: string;
  explanation?: string;
}

@Injectable()
export class PlayerIdGenerator extends BaseGenerator {
  constructor(llmService: LlmService) {
    super(llmService);
  }

  async generate(language = 'en', options?: GeneratorOptions): Promise<GeneratedQuestion> {
    const systemPrompt = `You are a football expert. Generate a "Guess the Player" question where the player's career clubs are shown.
Pick any interesting footballer — legendary, retired, or current, from any era or league.${getSingleAnswerInstruction()}${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}
Return ONLY a valid JSON object with these exact fields:
{
  "player_name": "Full Name",
  "career": [{"club": "Club Name", "from": "YYYY", "to": "YYYY or Present", "is_loan": false}],
  "nationality": "Nationality",
  "position": "Position",
  "wrong_player_name": "A different real player who played in a similar era/league (decoy for 50-50)",${this.wrongChoicesPromptBlock(options?.forBlitz ?? false, 'player')}
  "image_url": null,
  "competition": "most notable league/competition where this player was famous e.g. Premier League",
  "event_year": 2022,
  "fame_score": 9,
  "specificity_score": 2,
  "combinational_thinking_score": 2,
  "question_text": "Question prompt shown to the player",
  "explanation": "Brief explanation naming the player and career summary"
}
The career array must have at least 3 entries.
combinational_thinking_score 1-10: 1 = single fact (iconic player with unique path), 5 = combines career path + era + league, 10 = multi-dimensional reasoning across many clubs/eras. All career data must be factually accurate.
Set "is_loan": true for any spell where the player was on loan, otherwise false.
fame_score is 1-10: 10 = universally iconic (Messi/Ronaldo level), 1 = hyper-niche player.
specificity_score is 1-5: 1 = iconic player with unique club path, 3 = known player but career path not top-of-mind, 5 = obscure player few would recognize.${this.langInstruction(language)}`;

    const { promptPart, constraints } = getExplicitConstraintsWithMeta('PLAYER_ID', options?.slotIndex, options?.minorityScale);
    this.logConstraints('PLAYER_ID', options?.slotIndex, constraints);
    const userPrompt = `Generate a unique "guess the player" challenge with accurate career history. Return JSON only.${promptPart}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<PlayerIdPayload>(systemPrompt, userPrompt);
    return this.mapQuestion(result, options?.forBlitz);
  }

  async generateBatch(language = 'en', options?: GeneratorBatchOptions): Promise<GeneratedQuestion[]> {
    const questionCount = options?.questionCount ?? 2;
    const systemPrompt = `You are a football expert. Generate ${questionCount} "Guess the Player" questions where each player is identified by a factual career path.${getSingleAnswerInstruction()}${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}
Return ONLY a valid JSON object with a "questions" array. Each question must include:
{
  "player_name": "Full Name",
  "career": [{"club": "Club Name", "from": "YYYY", "to": "YYYY or Present", "is_loan": false}],
  "nationality": "Nationality",
  "position": "Position",
  "wrong_player_name": "A plausible wrong player",
  "image_url": null,
  "competition": "most notable competition",
  "event_year": 2022,
  "fame_score": 8,
  "specificity_score": 2,
  "combinational_thinking_score": 2,
  "question_text": "Prompt",
  "explanation": "Short explanation"
}
Set "is_loan": true for any loan spell in the career path, otherwise false.
${getLeagueFameGuidanceForBatch('PLAYER_ID', language === 'el' ? 'el' : 'en')}${this.langInstruction(language)}`;
    const userPrompt = `Generate ${questionCount} player-id questions in one batch. ${getRelativityConstraint('PLAYER_ID', questionCount, language === 'el' ? 'el' : 'en')}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<{ questions: PlayerIdPayload[] }>(systemPrompt, userPrompt);
    return this.mapBatchItems(result.questions ?? [], (item) => this.mapQuestion(item, false));
  }

  private mapQuestion(result: PlayerIdPayload, forBlitz = false): GeneratedQuestion {
    if (!result.player_name || !result.career?.length) {
      throw new Error('Invalid LLM response: missing player_name or career');
    }

    const careerText = result.career
      .map((c) => `${c.club}${c.is_loan ? ' [Loan]' : ''} (${c.from}–${c.to})`)
      .join(' → ');

    return {
      id: crypto.randomUUID(),
      category: 'PLAYER_ID',
      difficulty: 'EASY',
      points: 1,
      question_text: result.question_text ?? 'Identify the player from their career path:',
      correct_answer: result.player_name,
      wrong_choices: this.extractWrongChoices(forBlitz, result.wrong_choices, result.player_name),
      fifty_fifty_hint: result.wrong_player_name || null,
      fifty_fifty_applicable: true,
      explanation: result.explanation ?? `The player is ${result.player_name}. Career: ${careerText}`,
      image_url: result.image_url,
      meta: { career: result.career, nationality: result.nationality, position: result.position },
      difficulty_factors: {
        event_year: result.event_year ?? new Date().getFullYear(),
        competition: result.competition ?? 'Unknown',
        fame_score: result.fame_score ?? null,
        category: 'PLAYER_ID',
        answer_type: 'name',
        specificity_score: result.specificity_score ?? 3,
        combinational_thinking_score: result.combinational_thinking_score,
      },
    };
  }
}
