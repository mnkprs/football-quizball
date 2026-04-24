/**
 * Generate StepOver Instagram launch post — "Stadium Noir" variant.
 * Output: square 1:1 images suitable for IG feed (1080x1080 after upscale).
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/generate-launch-post.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';

const PROJECT: string | undefined = process.env.GOOGLE_CLOUD_PROJECT;
const API_KEY: string | undefined = process.env.VERTEX_AI_KEY;
const LOCATION = 'us-central1';
const MODEL = 'imagen-3.0-generate-002';
const OUT_DIR = path.join(
  __dirname,
  '_brand-assets',
  new Date().toISOString().replace(/[:.]/g, '-'),
  'launch-post',
);

const PROMPT = `
Cinematic square composition for a premium football app launch teaser. A vast empty football stadium at deep night, seen from a low three-quarter angle. A single crisp spotlight carves through thick atmospheric fog onto the center circle of a pristine pitch, illuminating faint chalk lines. Empty stands dissolve into darkness. Suspended above the center circle, glowing softly: a minimalist chrome-silver "STEPOVR." wordmark in bold italic sans-serif, subtly emitting a cool violet halo. Volumetric light rays, photorealistic haze, deep black negative space dominating the upper third. At the bottom, centered in small letter-spaced uppercase sans-serif: "COMING SOON". Moody, mysterious, Apple-ad aesthetic, premium sports brand energy. Ultra-high contrast, editorial cinematography, shallow depth of field. Square 1:1.
`.trim();

const NEGATIVE_PROMPT =
  'players, people, faces, crowd, bright colors, yellow, green neon, rainbow, cartoon, cluttered, logo watermark, text artifacts, misspelled words, cheap stock photo, harsh flat lighting, multiple balls, daylight';

interface ImagenImage {
  imageBytes?: string;
  image?: { imageBytes?: string };
}

function extractBytes(img: ImagenImage): string | null {
  return img.imageBytes ?? img.image?.imageBytes ?? null;
}

async function main(): Promise<void> {
  if (!PROJECT && !API_KEY) {
    throw new Error('Set GOOGLE_CLOUD_PROJECT or VERTEX_AI_KEY');
  }

  const ai = API_KEY
    ? new GoogleGenAI({ vertexai: true, apiKey: API_KEY })
    : new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'prompt.txt'),
    `${PROMPT}\n\n--- NEGATIVE ---\n${NEGATIVE_PROMPT}`,
  );

  console.log(`Output: ${OUT_DIR}`);
  console.log('Generating 4 candidates (1:1)...');

  const response = await ai.models.generateImages({
    model: MODEL,
    prompt: PROMPT,
    config: {
      numberOfImages: 4,
      aspectRatio: '1:1',
      negativePrompt: NEGATIVE_PROMPT,
      personGeneration: 'dont_allow',
      safetyFilterLevel: 'block_only_high',
      addWatermark: false,
    } as Record<string, unknown>,
  });

  const images = (response?.generatedImages ?? []) as ImagenImage[];
  if (!images.length) {
    console.error('No images returned.');
    process.exit(1);
  }

  images.forEach((img, i) => {
    const b64 = extractBytes(img);
    if (!b64) return;
    const file = path.join(
      OUT_DIR,
      `launch-post-${String(i + 1).padStart(2, '0')}.png`,
    );
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(`  ok ${path.basename(file)}`);
  });

  console.log(`\nDone. ${OUT_DIR}`);
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('FAIL:', msg);
  process.exit(1);
});
