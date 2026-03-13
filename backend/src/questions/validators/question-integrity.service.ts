import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion } from '../question.types';
import type { ValidationResult } from '../../common/interfaces/validation.interface';

interface IntegrityCheckPayload {
  valid: boolean;
  reason?: string;
  correctedAnswer?: string;
  correctedTop5?: Array<{ name: string; stat: string }>;
  correctedQuestionText?: string;
  correctedExplanation?: string;
  correctedMeta?: Record<string, unknown>;
}

/**
 * Verifies factual integrity of generated questions.
 * Uses Gemini with Google Search grounding for factual verification (GUESS_SCORE, etc.).
 * Fails closed: rejects on verification error (does not accept when uncertain).
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
   * Fails closed: rejects on verification error (does not accept when uncertain).
   */
  async verify(question: GeneratedQuestion): Promise<ValidationResult> {
    if (!this.enabled) {
      return { valid: true };
    }

    const context = this.buildVerificationContext(question);
    const systemPrompt = `You are a fact-checker for football trivia. Given a question and answer, verify if the question context is real and if the answer is correct.

VERIFICATION SOURCES — You MUST use Google Search to look up facts. Prioritize and cross-check against these highly accurate, validated football data sources:
- Wikipedia (en.wikipedia.org) — comprehensive, well-sourced football articles
- Transfermarkt (transfermarkt.com) — player careers, transfers, club history, match results
- FBref (fbref.com) — detailed stats, league tables, match data
- Official club/league websites and UEFA/FIFA when relevant
When these sources conflict with the given data, trust them and provide corrections.

CRITICAL: You MUST respond with ONLY a valid JSON object. No markdown, no code blocks, no explanation, no other text.
Optional correction fields (include ONLY fields that need fixing):
{ "valid": boolean, "reason"?: string, "correctedAnswer"?: string, "correctedTop5"?: [{ "name": string, "stat": string }], "correctedQuestionText"?: string, "correctedExplanation"?: string, "correctedMeta"?: object }

MOST IMPORTANT — When the QUESTION is valid (asks about something real) but some data is wrong:
  → Return valid: true and provide corrections for ANY wrong field. We will FIX and SAVE the question.
  → correctedAnswer: when the answer is wrong (e.g. "3-2" → "2-1", "Geoff Hurst" → correct name).
  → correctedTop5: for TOP_5, array of 5 { "name", "stat" } when the list is wrong.
  → correctedQuestionText: when the question text has wrong info (e.g. wrong date "17 March 2024" → "10 March 2024", wrong teams, wrong competition).
  → correctedExplanation: when the explanation has wrong facts (e.g. wrong score, wrong teams, wrong context).
  → correctedMeta: partial object with only fields to fix. Examples:
    - GUESS_SCORE: { "home_team": "...", "away_team": "...", "date": "...", "competition": "..." } when match details are wrong
    - PLAYER_ID: { "career": [{ "club": "...", "from": "YYYY", "to": "YYYY" }] } when career path is wrong
    - HIGHER_OR_LOWER: { "player": "...", "real_value": N, "season": "..." } when stat/player is wrong
  → Do NOT reject (valid: false) when only the answer or context is wrong. Fix it instead.

REJECT (valid: false) ONLY when the QUESTION itself is invalid:
- The question is hallucinated: non-existent event, made-up match, wrong context.
- For PLAYER_ID: the career path is incomplete (missing early clubs) or has wrong clubs/dates. Search for the player's full career and verify each club and date. Reject if any club is missing or dates are wrong.
Set "reason" to explain.

ACCEPT (valid: true, no correction) when both question and answer are correct.`;

    const userPrompt = `Verify this trivia from sources with highly accurate, integrated, and validated football (soccer) data. Search Wikipedia, Transfermarkt, or FBref to confirm the answer is factually correct.\n\nQuestion: ${question.question_text}\nAnswer: ${question.correct_answer}${context}\n\nRespond with ONLY the JSON object, nothing else. `;

    try {
      const result = await this.llmService.generateStructuredJsonWithWebSearch<IntegrityCheckPayload>(
        systemPrompt,
        userPrompt,
        { useWebSearch: true, maxRetries: 1 },
      );

      if (result.valid) {
        const hasAnswerCorrection =
          (result.correctedAnswer && result.correctedAnswer.trim() !== question.correct_answer?.trim()) ||
          (result.correctedTop5 && question.category === 'TOP_5' && result.correctedTop5.length === 5);
        const hasTextCorrection = result.correctedQuestionText?.trim() && result.correctedQuestionText.trim() !== question.question_text?.trim();
        const hasExplanationCorrection = result.correctedExplanation?.trim() && result.correctedExplanation.trim() !== question.explanation?.trim();
        const hasMetaCorrection = result.correctedMeta && Object.keys(result.correctedMeta).length > 0;

        if (hasAnswerCorrection || hasTextCorrection || hasExplanationCorrection || hasMetaCorrection) {
          const correctedAnswer = result.correctedTop5 && question.category === 'TOP_5' && result.correctedTop5.length === 5
            ? result.correctedTop5.map((e) => e.name).join(', ')
            : result.correctedAnswer?.trim();
          this.logger.log(
            `[integrity] Corrections: ${hasAnswerCorrection ? `answer→${correctedAnswer}` : ''} ${hasTextCorrection ? 'question_text' : ''} ${hasExplanationCorrection ? 'explanation' : ''} ${hasMetaCorrection ? 'meta' : ''}`,
          );
          return {
            valid: true,
            ...(correctedAnswer && { correctedAnswer }),
            ...(result.correctedTop5 && question.category === 'TOP_5' && { correctedTop5: result.correctedTop5 }),
            ...(hasTextCorrection && { correctedQuestionText: result.correctedQuestionText!.trim() }),
            ...(hasExplanationCorrection && { correctedExplanation: result.correctedExplanation!.trim() }),
            ...(hasMetaCorrection && { correctedMeta: result.correctedMeta }),
          };
        }
        this.logger.debug(`[integrity] Verified: ${question.category} — ${question.correct_answer}`);
        return { valid: true };
      }

      const reason = result.reason ?? 'Factual verification failed';
      this.logger.log(`[integrity] Rejected: ${reason}`);
      return { valid: false, reason };
    } catch (err) {
      this.logger.warn(`[integrity] Verification failed (rejecting): ${(err as Error).message}`);
      return { valid: false, reason: `Verification error: ${(err as Error).message}` };
    }
  }

  private buildVerificationContext(question: GeneratedQuestion): string {
    const parts: string[] = [];

    if (question.category === 'PLAYER_ID' && question.meta?.career) {
      const career = question.meta.career as Array<{ club: string; from: string; to: string }>;
      parts.push(`Career path (must be complete from first club): ${career.map((c) => `${c.club} (${c.from}–${c.to})`).join(' → ')}`);
      if (question.source_url) parts.push(`Source URL: ${question.source_url}`);
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
