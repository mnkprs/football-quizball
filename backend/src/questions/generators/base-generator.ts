import { Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { GeneratedQuestion, QuestionCategory } from '../question.types';
import type { GeneratorOptions, GeneratorBatchOptions } from '../../common/interfaces/generator.interface';

export type { GeneratorOptions, GeneratorBatchOptions };

/**
 * Shared base for all question generators.
 *
 * Provides helpers that every generator repeats:
 *  - Language instruction snippet for the system prompt
 *  - Blitz wrong-choices prompt block
 *  - Wrong-choices extraction + deduplication from LLM output
 *  - Diversity-constraint logging
 *  - Batch map-with-error-isolation
 *
 * Subclasses must implement `generate()` and `generateBatch()`.
 * NestJS injects dependencies into the concrete subclass constructor,
 * which passes `llmService` to `super()`.
 */
export abstract class BaseGenerator {
  protected readonly logger: Logger;

  constructor(protected readonly llmService: LlmService) {
    this.logger = new Logger(this.constructor.name);
  }

  abstract generate(language: string, options?: GeneratorOptions): Promise<GeneratedQuestion>;
  abstract generateBatch(language: string, options?: GeneratorBatchOptions): Promise<GeneratedQuestion[]>;

  // ── Prompt helpers ─────────────────────────────────────────────────────────

  /**
   * Returns the language instruction appended to the end of system prompts.
   * Empty string for English — no extra instruction needed.
   */
  protected langInstruction(language: string): string {
    return language === 'el'
      ? '\nIMPORTANT: Write question_text and explanation in Greek (Ελληνικά). The correct_answer MUST remain in English.'
      : '';
  }

  /**
   * Returns the `wrong_choices` JSON field snippet to embed in the prompt schema.
   * Returns an empty string when not in Blitz mode.
   *
   * @param label  Word describing what the choices represent, e.g. "answer" or "player".
   */
  protected wrongChoicesPromptBlock(forBlitz: boolean, label = 'answer'): string {
    return forBlitz
      ? `\n  "wrong_choices": ["plausible wrong ${label} 1", "plausible wrong ${label} 2"],`
      : '';
  }

  // ── LLM output helpers ─────────────────────────────────────────────────────

  /**
   * Extracts and validates `wrong_choices` from LLM output for Blitz mode.
   * Returns `undefined` if fewer than 2 valid, non-duplicate choices are present.
   */
  protected extractWrongChoices(
    forBlitz: boolean,
    wrongChoicesRaw: unknown,
    correctAnswer: string,
  ): string[] | undefined {
    if (!forBlitz || !Array.isArray(wrongChoicesRaw)) return undefined;
    const filtered = (wrongChoicesRaw as unknown[])
      .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      .filter((s) => s.trim().toLowerCase() !== correctAnswer.trim().toLowerCase())
      .slice(0, 2);
    return filtered.length >= 2 ? filtered : undefined;
  }

  /**
   * Maps an array of raw LLM batch payloads through the given mapper,
   * silently dropping any items that throw so a single bad LLM output
   * does not abort the whole batch.
   */
  protected mapBatchItems<T>(items: T[], mapper: (item: T) => GeneratedQuestion): GeneratedQuestion[] {
    return (items ?? [])
      .map((item): GeneratedQuestion | null => {
        try {
          return mapper(item);
        } catch {
          return null;
        }
      })
      .filter((item): item is GeneratedQuestion => item !== null);
  }

  // ── Logging helpers ────────────────────────────────────────────────────────

  /** Logs the diversity constraints applied to a single-question generation call. */
  protected logConstraints(category: QuestionCategory, slotIndex?: number, constraints?: unknown): void {
    this.logger.log(`[${category}] slotIndex=${slotIndex} constraints=${JSON.stringify(constraints)}`);
  }
}
