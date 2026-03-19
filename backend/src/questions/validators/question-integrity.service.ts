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
    - GUESS_SCORE: when the score or match details are wrong, include ALL of: { "home_team": "...", "away_team": "...", "home_score": N, "away_score": N, "date": "...", "competition": "..." }. The correct_answer (X-Y format) must match home_score-away_score. ALWAYS also provide correctedQuestionText and correctedExplanation when fixing a GUESS_SCORE — they typically contain the wrong score/teams and must be updated to match the corrected data.
    - PLAYER_ID: ALWAYS search Transfermarkt or Wikipedia for the player's CURRENT club and full career. The question generator may have stale training data — web search is the source of truth. If the career array is outdated (e.g. last entry shows "Real Madrid" but player now plays for "AC Milan") OR incomplete (missing early clubs, wrong dates), return { "career": [{ "club": "...", "from": "YYYY", "to": "YYYY or Present" }] } with the complete, up-to-date career.
    - HIGHER_OR_LOWER: { "player": "...", "real_value": N, "season": "..." } when stat/player is wrong
  → Do NOT reject (valid: false) when only the answer or context is wrong. Fix it instead.

REJECT (valid: false) ONLY when the QUESTION itself is invalid:
- The question is hallucinated: non-existent event, made-up match, wrong context.
- For PLAYER_ID: the career has fundamentally wrong/hallucinated clubs (clubs the player never played for, or the player doesn't exist).
  IMPORTANT: Do NOT reject for an outdated career (e.g. player transferred since the question was generated). Instead return correctedMeta with the complete, up-to-date career array including any new clubs.
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
        let correctedAnswer: string | undefined =
          result.correctedTop5 && question.category === 'TOP_5' && result.correctedTop5.length === 5
            ? result.correctedTop5.map((e) => e.name).join(', ')
            : result.correctedAnswer?.trim();

        // GUESS_SCORE: derive correctedAnswer from correctedMeta when meta has home_score/away_score
        let finalCorrectedMeta: Record<string, unknown> | undefined = result.correctedMeta;
        if (question.category === 'GUESS_SCORE' && result.correctedMeta) {
          const home = result.correctedMeta.home_score;
          const away = result.correctedMeta.away_score;
          if (typeof home === 'number' && typeof away === 'number') {
            correctedAnswer = `${home}-${away}`;
          }
        }
        // GUESS_SCORE: when correctedAnswer is "X-Y" but meta lacks home_score/away_score, add them for consistency
        if (question.category === 'GUESS_SCORE' && correctedAnswer && /^\d{1,2}-\d{1,2}$/.test(correctedAnswer)) {
          const [h, a] = correctedAnswer.split('-').map(Number);
          const needsScores =
            !finalCorrectedMeta ||
            finalCorrectedMeta.home_score === undefined ||
            finalCorrectedMeta.away_score === undefined;
          if (needsScores) {
            finalCorrectedMeta = { ...(finalCorrectedMeta ?? {}), home_score: h, away_score: a };
          }
        }

        // GUESS_SCORE: reject empty correctedAnswer — never "fix" to empty
        if (question.category === 'GUESS_SCORE' && correctedAnswer === '') {
          this.logger.log(
            `[integrity] Rejected: GUESS_SCORE correction would set empty answer. Provide correct score or reject.`,
          );
          return { valid: false, reason: 'Correction would set empty answer; provide correct score or reject' };
        }

        const hasAnswerCorrection =
          (correctedAnswer && correctedAnswer !== question.correct_answer?.trim()) ||
          (result.correctedTop5 && question.category === 'TOP_5' && result.correctedTop5.length === 5);
        const hasTextCorrection = result.correctedQuestionText?.trim() && result.correctedQuestionText.trim() !== question.question_text?.trim();
        const hasExplanationCorrection = result.correctedExplanation?.trim() && result.correctedExplanation.trim() !== question.explanation?.trim();
        const hasMetaCorrection = finalCorrectedMeta && Object.keys(finalCorrectedMeta).length > 0;

        if (hasAnswerCorrection || hasTextCorrection || hasExplanationCorrection || hasMetaCorrection) {
          this.logger.log(
            `[integrity] Corrections: ${hasAnswerCorrection ? `answer→${correctedAnswer}` : ''} ${hasTextCorrection ? 'question_text' : ''} ${hasExplanationCorrection ? 'explanation' : ''} ${hasMetaCorrection ? 'meta' : ''}`,
          );
          return {
            valid: true,
            ...(correctedAnswer && { correctedAnswer }),
            ...(result.correctedTop5 && question.category === 'TOP_5' && { correctedTop5: result.correctedTop5 }),
            ...(hasTextCorrection && { correctedQuestionText: result.correctedQuestionText!.trim() }),
            ...(hasExplanationCorrection && { correctedExplanation: result.correctedExplanation!.trim() }),
            ...(hasMetaCorrection && { correctedMeta: finalCorrectedMeta }),
          };
        }
        this.logger.debug(`[integrity] Verified: ${question.category} — ${question.correct_answer}`);
        return { valid: true };
      }

      const reason = result.reason ?? 'Factual verification failed';
      this.logger.log(`[integrity] Rejected: ${reason}`);
      return { valid: false, reason };
    } catch (err) {
      const rawResponse = (err as Error & { rawResponse?: string }).rawResponse;
      if (rawResponse && this.looksLikeValidProse(rawResponse)) {
        this.logger.debug(
          `[integrity] LLM returned prose instead of JSON but indicated valid — accepting (${question.category})`,
        );
        return { valid: true };
      }
      this.logger.warn(`[integrity] Verification failed (rejecting): ${(err as Error).message}`);
      return { valid: false, reason: `Verification error: ${(err as Error).message}` };
    }
  }

  /**
   * When Gemini returns prose instead of JSON (common with Google Search), try to infer validity.
   * Only accepts when text clearly states the question/answer are correct; rejects on any doubt.
   */
  private looksLikeValidProse(text: string): boolean {
    const lower = text.toLowerCase().trim();
    // Reject if we see clear negative indicators
    const negativePhrases = [
      'incorrect',
      'wrong',
      'invalid',
      'hallucinated',
      'made-up',
      'does not exist',
      'cannot verify',
      'cannot confirm',
      'unable to verify',
      'reject',
      'rejected',
    ];
    if (negativePhrases.some((p) => lower.includes(p))) return false;
    // Accept only when text explicitly states correctness (Gemini often returns prose with web search)
    const validPhrases = [
      'the trivia question and answer are correct',
      'the question and answer are correct',
      'both question and answer are correct',
      'question and answer are both correct',
      'the question is correct',
      'the answer is correct',
      'verified as correct',
      'is factually correct',
    ];
    return validPhrases.some((p) => lower.includes(p));
  }

  private buildVerificationContext(question: GeneratedQuestion): string {
    const parts: string[] = [];

    if (question.category === 'PLAYER_ID' && question.meta?.career) {
      const career = question.meta.career as Array<{ club: string; from: string; to: string }>;
      parts.push(`Career path as stored (may be outdated due to stale LLM training data — verify via web search): ${career.map((c) => `${c.club} (${c.from}–${c.to})`).join(' → ')}`);
      parts.push(`IMPORTANT: Search Transfermarkt/Wikipedia for "${question.correct_answer}" right now to check their CURRENT club. If the stored career is missing clubs or has wrong end dates, return correctedMeta with the full up-to-date career.`);
      if (question.source_url) parts.push(`Source URL: ${question.source_url}`);
    }

    if (question.category === 'GUESS_SCORE' && question.meta) {
      const m = question.meta as {
        home_team?: string;
        away_team?: string;
        home_score?: number;
        away_score?: number;
        date?: string;
        competition?: string;
      };
      if (m.home_team || m.away_team) {
        parts.push(
          `Match: ${m.home_team} vs ${m.away_team}${m.date ? ` (${m.date})` : ''}${m.competition ? ` — ${m.competition}` : ''}`,
        );
      }
      if (m.home_score != null || m.away_score != null) {
        parts.push(`Claimed scores in meta: home_score=${m.home_score}, away_score=${m.away_score}`);
      }
      parts.push(`Claimed answer (correct_answer): ${question.correct_answer}`);
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
