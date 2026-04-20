import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion } from '../question.types';
import {
  getExplicitConstraintsWithMeta,
  getAvoidInstruction,
  getAvoidQuestionsInstruction,
  getConceptSteeringInstruction,
  getEntityTargetsInstruction,
  getAntiConvergenceInstruction,
  getCompactQuestionInstruction,
  getSingleAnswerInstruction,
  getRelativityConstraint,
  getLeagueFameGuidanceForBatch,
  getFactualAccuracyInstruction,
} from '../diversity-hints';
import { BaseGenerator, GeneratorOptions, GeneratorBatchOptions } from './base-generator';

interface GossipPayload {
  question_text: string;
  correct_answer: string;
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
export class GossipGenerator extends BaseGenerator {
  constructor(llmService: LlmService) {
    super(llmService);
  }

  async generate(options?: GeneratorOptions): Promise<GeneratedQuestion> {
    const currentYear = new Date().getFullYear();
    const systemPrompt = `You are a football celebrity gossip expert. Generate a fun football gossip trivia question.
Topics can include: famous transfer sagas, player controversies, WAG stories, celebrity footballer relationships, off-pitch incidents, feuds between players or managers, outrageous quotes, extravagant lifestyles.
Keep it factual (real events) and entertaining. IMPORTANT: Only generate questions about events that occurred within the last 2 years (${currentYear - 1}–${currentYear}). Do not reference events older than ${currentYear - 1}.${getSingleAnswerInstruction()}${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}${getFactualAccuracyInstruction()}
Return ONLY a valid JSON object with these exact fields:
{
  "question_text": "the question",
  "correct_answer": "the answer (short, 1-5 words)",
  ${this.getFiftyFiftyHintInstruction('name or short phrase')},${this.wrongChoicesPromptBlock()}
  "explanation": "brief explanation (1-2 sentences)",
  ${this.getSourceUrlInstruction()},
  "event_year": 2023,
  "competition": "Premier League",
  "fame_score": 8,
  "specificity_score": 1,
  "combinational_thinking_score": 2
}
fame_score is 1-10: 10 = tabloid front page that everyone knows, 1 = very obscure gossip.
specificity_score is 1-5: 1 = widely known celebrity story, 3 = specific incident detail, 5 = very niche off-pitch fact.
combinational_thinking_score 1-10: 1 = single fact recall, 5 = combines 2-3 dimensions (person+event+context), 10 = multi-dimensional reasoning.`;

    const { promptPart, constraints } = getExplicitConstraintsWithMeta('GOSSIP', options?.slotIndex, options?.minorityScale);
    this.logConstraints('GOSSIP', options?.slotIndex, constraints);
    const userPrompt = `Generate a unique football gossip trivia question about a real off-pitch event, controversy, or celebrity moment. Return JSON only.${promptPart}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<GossipPayload>(systemPrompt, userPrompt);
    return this.mapQuestion(result);
  }

  async generateBatch(options?: GeneratorBatchOptions): Promise<GeneratedQuestion[]> {
    const questionCount = options?.questionCount ?? 2;
    const currentYear = new Date().getFullYear();
    const systemPrompt = `You are a football celebrity gossip expert. Generate ${questionCount} factual and entertaining football gossip questions.
They should be easy to answer in spirit and rely on recognizable off-pitch stories. IMPORTANT: Only generate questions about events that occurred within the last 2 years (${currentYear - 1}–${currentYear}). Do not reference events older than ${currentYear - 1}.${getSingleAnswerInstruction()}${getAntiConvergenceInstruction()}${getCompactQuestionInstruction()}${getFactualAccuracyInstruction()}
Return ONLY a valid JSON object with a "questions" array. Each item must include question_text, correct_answer, fifty_fifty_hint, wrong_choices (array of 3 plausible wrong answers), explanation, source_url, event_year, competition, fame_score, specificity_score, combinational_thinking_score.
fifty_fifty_hint: Must be the SAME type as correct_answer (e.g. if answer is a person name, hint is another person name). NOT a description.
${getLeagueFameGuidanceForBatch('GOSSIP')}`;
    const userPrompt = `Generate ${questionCount} football gossip questions in one batch. ${getRelativityConstraint('GOSSIP', questionCount)}${getConceptSteeringInstruction(options?.concept)}${getEntityTargetsInstruction(options?.entityTargets)}${getAvoidInstruction(options?.avoidAnswers)}${getAvoidQuestionsInstruction(options?.avoidQuestions)}`;

    const result = await this.llmService.generateStructuredJson<{ questions: GossipPayload[] }>(systemPrompt, userPrompt);
    return this.mapBatchItems(result.questions ?? [], (item) => this.mapQuestion(item));
  }

  private mapQuestion(result: GossipPayload): GeneratedQuestion {
    if (!result.question_text || !result.correct_answer) {
      throw new Error('Invalid LLM response: missing question_text or correct_answer');
    }
    return {
      id: crypto.randomUUID(),
      category: 'GOSSIP',
      difficulty: 'MEDIUM',
      points: 2,
      question_text: result.question_text,
      correct_answer: result.correct_answer,
      wrong_choices: this.extractWrongChoices(result.wrong_choices, result.correct_answer),
      fifty_fifty_hint: result.fifty_fifty_hint || null,
      fifty_fifty_applicable: true,
      explanation: result.explanation || '',
      source_url: typeof result.source_url === 'string' && result.source_url.trim() ? result.source_url.trim() : undefined,
      image_url: null,
      difficulty_factors: {
        event_year: result.event_year ?? new Date().getFullYear(),
        competition: result.competition ?? 'Premier League',
        fame_score: result.fame_score ?? 5,
        category: 'GOSSIP',
        answer_type: 'name',
        specificity_score: result.specificity_score ?? 2,
        combinational_thinking_score: result.combinational_thinking_score,
      },
    };
  }
}
