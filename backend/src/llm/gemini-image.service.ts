import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import sharp = require('sharp');

@Injectable()
export class GeminiImageService {
  private readonly logger = new Logger(GeminiImageService.name);
  private readonly fetchHeaders = { 'User-Agent': 'FootballQuizBall/1.0 (educational quiz app; contact@quizball.app)' };

  /**
   * Fetches the image at imageUrl and applies a local pixelate + hue-shift + blur
   * transform using sharp to make the logo harder to identify at a glance.
   * Returns null if the source URL is unreachable.
   */
  async transformLogoImage(imageUrl: string): Promise<string | null> {
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

      // Pixelate: shrink to ~15% then scale back up, then blur + hue-shift
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
      this.logger.warn(`Image transform failed: ${(err as Error).message}`);
      return null;
    }
  }
}
