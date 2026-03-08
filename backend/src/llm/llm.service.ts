import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
    this.model = this.configService.get<string>('LLM_MODEL') || 'google/gemini-flash-1.5';

    if (!this.apiKey) {
      this.logger.warn('OPENROUTER_API_KEY not set — LLM text generation disabled');
    } else {
      this.logger.log(`LlmService ready — model: ${this.model}`);
    }
  }

  async generateStructuredJson<T>(
    systemPrompt: string,
    userPrompt: string,
    maxRetries = 3,
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('OpenRouter client not initialised — OPENROUTER_API_KEY missing');
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${this.baseUrl}/chat/completions`,
          {
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.9,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://quizball.app',
              'X-Title': 'FootballQuizBall',
            },
            timeout: 30000,
          },
        );

        const text: string = response.data?.choices?.[0]?.message?.content ?? '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in LLM response');

        return JSON.parse(jsonMatch[0]) as T;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(`LLM attempt ${attempt} failed: ${lastError.message}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error('LLM generation failed after all retries');
  }
}
