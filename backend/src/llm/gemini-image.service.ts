import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Modality } from '@google/genai';
import axios from 'axios';
import sharp = require('sharp');

@Injectable()
export class GeminiImageService {
  private readonly logger = new Logger(GeminiImageService.name);
  private client: GoogleGenAI | null = null;
  private readonly model = 'gemini-2.0-flash-exp-image-generation';
  private readonly fetchHeaders = { 'User-Agent': 'FootballQuizBall/1.0 (educational quiz app; contact@quizball.app)' };

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    } else {
      this.logger.warn('GEMINI_API_KEY not set – logo images will not be transformed');
    }
  }

  /**
   * Fetches the image at imageUrl, sends it to Gemini to visually obfuscate it,
   * and returns a base64 data URL of the modified image.
   * Returns null if the source URL is unreachable or any transform fails.
   */
  async transformLogoImage(imageUrl: string): Promise<string | null> {
    if (!this.client) return this.localTransform(imageUrl);


    try {
      // Fetch original image as buffer
      const response = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 8000,
        headers: this.fetchHeaders,
      });

      const contentType = (response.headers['content-type'] as string) || 'image/png';
      const base64Data = Buffer.from(response.data).toString('base64');

      // Send to Gemini for visual transformation
      const result = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are given a football club badge/crest image. Your job is to produce a modified version that makes it HARD to identify instantly, while keeping it guessable with careful thought.

MANDATORY steps — apply ALL of these:
1. ERASE all text, letters, words, and numbers from the badge (team name, city name, founding year, abbreviations — everything). Replace erased areas with the surrounding colour/pattern so the badge still looks complete.
2. Apply heavy pixelation or mosaic effect across the entire image (block size ~10-15% of image width).
3. Shift the hue significantly (rotate by 90-150 degrees) so colours are unfamiliar.
4. Add moderate blur (enough to soften fine details but not destroy all shapes).
5. Optionally add a subtle geometric overlay (diagonal stripes or circular mask) at low opacity.

Do NOT add any new text. Do NOT add watermarks. Return ONLY the modified image, nothing else.`,
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

      const parts = result.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return `data:${mime};base64,${part.inlineData.data}`;
        }
      }

      this.logger.warn('Gemini returned no image part, falling back to local transform');
      return this.localTransform(imageUrl);
    } catch (err) {
      this.logger.warn(`Gemini image transform failed: ${(err as Error).message}`);
      return this.localTransform(imageUrl);
    }
  }

  /**
   * Local fallback: pixelate + hue-shift + blur the logo using sharp.
   * Returns null if the source URL is unreachable.
   */
  private async localTransform(imageUrl: string): Promise<string | null> {
    try {
      const response = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 8000,
        headers: this.fetchHeaders,
      });

      const inputBuffer = Buffer.from(response.data);
      const image = sharp(inputBuffer);
      const meta = await image.metadata();
      const w = meta.width ?? 200;
      const h = meta.height ?? 200;

      // Pixelate: shrink to ~15% then back up, then blur + hue-shift
      const pixelSize = Math.max(8, Math.round(Math.min(w, h) * 0.15));
      const transformed = await image
        .resize(pixelSize, pixelSize, { fit: 'fill' })
        .resize(w, h, { fit: 'fill', kernel: 'nearest' })
        .modulate({ hue: 120, saturation: 1.4, brightness: 0.85 })
        .blur(2.5)
        .png()
        .toBuffer();

      return `data:image/png;base64,${transformed.toString('base64')}`;
    } catch (err) {
      this.logger.warn(`Local image transform failed: ${(err as Error).message}`);
      return null;
    }
  }
}
