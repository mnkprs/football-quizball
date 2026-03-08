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

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.client.models.generateContent({
          model: this.model,
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
            },
          ],
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
}
