import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { jsonrepair } from 'jsonrepair';
import { WebSearchService } from '../web-search/web-search.service';

/** DeepSeek model. OpenAI-compatible API. */
const DEEPSEEK_MODEL = 'deepseek-chat';

/** Max tool-call rounds to avoid infinite loops. */
const MAX_TOOL_ROUNDS = 5;

/** Delay (ms) before retry when rate limited. */
const RATE_LIMIT_RETRY_MS = 30_000;

const SEARCH_WEB_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_web',
    description:
      'Search the web for real-time information (e.g. player current club, transfer news, latest team). Use when you need up-to-date information that may not be in your training data.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: "Search query (e.g. 'Player Name current club 2025')",
        },
      },
      required: ['query'],
    },
  },
};

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

  constructor(
    private configService: ConfigService,
    private webSearchService: WebSearchService,
  ) {
    const deepseekKey = this.configService.get<string>('DEEPSEEK_API_KEY');

    if (deepseekKey) {
      this.deepseekClient = new OpenAI({
        apiKey: deepseekKey,
        baseURL: 'https://api.deepseek.com',
      });
      this.logger.log(`LlmService ready — ${DEEPSEEK_MODEL}`);
    } else {
      this.logger.warn('DEEPSEEK_API_KEY not set — LLM disabled');
    }
  }

  private get hasLlm(): boolean {
    return !!this.deepseekClient;
  }

  /**
   * Generates structured JSON. When TAVILY_API_KEY is set, the model can use
   * search_web to fetch real-time information for any question type.
   */
  async generateStructuredJson<T>(
    systemPrompt: string,
    userPrompt: string,
    maxRetries = 3,
  ): Promise<T> {
    return this.generateStructuredJsonWithWebSearch<T>(systemPrompt, userPrompt, {
      useWebSearch: true,
      maxRetries,
    });
  }

  /** Internal: plain LLM call without tools (used when web search unavailable or for translate). */
  private async generateStructuredJsonPlain<T>(
    systemPrompt: string,
    userPrompt: string,
    maxRetries = 3,
  ): Promise<T> {
    if (!this.hasLlm) {
      const err = new Error('No LLM configured — set DEEPSEEK_API_KEY');
      this.logger.error(`[generateStructuredJsonPlain] Cannot call LLM — no API key`);
      throw err;
    }

    const promptSnippet = systemPrompt.slice(0, 120).replace(/\n/g, ' ');

    if (process.env.LOG_PROMPTS === '1' || process.env.LOG_PROMPTS === 'true') {
      console.log('\n' + '─'.repeat(80) + '\n[LLM FULL PROMPT]\n' + '─'.repeat(80) + '\n' + systemPrompt + '\n\n' + userPrompt + '\n' + '─'.repeat(80) + '\n');
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.deepseekClient!.chat.completions.create({
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
            `[generateStructuredJsonPlain] Rate limit — retrying in ${RATE_LIMIT_RETRY_MS / 1000}s (attempt ${attempt}/${maxRetries})`,
          );
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_MS));
          } else {
            throw lastError;
          }
          continue;
        }

        this.logger.error(
          `[generateStructuredJsonPlain] Attempt ${attempt}/${maxRetries} failed — Prompt: "${promptSnippet}..." — Error: ${lastError.message}`,
        );
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        } else {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('LLM generation failed after all retries');
  }

  /**
   * Generates structured JSON with optional real-time web search.
   * When web search is enabled: the model can call search_web to fetch current info (e.g. player transfers).
   * Falls back to regular generateStructuredJson when TAVILY_API_KEY is not set.
   */
  async generateStructuredJsonWithWebSearch<T>(
    systemPrompt: string,
    userPrompt: string,
    options?: { useWebSearch?: boolean; maxRetries?: number },
  ): Promise<T> {
    const useWebSearch = options?.useWebSearch ?? true;
    const maxRetries = options?.maxRetries ?? 3;

    if (!useWebSearch || !this.webSearchService.hasWebSearch) {
      return this.generateStructuredJsonPlain<T>(systemPrompt, userPrompt, maxRetries);
    }

    if (!this.hasLlm) {
      const err = new Error('No LLM configured — set DEEPSEEK_API_KEY');
      this.logger.error(`[generateStructuredJsonWithWebSearch] Cannot call LLM — no API key`);
      throw err;
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await this.deepseekClient!.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages,
        temperature: 0.9,
        top_p: 0.95,
        tools: [SEARCH_WEB_TOOL],
        tool_choice: 'auto',
      });

      const msg = result.choices?.[0]?.message;
      if (!msg) throw new Error('Empty LLM response');

      messages.push(msg as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam);

      const toolCalls = msg.tool_calls;
      if (!toolCalls?.length) {
        const text = msg.content ?? '';
        if (text.trim()) return extractJson<T>(text);
        throw new Error('LLM returned empty content after tool rounds');
      }

      for (const tc of toolCalls) {
        const fn = 'function' in tc ? tc.function : null;
        if (!fn || fn.name !== 'search_web') continue;
        let args: { query?: string } = {};
        try {
          args = JSON.parse(typeof fn.arguments === 'string' ? fn.arguments : '{}');
        } catch {
          this.logger.warn('[generateStructuredJsonWithWebSearch] Invalid tool args');
        }
        const query = args.query ?? '';
        const searchResult = await this.webSearchService.search(query, 5);
        const content = this.webSearchService.formatForPrompt(searchResult);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content,
        } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
      }
    }

    throw new Error('Max tool rounds exceeded — no final JSON response');
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
        await this.generateStructuredJsonPlain<{
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
