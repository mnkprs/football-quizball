import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { jsonrepair } from 'jsonrepair';
import { RedisService } from '../redis/redis.service';

/** Gemini model. Supports Google Search grounding for factual verification. */
const GEMINI_MODEL = 'gemini-2.5-flash';

/** DeepSeek model for question generation (OpenAI-compatible API). */
const DEEPSEEK_MODEL = 'deepseek-chat';

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

const LOG_LLM_VERBOSE = process.env.LOG_LLM_VERBOSE === '1' || process.env.LOG_LLM_VERBOSE === 'true';

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

  // Verbose preview for debugging: full text if short, else first 600 chars
  const previewLength = LOG_LLM_VERBOSE || trimmed.length <= 800 ? trimmed.length : 600;
  const preview = trimmed.slice(0, previewLength) + (trimmed.length > previewLength ? '...' : '');
  const err = new Error(
    `No JSON found in LLM response (got ${trimmed.length} chars). Set LOG_LLM_VERBOSE=1 to see full response. Preview: ${preview}`,
  );
  (err as Error & { rawResponse?: string }).rawResponse = trimmed;
  throw err;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly gemini: GoogleGenAI | null = null;
  private readonly deepseek: OpenAI | null = null;

  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    const vertexKey = this.configService.get<string>('VERTEX_AI_KEY');
    const vertexProject = this.configService.get<string>('GOOGLE_CLOUD_PROJECT');
    const vertexLocation = this.configService.get<string>('GOOGLE_CLOUD_LOCATION') ?? 'us-central1';
    const deepseekKey = this.configService.get<string>('DEEPSEEK_API_KEY');

    // Vertex AI only. VERTEX_AI_KEY takes priority (no ADC needed); falls back to ADC via GOOGLE_CLOUD_PROJECT.
    if (vertexKey) {
      this.gemini = new GoogleGenAI({ vertexai: true, apiKey: vertexKey });
      this.logger.log(`LlmService — Gemini ready via Vertex AI (API key)`);
    } else if (vertexProject) {
      this.gemini = new GoogleGenAI({
        vertexai: true,
        project: vertexProject,
        location: vertexLocation,
      });
      this.logger.log(`LlmService — Gemini ready via Vertex AI (${vertexProject}/${vertexLocation}) [ADC auth]`);
    } else {
      this.logger.warn('Gemini disabled — set VERTEX_AI_KEY or GOOGLE_CLOUD_PROJECT to enable Vertex AI');
    }

    if (deepseekKey) {
      this.deepseek = new OpenAI({
        apiKey: deepseekKey,
        baseURL: 'https://api.deepseek.com/v1',
      });
      this.logger.log(`LlmService — DeepSeek ready (generation)`);
    } else {
      this.logger.debug('DEEPSEEK_API_KEY not set — using Gemini for generation');
    }
  }

  /** True if we can generate (DeepSeek or Gemini). */
  private get hasGenerationLlm(): boolean {
    return !!this.deepseek || !!this.gemini;
  }

  /** True if we can run integrity (Gemini with web search). */
  private get hasIntegrityLlm(): boolean {
    return !!this.gemini;
  }

  /**
   * Generates structured JSON. Uses DeepSeek when configured, else Gemini.
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
   * Always uses Gemini (DeepSeek has no web search). Used by QuestionIntegrityService.
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

  /**
   * Like generateStructuredJsonWithWebSearch, but also returns the first grounding URL
   * found in Gemini's web search metadata. The URL is the real source of truth — it should
   * replace any LLM-generated source_url on the question.
   */
  async generateStructuredJsonWithWebSearchMeta<T>(
    systemPrompt: string,
    userPrompt: string,
    options?: { maxRetries?: number },
  ): Promise<{ data: T; sourceUrl?: string }> {
    if (!this.hasIntegrityLlm) {
      throw new Error('Integrity requires Gemini via Vertex AI — set VERTEX_AI_KEY or GOOGLE_CLOUD_PROJECT');
    }
    return this.callGeminiWithRetryAndMetadata<T>(userPrompt, systemPrompt, options?.maxRetries ?? 3);
  }

  /** Internal: LLM call with optional Google Search grounding. */
  private async generateStructuredJsonInternal<T>(
    systemPrompt: string,
    userPrompt: string,
    maxRetries: number,
    useWebSearch: boolean,
  ): Promise<T> {
    if (useWebSearch) {
      if (!this.hasIntegrityLlm) {
        throw new Error('Integrity requires Gemini via Vertex AI — set VERTEX_AI_KEY or GOOGLE_CLOUD_PROJECT');
      }
      return this.callGeminiWithRetry<T>(userPrompt, systemPrompt, useWebSearch, maxRetries);
    }

    if (!this.hasGenerationLlm) {
      throw new Error('No LLM configured — set DEEPSEEK_API_KEY for generation and/or VERTEX_AI_KEY / GOOGLE_CLOUD_PROJECT for Vertex AI');
    }

    if (process.env.LOG_PROMPTS === '1' || process.env.LOG_PROMPTS === 'true') {
      console.log(
        '\n' + '─'.repeat(80) + '\n[LLM FULL PROMPT]\n' + '─'.repeat(80) + '\n' + systemPrompt + '\n\n' + userPrompt + '\n' + '─'.repeat(80) + '\n',
      );
    }

    if (this.deepseek) {
      return this.callDeepSeekWithRetry<T>(systemPrompt, userPrompt, maxRetries);
    }
    return this.callGeminiWithRetry<T>(userPrompt, systemPrompt, false, maxRetries);
  }

  private buildGeminiConfig(systemPrompt: string, useWebSearch: boolean) {
    const config: {
      systemInstruction?: string;
      responseMimeType?: string;
      temperature?: number;
      topP?: number;
      tools?: Array<{ googleSearch?: Record<string, never> }>;
      thinkingConfig?: { thinkingBudget: number };
    } = {
      systemInstruction: systemPrompt,
      // Disable thinking tokens — not needed for generation or validation, billed separately.
      thinkingConfig: { thinkingBudget: 0 },
    };
    if (useWebSearch) {
      // Validation: low temperature for deterministic fact-checking.
      config.temperature = 0.1;
      config.tools = [{ googleSearch: {} }];
    } else {
      // Generation fallback: keep creative temperature.
      config.temperature = 0.9;
      config.topP = 0.95;
      config.responseMimeType = 'application/json';
    }
    return config;
  }

  private async callDeepSeekWithRetry<T>(
    systemPrompt: string,
    userPrompt: string,
    maxRetries: number,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const completion = await this.deepseek!.chat.completions.create({
          model: DEEPSEEK_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.9,
          response_format: { type: 'json_object' },
        });
        const text = completion.choices[0]?.message?.content ?? '';
        return extractJson<T>(text);
      } catch (err) {
        lastError = err as Error;
        const rawResponse = (err as Error & { rawResponse?: string }).rawResponse;
        if (LOG_LLM_VERBOSE && rawResponse) {
          this.logger.error(`[generateStructuredJson] Raw DeepSeek response:\n${rawResponse}`);
        }
        if (isRateLimitError(err) && attempt < maxRetries) {
          const delay = RATE_LIMIT_RETRY_MS * attempt;
          this.logger.warn(`[generateStructuredJson] Rate limit (attempt ${attempt}/${maxRetries}) — retrying in ${delay / 1000}s`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        if (isServiceUnavailableError(err) && attempt < maxRetries) {
          this.logger.warn(
            `[generateStructuredJson] Service unavailable — retrying in ${SERVICE_UNAVAILABLE_RETRY_MS / 1000}s`,
          );
          await new Promise((r) => setTimeout(r, SERVICE_UNAVAILABLE_RETRY_MS));
          continue;
        }
        this.logger.error(`[generateStructuredJson] Attempt ${attempt}/${maxRetries} failed — ${lastError.message}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError || new Error('LLM generation failed after all retries');
  }

  private async callGeminiWithRetry<T>(
    userPrompt: string,
    systemPrompt: string,
    useWebSearch: boolean,
    maxRetries: number,
  ): Promise<T> {
    const config = this.buildGeminiConfig(systemPrompt, useWebSearch);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.gemini!.models.generateContent({
          model: GEMINI_MODEL,
          contents: userPrompt,
          config,
        });
        const text = response.text ?? '';
        return extractJson<T>(text);
      } catch (err) {
        lastError = err as Error;
        const rawResponse = (err as Error & { rawResponse?: string }).rawResponse;
        if (LOG_LLM_VERBOSE && rawResponse) {
          this.logger.error(`[generateStructuredJson] Raw Gemini response:\n${rawResponse}`);
        }
        if (isRateLimitError(err) && attempt < maxRetries) {
          const delay = RATE_LIMIT_RETRY_MS * attempt;
          this.logger.warn(`[generateStructuredJson] Rate limit (attempt ${attempt}/${maxRetries}) — retrying in ${delay / 1000}s`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        if (isServiceUnavailableError(err) && attempt < maxRetries) {
          this.logger.warn(
            `[generateStructuredJson] Service unavailable (503) — retrying in ${SERVICE_UNAVAILABLE_RETRY_MS / 1000}s`,
          );
          await new Promise((r) => setTimeout(r, SERVICE_UNAVAILABLE_RETRY_MS));
          continue;
        }
        this.logger.error(`[generateStructuredJson] Attempt ${attempt}/${maxRetries} failed — ${lastError.message}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError || new Error('LLM generation failed after all retries');
  }

  /**
   * Like callGeminiWithRetry but also extracts the first grounding web URI from the response
   * metadata. Used for integrity verification where the web search URL is the real source.
   */
  private async callGeminiWithRetryAndMetadata<T>(
    userPrompt: string,
    systemPrompt: string,
    maxRetries: number,
  ): Promise<{ data: T; sourceUrl?: string }> {
    const config = this.buildGeminiConfig(systemPrompt, true);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.gemini!.models.generateContent({
          model: GEMINI_MODEL,
          contents: userPrompt,
          config,
        });
        const text = response.text ?? '';
        const data = extractJson<T>(text);
        const sourceUrl =
          response.candidates?.[0]?.groundingMetadata?.groundingChunks
            ?.find((c) => c.web?.uri)
            ?.web?.uri ?? undefined;
        return { data, sourceUrl };
      } catch (err) {
        lastError = err as Error;
        const rawResponse = (err as Error & { rawResponse?: string }).rawResponse;
        if (LOG_LLM_VERBOSE && rawResponse) {
          this.logger.error(`[generateStructuredJson] Raw Gemini response:\n${rawResponse}`);
        }
        if (isRateLimitError(err) && attempt < maxRetries) {
          const delay = RATE_LIMIT_RETRY_MS * attempt;
          this.logger.warn(`[generateStructuredJson] Rate limit (attempt ${attempt}/${maxRetries}) — retrying in ${delay / 1000}s`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        if (isServiceUnavailableError(err) && attempt < maxRetries) {
          this.logger.warn(
            `[generateStructuredJson] Service unavailable (503) — retrying in ${SERVICE_UNAVAILABLE_RETRY_MS / 1000}s`,
          );
          await new Promise((r) => setTimeout(r, SERVICE_UNAVAILABLE_RETRY_MS));
          continue;
        }
        this.logger.error(`[generateStructuredJson] Attempt ${attempt}/${maxRetries} failed — ${lastError.message}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError || new Error('LLM generation failed after all retries');
  }

  /**
   * Embeds an array of texts using text-embedding-004.
   * Processed sequentially (not in parallel) to avoid 429 rate-limit errors.
   * Returns a parallel array of float vectors; nulls indicate failed items.
   */
  async embedTexts(texts: string[]): Promise<Array<number[] | null>> {
    if (!this.gemini || texts.length === 0) return texts.map(() => null);
    const results: Array<number[] | null> = [];
    for (const text of texts) {
      results.push(await this.embedSingleWithRetry(text));
    }
    return results;
  }

  /** Single embedding call with exponential backoff on 429. */
  private async embedSingleWithRetry(text: string, maxRetries = 3): Promise<number[] | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.gemini!.models.embedContent({
          model: 'text-embedding-004',
          contents: text,
          config: { taskType: 'SEMANTIC_SIMILARITY' },
        });
        return response.embeddings?.[0]?.values ?? null;
      } catch (err) {
        if (isRateLimitError(err) && attempt < maxRetries) {
          const delay = RATE_LIMIT_RETRY_MS * attempt;
          this.logger.warn(`[embedTexts] Rate limit (attempt ${attempt}/${maxRetries}) — retrying in ${delay / 1000}s`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        this.logger.warn(`[embedTexts] Failed for text snippet — ${(err as Error).message}`);
        return null;
      }
    }
    return null;
  }
}
