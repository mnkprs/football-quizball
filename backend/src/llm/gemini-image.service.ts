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
   * Falls back to the original URL if Gemini is unavailable or fails.
   */
  async transformLogoImage(imageUrl: string): Promise<string> {
    if (!this.client) return this.localTransform(imageUrl);

    try {
      // Fetch original image as buffer
      const response = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 8000,
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
                text: `You are given a football club badge image. Transform it to make it visually harder to identify at a glance while keeping it still guessable with careful thought. Apply effects such as: heavy pixelation/mosaic, color channel shifts, kaleidoscope warping, partial masking with geometric shapes, or extreme saturation/hue rotation. Do NOT add text or labels. Return only the transformed image.`,
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
   * Local fallback: pixelate + hue-shift + blur the logo using sharp,
   * making it harder to recognise without needing any external API.
   */
  private async localTransform(imageUrl: string): Promise<string> {
    try {
      const response = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 8000,
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
      return imageUrl;
    }
  }
}
