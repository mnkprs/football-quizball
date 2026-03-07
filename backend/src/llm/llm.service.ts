import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private client: OpenAI;
  private model: string;

  constructor(private configService: ConfigService) {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: this.configService.get<string>('OPENROUTER_API_KEY') || '',
      defaultHeaders: {
        'HTTP-Referer': 'https://football-quizball.app',
        'X-Title': 'Football QuizBall',
      },
    });
    this.model =
      this.configService.get<string>('LLM_MODEL') || 'google/gemini-flash-1.5';
  }

  async generateStructuredJson<T>(
    systemPrompt: string,
    userPrompt: string,
    maxRetries = 3,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in LLM response');
        }
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
