import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion } from '../question.types';
import { getExplicitConstraintsWithMeta, getAvoidInstruction } from '../diversity-hints';


@Injectable()
export class GossipGenerator {
  private readonly logger = new Logger(GossipGenerator.name);

  constructor(private llmService: LlmService) {}

  async generate(language: string = 'en', options?: { avoidAnswers?: string[]; slotIndex?: number }): Promise<GeneratedQuestion> {
    const langInstruction = language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
    const systemPrompt = `You are a football celebrity gossip expert. Generate a fun football gossip trivia question.
Topics can include: famous transfer sagas, player controversies, WAG stories, celebrity footballer relationships, off-pitch incidents, feuds between players or managers, outrageous quotes, extravagant lifestyles.
Keep it factual (real events) and entertaining.
Return ONLY a valid JSON object with these exact fields:
{
  "question_text": "the question",
  "correct_answer": "the answer (short, 1-5 words)",
  "fifty_fifty_hint": "a plausible but incorrect answer (different from correct_answer), e.g. if correct is 'Neymar' write 'Mbappé'",
  "explanation": "brief explanation (1-2 sentences)",
  "event_year": 2018,
  "competition": "Premier League",
  "fame_score": 6,
  "specificity_score": 2
}
fame_score is 1-10: 10 = tabloid front page that everyone knows, 1 = very obscure gossip.
specificity_score is 1-5: 1 = widely known celebrity story, 3 = specific incident detail, 5 = very niche off-pitch fact.${langInstruction}`;

    const { promptPart, constraints } = getExplicitConstraintsWithMeta('GOSSIP', options?.slotIndex);
    this.logger.log(`[GOSSIP] slotIndex=${options?.slotIndex} constraints=${JSON.stringify(constraints)}`);
    const userPrompt = `Generate a unique football gossip trivia question about a real off-pitch event, controversy, or celebrity moment. Keep it fun and factual. Return JSON only.${promptPart}${getAvoidInstruction(options?.avoidAnswers)}`;

    const result = await this.llmService.generateStructuredJson<{
      question_text: string;
      correct_answer: string;
      fifty_fifty_hint: string;
      explanation: string;
      event_year: number;
      competition: string;
      fame_score: number;
      specificity_score: number;
    }>(systemPrompt, userPrompt);

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
      fifty_fifty_hint: result.fifty_fifty_hint || null,
      fifty_fifty_applicable: true,
      explanation: result.explanation || '',
      image_url: null,
      difficulty_factors: {
        event_year: result.event_year ?? new Date().getFullYear(),
        competition: result.competition ?? 'Premier League',
        fame_score: result.fame_score ?? 5,
        category: 'GOSSIP',
        answer_type: 'name',
        specificity_score: result.specificity_score ?? 2,
      },
    };
  }
}
