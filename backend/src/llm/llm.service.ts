import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { jsonrepair } from 'jsonrepair';

/** Gemini model. Supports Google Search grounding for factual verification. */
const GEMINI_MODEL = 'gemini-2.5-flash';

/** Delay (ms) before retry when rate limited. */
const RATE_LIMIT_RETRY_MS = 30_000;

/** Delay (ms) before retry when service unavailable (503). */
const SERVICE_UNAVAILABLE_RETRY_MS = 20_000;

function isRateLimitError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? '');
  return (
    (err as { status?: string })?.status === 'RESOURCE_EXHAUSTED' ||
    (err as { code?: number })?.code === 429 ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('rate limit')
  );
}

function isServiceUnavailableError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? '');
  return (
    (err as { code?: number })?.code === 503 ||
    (err as { status?: string })?.status === 'UNAVAILABLE' ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('try again later')
  );
}

function extractJson<T>(text: string): T {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('No JSON found in LLM response (empty)');

  // 1. Try markdown code block: ```json ... ``` or ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const raw = codeBlockMatch[1].trim();
    try {
      return JSON.parse(raw) as T;
    } catch {
      const repaired = jsonrepair(raw);
      return JSON.parse(repaired) as T;
    }
  }

  // 2. Try JSON object { ... }
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const raw = jsonMatch[0];
    try {
      return JSON.parse(raw) as T;
    } catch {
      const repaired = jsonrepair(raw);
      return JSON.parse(repaired) as T;
    }
  }

  throw new Error(`No JSON found in LLM response (got ${trimmed.length} chars, preview: ${trimmed.slice(0, 200)}...)`);
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly ai: GoogleGenAI | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
      this.logger.log(`LlmService ready — ${GEMINI_MODEL} (Gemini)`);
    } else {
      this.logger.warn('GEMINI_API_KEY not set — LLM disabled');
    }
  }

  private get hasLlm(): boolean {
    return !!this.ai;
  }

  /**
   * Generates structured JSON using the LLM's knowledge.
   */
  async generateStructuredJson<T>(
    systemPrompt: string,
    userPrompt: string,
    maxRetries = 3,
  ): Promise<T> {
    return this.generateStructuredJsonInternal<T>(systemPrompt, userPrompt, maxRetries, false);
  }

  /**
   * Generates structured JSON with Google Search grounding for factual verification.
   * Used by QuestionIntegrityService for GUESS_SCORE and other categories.
   */
  async generateStructuredJsonWithWebSearch<T>(
    systemPrompt: string,
    userPrompt: string,
    options?: { useWebSearch?: boolean; maxRetries?: number },
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 3;
    const useWebSearch = options?.useWebSearch ?? false;
    return this.generateStructuredJsonInternal<T>(systemPrompt, userPrompt, maxRetries, useWebSearch);
  }

  /** Internal: LLM call with optional Google Search grounding. */
  private async generateStructuredJsonInternal<T>(
    systemPrompt: string,
    userPrompt: string,
    maxRetries: number,
    useWebSearch: boolean,
  ): Promise<T> {
    if (!this.hasLlm) {
      const err = new Error('No LLM configured — set GEMINI_API_KEY');
      this.logger.error(`[generateStructuredJson] Cannot call LLM — no API key`);
      throw err;
    }

    if (process.env.LOG_PROMPTS === '1' || process.env.LOG_PROMPTS === 'true') {
      console.log(
        '\n' + '─'.repeat(80) + '\n[LLM FULL PROMPT]\n' + '─'.repeat(80) + '\n' + systemPrompt + '\n\n' + userPrompt + '\n' + '─'.repeat(80) + '\n',
      );
    }

    const config = this.buildGeminiConfig(systemPrompt, useWebSearch);
    return this.callWithRetry<T>(userPrompt, config, maxRetries);
  }

  private buildGeminiConfig(systemPrompt: string, useWebSearch: boolean) {
    const config: {
      systemInstruction?: string;
      responseMimeType?: string;
      temperature?: number;
      topP?: number;
      tools?: Array<{ googleSearch?: Record<string, never> }>;
    } = {
      systemInstruction: systemPrompt,
      temperature: 0.9,
      topP: 0.95,
    };
    if (useWebSearch) {
      config.tools = [{ googleSearch: {} }];
      // Gemini does not allow responseMimeType with tool use (google_search)
    } else {
      config.responseMimeType = 'application/json';
    }
    return config;
  }

  private async callWithRetry<T>(
    userPrompt: string,
    config: { systemInstruction?: string; responseMimeType?: string; temperature?: number; topP?: number; tools?: Array<{ googleSearch?: Record<string, never> }> },
    maxRetries: number,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.ai!.models.generateContent({
          model: GEMINI_MODEL,
          contents: userPrompt,
          config,
        });
        const text = response.text ?? '';
        return extractJson<T>(text);
      } catch (err) {
        lastError = err as Error;
        if (isRateLimitError(err) && attempt < maxRetries) {
          this.logger.warn(`[generateStructuredJson] Rate limit — retrying in ${RATE_LIMIT_RETRY_MS / 1000}s`);
          await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_MS));
          continue;
        }
        if (isServiceUnavailableError(err) && attempt < maxRetries) {
          this.logger.warn(
            `[generateStructuredJson] Service unavailable (503) — retrying in ${SERVICE_UNAVAILABLE_RETRY_MS / 1000}s`,
          );
          await new Promise((r) => setTimeout(r, SERVICE_UNAVAILABLE_RETRY_MS));
          continue;
        }
        this.logger.error(`[generateStructuredJson] Attempt ${attempt}/${maxRetries} failed — Error: ${lastError.message}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        } else {
          throw lastError;
        }
      }
    }
    throw lastError || new Error('LLM generation failed after all retries');
  }

  /**
   * Translates display strings to Greek. Answers (correct_answer, fifty_fifty_hint) stay in English.
   * Batches in chunks of 5 to avoid token limits.
   */
  async translateToGreek(
    strings: { question_text: string; explanation: string }[],
  ): Promise<{ question_text: string; explanation: string }[]> {
    if (!this.hasLlm || strings.length === 0) return strings;

    const BATCH_SIZE = 5;
    const results: { question_text: string; explanation: string }[] = [];

    for (let i = 0; i < strings.length; i += BATCH_SIZE) {
      const batch = strings.slice(i, i + BATCH_SIZE);

      const systemPrompt = `You are a professional translator. Translate the following English strings to Greek (Ελληνικά).
Return ONLY a valid JSON object with key "items": an array of objects. Each object must have "question_text" and "explanation" keys with the Greek translation.
Preserve meaning, tone, and formatting. Do not translate proper nouns (player names, team names, etc.) unless they have a standard Greek form.`;

      const items = batch
        .map(
          (s, j) =>
            `[${j}] question_text: "${s.question_text}" | explanation: "${s.explanation}"`,
        )
        .join('\n');
      const userPrompt = `Translate each item to Greek. Return JSON: { "items": [ { "question_text": "...", "explanation": "..." }, ... ] }\n${items}`;

      const result =
        await this.generateStructuredJsonInternal<{
          items: Array<{ question_text: string; explanation: string }>;
        }>(systemPrompt, userPrompt, 3, false);

      const itemsResult = result?.items;
      if (
        !Array.isArray(itemsResult) ||
        itemsResult.length !== batch.length
      ) {
        this.logger.warn(
          `[translateToGreek] Batch ${i / BATCH_SIZE + 1} invalid, using originals`,
        );
        results.push(...batch);
      } else {
        results.push(
          ...itemsResult.map((r, j) => ({
            question_text:
              typeof r?.question_text === 'string'
                ? r.question_text
                : batch[j].question_text,
            explanation:
              typeof r?.explanation === 'string'
                ? r.explanation
                : batch[j].explanation,
          })),
        );
      }
    }

    return results;
  }
}
