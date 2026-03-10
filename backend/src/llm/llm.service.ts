import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { jsonrepair } from 'jsonrepair';

/** DeepSeek model (primary). OpenAI-compatible API. */
const DEEPSEEK_MODEL = 'deepseek-chat';

/** Gemini fallback chain: Flash-Lite (1000 RPD free), Flash (250 RPD), Pro. */
const GEMINI_FALLBACK_CHAIN = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'] as const;

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

function extractJson<T>(text: string): T {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in LLM response');
  const raw = jsonMatch[0];
  try {
    return JSON.parse(raw) as T;
  } catch {
    const repaired = jsonrepair(raw);
    return JSON.parse(repaired) as T;
  }
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private deepseekClient: OpenAI | null = null;
  private geminiClient: GoogleGenAI | null = null;
  /** Current Gemini model index. Advances on rate limit. */
  private geminiModelIndex = 0;

  constructor(private configService: ConfigService) {
    const deepseekKey = this.configService.get<string>('DEEPSEEK_API_KEY');
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (deepseekKey) {
      this.deepseekClient = new OpenAI({
        apiKey: deepseekKey,
        baseURL: 'https://api.deepseek.com',
      });
      this.logger.log(`LlmService ready — primary: ${DEEPSEEK_MODEL}`);
    }

    if (geminiKey) {
      this.geminiClient = new GoogleGenAI({ apiKey: geminiKey });
      this.logger.log(
        `LlmService — Gemini fallback: ${GEMINI_FALLBACK_CHAIN[this.geminiModelIndex]}`,
      );
    }

    if (!this.deepseekClient && !this.geminiClient) {
      this.logger.warn('Neither DEEPSEEK_API_KEY nor GEMINI_API_KEY set — LLM disabled');
    }
  }

  private get hasLlm(): boolean {
    return !!(this.deepseekClient || this.geminiClient);
  }

  private get currentGeminiModel(): string {
    return GEMINI_FALLBACK_CHAIN[this.geminiModelIndex];
  }

  async generateStructuredJson<T>(
    systemPrompt: string,
    userPrompt: string,
    maxRetries = 3,
  ): Promise<T> {
    if (!this.hasLlm) {
      const err = new Error(
        'No LLM configured — set DEEPSEEK_API_KEY and/or GEMINI_API_KEY',
      );
      this.logger.error(
        `[generateStructuredJson] Cannot call LLM — no API key\n  Caller stack:\n${err.stack}`,
      );
      throw err;
    }

    const promptSnippet = systemPrompt.slice(0, 120).replace(/\n/g, ' ');
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    if (process.env.LOG_PROMPTS === '1' || process.env.LOG_PROMPTS === 'true') {
      console.log(
        '\n' +
          '─'.repeat(80) +
          '\n[LLM FULL PROMPT]\n' +
          '─'.repeat(80) +
          '\n' +
          fullPrompt +
          '\n' +
          '─'.repeat(80) +
          '\n',
      );
    }

    let lastError: Error | null = null;

    // 1. Try DeepSeek first
    if (this.deepseekClient) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await this.deepseekClient.chat.completions.create({
            model: DEEPSEEK_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.9,
            top_p: 0.95,
            response_format: { type: 'json_object' },
          });

          const text = result.choices?.[0]?.message?.content ?? '';
          return extractJson<T>(text);
        } catch (err) {
          lastError = err as Error;
          if (isRateLimitError(err)) {
            this.logger.warn(
              `[generateStructuredJson] Rate limit on ${DEEPSEEK_MODEL} — falling back to Gemini`,
            );
            break;
          }
          this.logger.error(
            `[generateStructuredJson] DeepSeek attempt ${attempt}/${maxRetries} failed\n` +
              `  Prompt: "${promptSnippet}..."\n` +
              `  Error: ${lastError.message}`,
          );
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          } else {
            break;
          }
        }
      }
    }

    // 2. Fall back to Gemini
    if (this.geminiClient) {
      for (
        let modelIdx = this.geminiModelIndex;
        modelIdx < GEMINI_FALLBACK_CHAIN.length;
        modelIdx++
      ) {
        this.geminiModelIndex = modelIdx;
        const model = this.currentGeminiModel;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const result = await this.geminiClient.models.generateContent({
              model,
              contents: [
                {
                  role: 'user',
                  parts: [{ text: fullPrompt }],
                },
              ],
              config: {
                temperature: 0.9,
                topP: 0.95,
              },
            });

            const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            return extractJson<T>(text);
          } catch (err) {
            lastError = err as Error;

            if (isRateLimitError(err)) {
              this.logger.warn(
                `[generateStructuredJson] Rate limit on ${model} — switching Gemini model`,
              );
              if (modelIdx + 1 < GEMINI_FALLBACK_CHAIN.length) {
                this.geminiModelIndex = modelIdx + 1;
                this.logger.log(
                  `[generateStructuredJson] Using Gemini: ${GEMINI_FALLBACK_CHAIN[this.geminiModelIndex]}`,
                );
                break;
              }
              this.logger.error(
                '[generateStructuredJson] Rate limit on all Gemini models.',
              );
              throw lastError;
            }

            this.logger.error(
              `[generateStructuredJson] Gemini attempt ${attempt}/${maxRetries} failed (${model})\n` +
                `  Prompt: "${promptSnippet}..."\n` +
                `  Error: ${lastError.message}`,
            );
            if (attempt < maxRetries) {
              await new Promise((r) => setTimeout(r, 1000 * attempt));
            } else {
              throw lastError;
            }
          }
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
        await this.generateStructuredJson<{
          items: Array<{ question_text: string; explanation: string }>;
        }>(systemPrompt, userPrompt);

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
