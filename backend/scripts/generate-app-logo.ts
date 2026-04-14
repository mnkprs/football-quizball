/**
 * Generate premium StepOver app logo variants via Vertex AI Imagen.
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/generate-app-logo.ts
 *
 * Output: backend/scripts/_logo-output/<timestamp>/variant-NN.png
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const API_KEY = process.env.VERTEX_AI_KEY;
const LOCATION = 'us-central1';
const MODEL = 'imagen-3.0-generate-002';
const REFERENCE_IMAGE = '/Users/instashop/Downloads/quizball-unlimited-logo.png';
const OUT_DIR = path.join(__dirname, '_logo-output', new Date().toISOString().replace(/[:.]/g, '-'));
const NUM_VARIANTS = 8;

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT — Concept B: abstract S-arc + ball (stepover move as logo glyph)
// ─────────────────────────────────────────────────────────────────────────────
const PROMPT = `
Premium vector app icon logo for "StepOver", a football app. A bold sweeping "S" shaped ribbon arc that abstractly suggests a human player in motion: a small round head at the top, the upper curve of the S forms an arching torso, the lower curve forms a leg swinging around a soccer ball — depicting the stepover football move. The ball nests inside the lower curve. Geometric perfection: mathematically precise bezier curves, perfectly uniform stroke weight, crisp vector edges with zero roughness or brushstroke texture — as if drawn in Adobe Illustrator by a master logo designer. Flat 2D vector emblem in deep matte black on pure white background. One subtle chrome-silver gradient highlight arcing across the ball's upper-left pentagon panels to suggest polished metal (the only non-flat element). Classic hexagon-pentagon ball panel pattern, clean black lines. Inspired by premium sports heritage logos (Jordan Jumpman, Puma cat, Lacoste crocodile) — iconic silhouette, scales perfectly from 16px favicon to billboard, timeless and instantly recognizable. Symmetrical balanced composition, generous padding, perfectly centered. Editorial quality, crafted, refined.
`.trim();

const NEGATIVE_PROMPT = 'green, yellow, neon, lime, rainbow, gradient background, busy background, text, letters, typography, watermark, cluttered, cartoon, childish, 3D rendering, photorealistic ball, glossy plastic, infinity symbol, figure eight, drop shadows, multiple balls, rough brushstrokes, sketchy edges, hand-drawn look, uneven lines, amateur, ornate details, baroque, detailed faces, realistic human figures';

interface ImagenImage {
  imageBytes?: string;
  mimeType?: string;
  image?: { imageBytes?: string; mimeType?: string };
}

function extractBytes(img: ImagenImage): string | null {
  return img.imageBytes ?? img.image?.imageBytes ?? null;
}

async function main(): Promise<void> {
  if (!PROJECT && !API_KEY) {
    throw new Error('Set GOOGLE_CLOUD_PROJECT or VERTEX_AI_KEY in backend/.env');
  }
  if (!fs.existsSync(REFERENCE_IMAGE)) {
    throw new Error(`Reference image missing: ${REFERENCE_IMAGE}`);
  }

  const ai = API_KEY
    ? new GoogleGenAI({ vertexai: true, apiKey: API_KEY })
    : new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'prompt.txt'), `${PROMPT}\n\n--- NEGATIVE ---\n${NEGATIVE_PROMPT}`);
  fs.copyFileSync(REFERENCE_IMAGE, path.join(OUT_DIR, '_reference.png'));

  console.log(`Generating ${NUM_VARIANTS} variants with Imagen (${MODEL})`);
  console.log(`Output: ${OUT_DIR}\n`);

  const batchSize = 4;
  let idx = 0;

  for (let i = 0; i < Math.ceil(NUM_VARIANTS / batchSize); i++) {
    const count = Math.min(batchSize, NUM_VARIANTS - idx);
    console.log(`Batch ${i + 1}: requesting ${count}...`);

    const response = await ai.models.generateImages({
      model: MODEL,
      prompt: PROMPT,
      config: {
        numberOfImages: count,
        aspectRatio: '1:1',
        negativePrompt: NEGATIVE_PROMPT,
        personGeneration: 'dont_allow',
        safetyFilterLevel: 'block_only_high',
        addWatermark: false,
      } as Record<string, unknown>,
    });

    const images = (response?.generatedImages ?? []) as ImagenImage[];
    if (!images.length) {
      console.error('No images returned. Full response:', JSON.stringify(response, null, 2));
      continue;
    }

    for (const img of images) {
      const b64 = extractBytes(img);
      if (!b64) { console.warn('skipped image with no bytes'); continue; }
      idx++;
      const file = path.join(OUT_DIR, `variant-${String(idx).padStart(2, '0')}.png`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log(`  ✓ ${path.basename(file)}`);
    }
    if (i < Math.ceil(NUM_VARIANTS / batchSize) - 1) await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\nDone. ${idx} variants in ${OUT_DIR}`);
  console.log(`Background removal tip: \`brew install rembg && rembg i <file>.png <file>-nobg.png\``);
}

main().catch((e: Error) => { console.error('Fatal:', e.message); process.exit(1); });
