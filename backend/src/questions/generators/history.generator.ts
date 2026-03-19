import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion } from '../question.types';
import {
  getExplicitConstraintsWithMeta,
  getAvoidInstruction,
  getAvoidQuestionsInstruction,
  getAntiConvergenceInstruction,
  getCompactQuestionInstruction,
  getSingleAnswerInstruction,
  getRelativityConstraint,
  getLeagueFameGuidanceForBatch,
  getFactualAccuracyInstruction,
} from '../diversity-hints';
import { BaseGenerator, GeneratorOptions, GeneratorBatchOptions } from './base-generator';

interface HistoryPayload {
  question_text: string;
  correct_answer: string;
  answer_type: string;
  fifty_fifty_hint: string;
  wrong_choices?: string[];
  explanation: string;
  source_url?: string;
  event_year: number;
  competition: string;
  fame_score: number;
  specificity_score: number;
  combinational_thinking_score?: number;
}

@Injectable()
export class HistoryGenerator extends BaseGenerator {
  constructor(llmService: LlmService) {
    super(llmService);
  }

  async generate(language = 'en', options?: GeneratorOptions): Promise<GeneratedQuestion> {
    const systemPrompt = `You are a football trivia expert. Generate an interesting football history question on any topic.
Topics can include: World Cup history, club history, famous matches, records, trophies, historic moments.
Seek variety — avoid defaulting to the same iconic moments and players every time. Football history spans 150+ years and hundreds of countries; explore beyond the most-cited events.${getSingleAnswerInstruction()}${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}${getFactualAccuracyInstruction()}
CRITICAL: Do NOT mention the correct_answer anywhere in question_text. The question must not give away the answer.
Return ONLY a valid JSON object with these exact fields:
{
  "question_text": "the question",
  "correct_answer": "the answer (short, 1-5 words)",
  "answer_type": "name",
  ${this.getFiftyFiftyHintInstruction('name or short phrase matching answer_type')},${this.wrongChoicesPromptBlock(options?.forBlitz ?? false)}
  "explanation": "brief explanation of why this is correct (1-2 sentences)",
  ${this.getSourceUrlInstruction()},
  "event_year": 2022,
  "competition": "Competition or league name e.g. FIFA World Cup, Premier League, UEFA Champions League",
  "fame_score": 9,
  "specificity_score": 2,
  "combinational_thinking_score": 2
}
fame_score is 1-10: 10 = universally iconic like Zidane headbutt, 1 = hyper-niche fact.
combinational_thinking_score 1-10: 1 = single fact recall ("Who won X?"), 5 = combines 2-3 dimensions (league+season+event), 10 = multi-dimensional reasoning across many facts.
answer_type: Short description of what the question asks for (e.g. country, team, player name, year, score, shirt number, number of assists, stadium). Use lowercase, 1-3 words.
specificity_score is 1-5: 1 = general knowledge ("Who won the 2022 World Cup?"), 3 = moderate (specific match/season detail), 5 = very specific (exact shirt number or obscure stat).${this.langInstruction(language)}`;

    const { promptPart, constraints } = getExplicitConstraintsWithMeta('HISTORY', options?.slotIndex, options?.minorityScale);
    this.logConstraints('HISTORY', options?.slotIndex, constraints);
    const userPrompt = `Generate a unique football history trivia question. Return JSON only.${promptPart}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<HistoryPayload>(systemPrompt, userPrompt);
    return this.mapQuestion(result, options?.forBlitz);
  }

  async generateBatch(language = 'en', options?: GeneratorBatchOptions): Promise<GeneratedQuestion[]> {
    const questionCount = options?.questionCount ?? 3;
    const systemPrompt = `You are a football trivia expert. Generate ${questionCount} interesting football history questions on real events.
The questions must be factual, answerable, and clearly distinct. Seek variety across eras, competitions, and types of events — football history spans 150+ years and hundreds of countries; avoid always returning to the same iconic moments.${getSingleAnswerInstruction()}${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}${getFactualAccuracyInstruction()}
CRITICAL: Do NOT mention the correct_answer anywhere in question_text. The question must not give away the answer.
Return ONLY a valid JSON object:
{
  "questions": [
    {
      "question_text": "the question",
      "correct_answer": "the answer",
      "answer_type": "player name",
      "fifty_fifty_hint": "another player name (wrong answer, same format as correct_answer — NOT a description like 'Italian defender')",
      "explanation": "brief explanation",
      "source_url": "URL to verify the answer",
      "event_year": 2022,
      "competition": "UEFA Champions League",
      "fame_score": 9,
      "specificity_score": 2,
      "combinational_thinking_score": 2
    }
  ]
}
${getLeagueFameGuidanceForBatch('HISTORY', language === 'el' ? 'el' : 'en', options?.targetDifficulty)}${this.langInstruction(language)}`;
    const userPrompt = `Generate ${questionCount} football history questions in one batch. ${getRelativityConstraint('HISTORY', questionCount, language === 'el' ? 'el' : 'en')}${getAvoidInstruction(options?.avoidAnswers)}${getAvoidQuestionsInstruction(options?.avoidQuestions)}`;

    const result = await this.llmService.generateStructuredJson<{ questions: HistoryPayload[] }>(systemPrompt, userPrompt);
    return this.mapBatchItems(result.questions ?? [], (item) => this.mapQuestion(item, false));
  }

  private mapQuestion(result: HistoryPayload, forBlitz = false): GeneratedQuestion {
    if (!result.question_text || !result.correct_answer) {
      throw new Error('Invalid LLM response: missing question_text or correct_answer');
    }
    return {
      id: crypto.randomUUID(),
      category: 'HISTORY',
      difficulty: 'EASY',
      points: 1,
      question_text: result.question_text,
      correct_answer: result.correct_answer,
      wrong_choices: this.extractWrongChoices(forBlitz, result.wrong_choices, result.correct_answer),
      fifty_fifty_hint: result.fifty_fifty_hint || null,
      fifty_fifty_applicable: true,
      explanation: result.explanation || '',
      source_url: typeof result.source_url === 'string' && result.source_url.trim() ? result.source_url.trim() : undefined,
      image_url: null,
      difficulty_factors: {
        event_year: result.event_year ?? new Date().getFullYear(),
        competition: result.competition ?? 'Unknown',
        fame_score: result.fame_score ?? null,
        category: 'HISTORY',
        answer_type: (result.answer_type as any) ?? 'name',
        specificity_score: result.specificity_score ?? 3,
        combinational_thinking_score: result.combinational_thinking_score,
      },
    };
  }
}
