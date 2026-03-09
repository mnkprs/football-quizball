import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private client: GoogleGenAI | null = null;
  private readonly model = 'gemini-flash-latest';

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
      this.logger.log(`LlmService ready — model: ${this.model}`);
    } else {
      this.logger.warn('GEMINI_API_KEY not set — LLM text generation disabled');
    }
  }

  async generateStructuredJson<T>(
    systemPrompt: string,
    userPrompt: string,
    maxRetries = 3,
  ): Promise<T> {
    if (!this.client) {
      const err = new Error('Gemini client not initialised — GEMINI_API_KEY missing');
      this.logger.error(`[generateStructuredJson] Cannot call LLM — API key not set\n  Caller stack:\n${err.stack}`);
      throw err;
    }

    const promptSnippet = systemPrompt.slice(0, 120).replace(/\n/g, ' ');
    let lastError: Error | null = null;

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    if (process.env.LOG_PROMPTS === '1' || process.env.LOG_PROMPTS === 'true') {
      console.log('\n' + '─'.repeat(80) + '\n[LLM FULL PROMPT]\n' + '─'.repeat(80) + '\n' + fullPrompt + '\n' + '─'.repeat(80) + '\n');
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.client.models.generateContent({
          model: this.model,
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
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in LLM response');

        return JSON.parse(jsonMatch[0]) as T;
      } catch (err) {
        lastError = err as Error;
        this.logger.error(
          `[generateStructuredJson] Attempt ${attempt}/${maxRetries} failed\n` +
          `  Prompt: "${promptSnippet}..."\n` +
          `  Error: ${lastError.message}\n` +
          `  Stack: ${lastError.stack ?? 'n/a'}`,
        );
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error('LLM generation failed after all retries');
  }

  /**
   * Translates display strings to Greek. Answers (correct_answer, fifty_fifty_hint) stay in English.
   * Batches in chunks of 5 to avoid token limits.
   */
  async translateToGreek(strings: { question_text: string; explanation: string }[]): Promise<{ question_text: string; explanation: string }[]> {
    if (!this.client || strings.length === 0) return strings;

    const BATCH_SIZE = 5;
    const results: { question_text: string; explanation: string }[] = [];

    for (let i = 0; i < strings.length; i += BATCH_SIZE) {
      const batch = strings.slice(i, i + BATCH_SIZE);

      const systemPrompt = `You are a professional translator. Translate the following English strings to Greek (Ελληνικά).
Return ONLY a valid JSON object with key "items": an array of objects. Each object must have "question_text" and "explanation" keys with the Greek translation.
Preserve meaning, tone, and formatting. Do not translate proper nouns (player names, team names, etc.) unless they have a standard Greek form.`;

      const items = batch.map((s, j) => `[${j}] question_text: "${s.question_text}" | explanation: "${s.explanation}"`).join('\n');
      const userPrompt = `Translate each item to Greek. Return JSON: { "items": [ { "question_text": "...", "explanation": "..." }, ... ] }\n${items}`;

      const result = await this.generateStructuredJson<{ items: Array<{ question_text: string; explanation: string }> }>(
        systemPrompt,
        userPrompt,
      );

      const itemsResult = result?.items;
      if (!Array.isArray(itemsResult) || itemsResult.length !== batch.length) {
        this.logger.warn(`[translateToGreek] Batch ${i / BATCH_SIZE + 1} invalid, using originals`);
        results.push(...batch);
      } else {
        results.push(
          ...itemsResult.map((r, j) => ({
            question_text: typeof r?.question_text === 'string' ? r.question_text : batch[j].question_text,
            explanation: typeof r?.explanation === 'string' ? r.explanation : batch[j].explanation,
          })),
        );
      }
    }

    return results;
  }
}
