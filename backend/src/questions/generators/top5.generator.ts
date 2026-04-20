import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion, Top5Entry, DifficultyFactors } from '../question.types';
import {
  getExplicitConstraintsWithMeta,
  getAvoidInstruction,
  getAvoidQuestionsInstruction,
  getConceptSteeringInstruction,
  getEntityTargetsInstruction,
  getAntiConvergenceInstruction,
  getCompactQuestionInstruction,
  getRelativityConstraint,
  getLeagueFameGuidanceForBatch,
  getFactualAccuracyInstruction,
} from '../diversity-hints';
import { BaseGenerator, GeneratorOptions, GeneratorBatchOptions } from './base-generator';

interface Top5Payload {
  question_text: string;
  top5: Top5Entry[];
  source_url?: string;
  competition: string;
  event_year: number;
  fame_score: number;
  specificity_score?: number;
  combinational_thinking_score?: number;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Returns true if any answer name appears verbatim inside the question text — a cheat indicator. */
function leaksTop5Answer(questionText: string, top5: Top5Entry[]): boolean {
  const normalizedQuestion = ` ${normalizeText(questionText)} `;
  return top5.some((entry) => {
    const normalizedName = normalizeText(entry.name);
    return normalizedName.length >= 3 && normalizedQuestion.includes(` ${normalizedName} `);
  });
}

@Injectable()
export class Top5Generator extends BaseGenerator {
  constructor(llmService: LlmService) {
    super(llmService);
  }

  async generate(options?: GeneratorOptions): Promise<GeneratedQuestion> {
    const systemPrompt = `You are a football statistics expert. Generate a "Name the Top 5" football quiz question.
Pick any interesting football top-5 ranking — all-time records, season stats, trophies, transfers, caps, etc. from any league or era.${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}${getFactualAccuracyInstruction()}
Return ONLY valid JSON:
{
  "question_text": "Name the top 5 ...",
  "top5": [
    {"name": "Player or Club Name", "stat": "e.g. 260 goals"},
    {"name": "...", "stat": "..."},
    {"name": "...", "stat": "..."},
    {"name": "...", "stat": "..."},
    {"name": "...", "stat": "..."}
  ],
  "source_url": "URL to verify the top 5 ranking (e.g. Transfermarkt, official stats)",
  "competition": "Competition or league name",
  "event_year": 2024,
  "fame_score": 7,
  "specificity_score": 3,
  "combinational_thinking_score": 7
}
The top5 array must have exactly 5 entries ordered from 1st to 5th place.
combinational_thinking_score 1-10: 1 = iconic all-time list everyone knows, 5 = combines league+season+stat type, 10 = obscure multi-criteria ranking requiring reasoning across many facts.
All data must be factually accurate. Do not mention any of the 5 answer names anywhere in question_text.
fame_score is 1-10: 10 = universally iconic ranking everyone knows, 1 = very obscure niche stat.
specificity_score is 1-5: 1 = all-time list everyone can name, 3 = specific season/competition ranking, 5 = very obscure sub-statistic ranking.`;

    const { promptPart, constraints } = getExplicitConstraintsWithMeta('TOP_5', options?.slotIndex, options?.minorityScale);
    this.logConstraints('TOP_5', options?.slotIndex, constraints);
    const userPrompt = `Generate a unique and interesting "Name the Top 5" football question. Return JSON only.${promptPart}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<Top5Payload>(systemPrompt, userPrompt);
    return this.mapQuestion(result);
  }

  async generateBatch(options?: GeneratorBatchOptions): Promise<GeneratedQuestion[]> {
    const questionCount = options?.questionCount ?? 2;
    const systemPrompt = `You are a football statistics expert. Generate ${questionCount} "Name the Top 5" football quiz questions.
These questions are hard by nature, but they must still be findable because the competition context is familiar.${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}${getFactualAccuracyInstruction()}
Return ONLY valid JSON:
{
  "questions": [
    {
      "question_text": "Name the top 5 ...",
      "top5": [
        {"name": "Player or Club Name", "stat": "e.g. 260 goals"},
        {"name": "...", "stat": "..."},
        {"name": "...", "stat": "..."},
        {"name": "...", "stat": "..."},
        {"name": "...", "stat": "..."}
      ],
      "source_url": "URL to verify the top 5 ranking",
      "competition": "Competition or league name",
      "event_year": 2024,
      "fame_score": 5,
      "specificity_score": 10,
      "combinational_thinking_score": 7
    }
  ]
}
Do not mention any answer name from the top5 array anywhere in question_text.
${getLeagueFameGuidanceForBatch('TOP_5')}`;
    const userPrompt = `Generate ${questionCount} Top 5 questions in one batch. ${getRelativityConstraint('TOP_5', questionCount)}${getConceptSteeringInstruction(options?.concept)}${getEntityTargetsInstruction(options?.entityTargets)}${getAvoidInstruction(options?.avoidAnswers)}${getAvoidQuestionsInstruction(options?.avoidQuestions)}`;

    const result = await this.llmService.generateStructuredJson<{ questions: Top5Payload[] }>(systemPrompt, userPrompt);
    return this.mapBatchItems(result.questions ?? [], (item) => this.mapQuestion(item));
  }

  private mapQuestion(result: Top5Payload): GeneratedQuestion {
    if (!result.question_text || !result.top5 || result.top5.length !== 5) {
      throw new Error('Invalid LLM response: missing question_text or top5 array of 5');
    }
    if (leaksTop5Answer(result.question_text, result.top5)) {
      throw new Error('Invalid LLM response: question_text leaks a top5 answer');
    }

    const top5 = this.sortTop5ByStatValue(result.top5);

    const difficulty_factors: DifficultyFactors = {
      event_year: result.event_year ?? new Date().getFullYear(),
      competition: result.competition ?? 'Unknown',
      fame_score: result.fame_score ?? null,
      category: 'TOP_5',
      answer_type: 'name',
      specificity_score: result.specificity_score ?? 10,
      combinational_thinking_score: result.combinational_thinking_score,
    };

    return {
      id: crypto.randomUUID(),
      category: 'TOP_5',
      difficulty: 'EASY',
      points: 1,
      question_text: result.question_text,
      correct_answer: top5.map((e) => e.name).join(', '),
      fifty_fifty_hint: null,
      fifty_fifty_applicable: false,
      explanation: `The answers were: ${top5.map((e, i) => `${i + 1}. ${e.name} (${e.stat})`).join(', ')}`,
      source_url: typeof result.source_url === 'string' && result.source_url.trim() ? result.source_url.trim() : undefined,
      image_url: null,
      meta: { top5 },
      difficulty_factors,
    };
  }

  /** Extracts the leading numeric value from a stat string (e.g. "3085 points" → 3085). */
  private extractStatNumber(stat: string): number | null {
    const match = stat.replace(/,/g, '').match(/^[\d]+(?:\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }

  /**
   * Sorts top5 entries in descending order by their numeric stat value.
   * If any entry lacks a numeric stat, the original LLM order is preserved.
   */
  private sortTop5ByStatValue(top5: Top5Entry[]): Top5Entry[] {
    const numbers = top5.map((e) => this.extractStatNumber(e.stat));
    if (numbers.some((n) => n === null)) return top5;
    return [...top5].sort((a, b) => this.extractStatNumber(b.stat)! - this.extractStatNumber(a.stat)!);
  }
}
