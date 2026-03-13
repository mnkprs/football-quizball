import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion } from '../question.types';
import type { ValidationResult } from '../../common/interfaces/validation.interface';

interface IntegrityCheckPayload {
  valid: boolean;
  reason?: string;
}

/**
 * Verifies factual integrity of generated questions using the LLM's knowledge.
 * When enabled, the LLM checks if the answer appears correct before accepting the question.
 */
@Injectable()
export class QuestionIntegrityService {
  private readonly logger = new Logger(QuestionIntegrityService.name);
  private readonly enabled: boolean;

  constructor(
    private configService: ConfigService,
    private llmService: LlmService,
  ) {
    this.enabled =
      this.configService.get<string>('ENABLE_INTEGRITY_VERIFICATION') === 'true' ||
      this.configService.get<string>('ENABLE_INTEGRITY_VERIFICATION') === '1';
    if (this.enabled) {
      this.logger.log('QuestionIntegrityService enabled — factual verification via LLM');
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Verifies that the question and answer are factually correct.
   * Uses LLM knowledge. Returns valid: true if verified, false if contradicted or uncertain.
   */
  async verify(question: GeneratedQuestion): Promise<ValidationResult> {
    if (!this.enabled) {
      return { valid: true };
    }

    const context = this.buildVerificationContext(question);
    const systemPrompt = `You are a fact-checker for football trivia. Given a question and answer, verify using your knowledge if the answer is factually correct.
Return ONLY a JSON object: { "valid": boolean, "reason"?: string }
- valid: true if the answer is correct and you are confident
- valid: false if the answer is wrong, outdated, or contradicted by what you know. Set "reason" to a brief explanation.
Be strict: if you cannot verify or have doubts, return valid: false.`;

    const userPrompt = `Verify this trivia:\n\nQuestion: ${question.question_text}\nAnswer: ${question.correct_answer}${context}\n\nReturn JSON only.`;

    try {
      const result = await this.llmService.generateStructuredJsonWithWebSearch<IntegrityCheckPayload>(
        systemPrompt,
        userPrompt,
        { useWebSearch: true, maxRetries: 1 },
      );

      if (result.valid) {
        this.logger.debug(`[integrity] Verified: ${question.category} — ${question.correct_answer}`);
        return { valid: true };
      }

      const reason = result.reason ?? 'Factual verification failed';
      this.logger.log(`[integrity] Rejected: ${reason}`);
      return { valid: false, reason };
    } catch (err) {
      this.logger.warn(`[integrity] Verification failed (using question): ${(err as Error).message}`);
      return { valid: true };
    }
  }

  private buildVerificationContext(question: GeneratedQuestion): string {
    const parts: string[] = [];

    if (question.category === 'PLAYER_ID' && question.meta?.career) {
      const career = question.meta.career as Array<{ club: string; from: string; to: string }>;
      parts.push(`Career path: ${career.map((c) => `${c.club} (${c.from}–${c.to})`).join(' → ')}`);
    }

    if (question.category === 'GUESS_SCORE' && question.meta) {
      const m = question.meta as { home_team?: string; away_team?: string; date?: string; competition?: string };
      if (m.home_team || m.away_team) {
        parts.push(`Match: ${m.home_team} vs ${m.away_team}${m.date ? ` (${m.date})` : ''}${m.competition ? ` — ${m.competition}` : ''}`);
      }
      parts.push(`Claimed score: ${question.correct_answer}`);
    }

    if (question.category === 'HIGHER_OR_LOWER' && question.meta) {
      const m = question.meta as { player?: string; shown_value?: number; real_value?: number; competition?: string; season?: string };
      if (m.player) {
        parts.push(`Player: ${m.player}, shown_value: ${m.shown_value}, real_value: ${m.real_value}${m.season ? ` (${m.season})` : ''}${m.competition ? ` — ${m.competition}` : ''}`);
      }
    }

    if (question.category === 'TOP_5' && question.meta?.top5) {
      const top5 = question.meta.top5 as Array<{ name: string; stat: string }>;
      parts.push(`Top 5 claimed: ${top5.map((e, i) => `${i + 1}. ${e.name} (${e.stat})`).join(', ')}`);
    }

    if (question.difficulty_factors?.competition) {
      parts.push(`Competition/context: ${question.difficulty_factors.competition}`);
    }

    if (question.explanation) {
      parts.push(`Explanation: ${question.explanation}`);
    }

    return parts.length ? `\n\nAdditional context:\n${parts.join('\n')}` : '';
  }
}
