import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Modality } from '@google/genai';
import axios from 'axios';

@Injectable()
export class GeminiImageService {
  private readonly logger = new Logger(GeminiImageService.name);
  private client: GoogleGenAI | null = null;
  private readonly model = 'gemini-2.0-flash-exp';
  private readonly fetchHeaders = {
    'User-Agent': 'FootballQuizBall/1.0 (educational quiz app; contact@quizball.app)',
  };

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    } else {
      this.logger.warn('GEMINI_API_KEY not set — logo quiz images will be disabled');
    }
  }

  /**
   * Fetches the badge at imageUrl, sends it to Gemini with instructions to
   * erase all text/letters and apply obfuscation effects, then returns the
   * resulting image as a base64 data URL.
   *
   * Returns null if Gemini is not configured or if the transformation fails
   * for any reason — the caller should skip the logo quiz question in that case.
   */
  async transformLogoImage(imageUrl: string): Promise<string | null> {
    if (!this.client) {
      this.logger.warn('Gemini not configured — skipping logo image transform');
      return null;
    }

    try {
      // 1. Fetch the raw badge image
      const response = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: this.fetchHeaders,
      });

      const contentType = (response.headers['content-type'] as string) || 'image/png';
      const base64Data = Buffer.from(response.data).toString('base64');

      // 2. Send to Gemini for text removal + obfuscation
      const result = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are given a football club badge/crest image. Pnroduce a modified version that makes it hard to identify instantly while still being guessable with careful thought.

MANDATORY — apply ALL of the following:
1. ERASE every piece of text, letters, words, numbers and abbreviations from the badge (team name, city name, founding year — everything). Fill the erased areas with the surrounding colour or pattern so the badge looks complete, not blank.
2. Add a moderate blur (enough to soften sharp edges but not destroy all shapes).

Do NOT add any new text. Do NOT add watermarks or borders. Return ONLY the modified image with no extra commentary.`,
              },
              {
                inlineData: {
                  mimeType: contentType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
      });

      // 3. Extract the image from the response
      const parts = result.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return `data:${mime};base64,${part.inlineData.data}`;
        }
      }

      this.logger.warn(`Gemini returned no image part for ${imageUrl}`);
      return null;
    } catch (err) {
      this.logger.warn(`Gemini image transform failed: ${(err as Error).message}`);
      return null;
    }
  }
}
