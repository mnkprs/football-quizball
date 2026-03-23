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

  abstract generate(options?: GeneratorOptions): Promise<GeneratedQuestion>;
  abstract generateBatch(options?: GeneratorBatchOptions): Promise<GeneratedQuestion[]>;

  // ── Prompt helpers ─────────────────────────────────────────────────────────

  /**
   * Returns the fifty_fifty_hint schema line. LLM proposes a plausible wrong answer.
   * Must be the SAME TYPE and FORMAT as correct_answer (e.g. player name → player name, country → country).
   * NOT a description like "Italian defender or French midfielder" — must be an actual alternative answer.
   * @param answerType Optional hint for the answer format (e.g. "player name", "country", "team", "year").
   */
  protected getFiftyFiftyHintInstruction(answerType?: string): string {
    const typeHint = answerType
      ? ` Must be another ${answerType} (same format as correct_answer), plausible in context.`
      : ' Must be the same type/format as correct_answer — e.g. if answer is a name, hint is another name; if country, another country. NOT a description.';
    return `"fifty_fifty_hint": "a plausible wrong answer (different from correct_answer).${typeHint} Must be a string."`;
  }

  /**
   * Returns the source_url schema line. LLM provides a URL to verify the answer.
   */
  protected getSourceUrlInstruction(): string {
    return `"source_url": "URL to a page that verifies this answer (e.g. Wikipedia, Transfermarkt, official stats). Must be a string."`;
  }

  /**
   * Returns the `wrong_choices` JSON field snippet to embed in the prompt schema.
   *
   * @param label  Word describing what the choices represent, e.g. "answer" or "player".
   */
  protected wrongChoicesPromptBlock(label = 'answer'): string {
    return `\n  "wrong_choices": ["plausible wrong ${label} 1", "plausible wrong ${label} 2", "plausible wrong ${label} 3"],`;
  }

  // ── LLM output helpers ─────────────────────────────────────────────────────

  /**
   * Extracts and validates `wrong_choices` from LLM output.
   * Returns `undefined` if fewer than 3 valid, non-duplicate choices are present.
   */
  protected extractWrongChoices(
    wrongChoicesRaw: unknown,
    correctAnswer: string,
  ): string[] | undefined {
    if (!Array.isArray(wrongChoicesRaw)) return undefined;
    const filtered = (wrongChoicesRaw as unknown[])
      .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      .filter((s) => s.trim().toLowerCase() !== correctAnswer.trim().toLowerCase())
      .slice(0, 3);
    return filtered.length >= 3 ? filtered : undefined;
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
