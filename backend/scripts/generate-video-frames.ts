/**
 * Generate start + end frames for Higgsfield I2V launch teaser.
 *   - start: wide empty stadium, no logo (room for dolly-in)
 *   - end:   tight chrome "STEPOVR." + "COMING SOON" glow
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/generate-video-frames.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';

const PROJECT: string | undefined = process.env.GOOGLE_CLOUD_PROJECT;
const API_KEY: string | undefined = process.env.VERTEX_AI_KEY;
const LOCATION = 'us-central1';
const MODEL = 'imagen-3.0-generate-002';

const RUN_ROOT = path.join(
  __dirname,
  '_brand-assets',
  new Date().toISOString().replace(/[:.]/g, '-'),
  'video-frames',
);

interface Frame {
  slug: 'start' | 'end';
  count: number;
  prompt: string;
  negativePrompt: string;
}

const FRAMES: Frame[] = [
  {
    slug: 'start',
    count: 4,
    prompt: `
Cinematic wide establishing shot, square 1:1 composition. A vast empty football stadium at deep night, viewed from a low camera angle at the tunnel entrance looking onto the pitch. A single narrow spotlight cuts through thick atmospheric fog and hits the distant center circle, faintly illuminating chalk lines on immaculate grass. Empty tiered stands fade into pure black on either side. Strong negative space, room in the frame for forward camera motion. Volumetric light rays, photorealistic haze, deep shadows, premium sports brand cinematography, Apple-ad aesthetic. Ultra-high contrast. No text, no logo, no wordmark, no people.
`.trim(),
    negativePrompt:
      'text, letters, wordmark, logo, watermark, people, players, crowd, faces, bright colors, yellow, green neon, rainbow, daylight, cartoon, cluttered, cheap stock photo, harsh flat lighting, lens flare excess',
  },
  {
    slug: 'end',
    count: 4,
    prompt: `
Extreme close-up cinematic shot, square 1:1 composition, centered. A chrome-silver "STEPOVR." wordmark in bold italic sans-serif, filling the middle of the frame, softly glowing with a cool violet halo. A warm narrow spotlight rakes across the letters from above-left, catching highlights on the metallic type. Thick atmospheric fog drifts through the frame. Below the wordmark, in small letter-spaced uppercase sans-serif, legible text reads "COMING SOON". Pure black background, subtle volumetric light rays, dust particles suspended in the beam, shallow depth of field. Premium sports brand aesthetic, high contrast, editorial cinematography. No additional text, no other logos, no people.
`.trim(),
    negativePrompt:
      'misspelled text, garbled letters, extra words, multiple logos, people, players, faces, crowd, bright colors, yellow, green neon, rainbow, cartoon, cluttered, stadium wide shot, cheap stock photo, harsh flat lighting',
  },
];

interface ImagenImage {
  imageBytes?: string;
  image?: { imageBytes?: string };
}

function extractBytes(img: ImagenImage): string | null {
  return img.imageBytes ?? img.image?.imageBytes ?? null;
}

async function runFrame(ai: GoogleGenAI, frame: Frame): Promise<void> {
  const outDir = path.join(RUN_ROOT, frame.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'prompt.txt'),
    `${frame.prompt}\n\n--- NEGATIVE ---\n${frame.negativePrompt}`,
  );

  console.log(`\n--- ${frame.slug.toUpperCase()} (${frame.count} x 1:1) ---`);

  const response = await ai.models.generateImages({
    model: MODEL,
    prompt: frame.prompt,
    config: {
      numberOfImages: frame.count,
      aspectRatio: '1:1',
      negativePrompt: frame.negativePrompt,
      personGeneration: 'dont_allow',
      safetyFilterLevel: 'block_only_high',
      addWatermark: false,
    } as Record<string, unknown>,
  });

  const images = (response?.generatedImages ?? []) as ImagenImage[];
  if (!images.length) {
    console.error(`  no images returned for ${frame.slug}`);
    return;
  }

  images.forEach((img, i) => {
    const b64 = extractBytes(img);
    if (!b64) return;
    const file = path.join(
      outDir,
      `${frame.slug}-${String(i + 1).padStart(2, '0')}.png`,
    );
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(`  ok ${path.basename(file)}`);
  });
}

async function main(): Promise<void> {
  if (!PROJECT && !API_KEY) {
    throw new Error('Set GOOGLE_CLOUD_PROJECT or VERTEX_AI_KEY');
  }

  const ai = API_KEY
    ? new GoogleGenAI({ vertexai: true, apiKey: API_KEY })
    : new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });

  fs.mkdirSync(RUN_ROOT, { recursive: true });
  console.log(`Output: ${RUN_ROOT}`);

  for (const f of FRAMES) {
    try {
      await runFrame(ai, f);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`FAIL ${f.slug}: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\nDone. ${RUN_ROOT}`);
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('FAIL:', msg);
  process.exit(1);
});
