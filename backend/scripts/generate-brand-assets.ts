/**
 * Generate 4 separate StepOver brand asset concepts via Vertex AI Imagen.
 *
 *   1. wordmark       — typographic treatments of "STEPOVR."
 *   2. hero           — wide marketing hero image (logo + football motif)
 *   3. brand-sheet    — logo applied across contexts (jersey, phone, stadium)
 *   4. loading-frames — keyframe stills as animation reference
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/generate-brand-assets.ts [concept]
 *   concept = wordmark | hero | brand-sheet | loading-frames | all (default: all)
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const API_KEY = process.env.VERTEX_AI_KEY;
const LOCATION = 'us-central1';
const MODEL = 'imagen-3.0-generate-002';
const RUN_ROOT = path.join(__dirname, '_brand-assets', new Date().toISOString().replace(/[:.]/g, '-'));

interface Concept {
  slug: string;
  count: number;
  aspectRatio: '1:1' | '16:9' | '9:16' | '3:4' | '4:3';
  prompt: string;
  negativePrompt: string;
}

const CONCEPTS: Concept[] = [
  {
    slug: 'wordmark',
    count: 6,
    aspectRatio: '16:9',
    prompt: `
Typographic wordmark exploration for "STEPOVR." — the word STEPOVR followed by a bold period. Premium sports brand wordmark design, italic slanted letterforms suggesting forward motion, thick extra-bold weight, modern geometric sans-serif. Various refined treatments: polished chrome-silver metallic finish, subtle gradient embossed depth, clean flat black on white, and one version with a silver-to-black gradient. Display-size lettering, precise kerning, confident negative space. Centered horizontal composition on pure white background with generous padding. Editorial magazine quality, high-end sports branding like Nike, Puma, or Adidas wordmarks. No logo mark — wordmark only.
`.trim(),
    negativePrompt: 'logo, icon, ball, soccer ball, infinity, color, neon, green, yellow, rainbow, ornate, handwritten, cursive, script, cluttered background',
  },
  {
    slug: 'hero',
    count: 4,
    aspectRatio: '16:9',
    prompt: `
Wide cinematic hero banner image for "StepOver" football trivia app. Centered composition: a premium minimalist black S-shaped logo glyph wrapping a modern soccer ball, positioned to the left. To the right, a bold italic wordmark reading "STEPOVR." in chrome-silver finish. Dark moody background: deep black gradient with subtle stadium-night atmosphere — faint blurred floodlight glows in the distance, subtle volumetric light rays, premium dark editorial mood. Professional sports marketing banner quality, similar to FIFA or UEFA Champions League hero art. 16:9 aspect, cinematic, high contrast, sophisticated.
`.trim(),
    negativePrompt: 'bright colors, yellow, green, neon, cartoon, cluttered, multiple balls, text artifacts, lens flare excess, low quality',
  },
  {
    slug: 'brand-sheet',
    count: 4,
    aspectRatio: '4:3',
    prompt: `
Brand identity mockup composition showing the "StepOver" app logo (a minimal black S-shaped glyph wrapping a soccer ball) applied in multiple real-world contexts: embroidered onto a football jersey patch, displayed as an app icon on a modern smartphone screen, screen-printed on a black cotton t-shirt tag, and shown large on a stadium LED scoreboard at night. Clean studio product photography aesthetic, each application shot at a premium angle with soft dramatic lighting, dark moody neutral background. Professional brand guidelines photoshoot quality, editorial magazine layout feel.
`.trim(),
    negativePrompt: 'text artifacts, wordmark misspelled, cheap, plastic toy look, amateur photography, harsh lighting, cluttered',
  },
  {
    slug: 'loading-frames',
    count: 6,
    aspectRatio: '1:1',
    prompt: `
A series of clean minimalist loading animation keyframe stills for a premium football app. Each frame shows a stylized soccer ball in motion forming an S-shaped trail: motion-blurred ball traveling along an arc, chrome-silver streak showing its path curving around an invisible defender. Simple, iconic, readable at small sizes. Pure black background with the ball and its trail rendered in crisp white and chrome-silver highlights. Frame-by-frame animation reference quality. No text, pure motion study, premium and minimalist.
`.trim(),
    negativePrompt: 'text, letters, wordmark, colors, green, yellow, neon, rainbow, cluttered, people, faces, backgrounds',
  },
];

interface ImagenImage { imageBytes?: string; image?: { imageBytes?: string }; }
function extractBytes(img: ImagenImage): string | null {
  return img.imageBytes ?? img.image?.imageBytes ?? null;
}

async function runConcept(ai: GoogleGenAI, concept: Concept): Promise<void> {
  const outDir = path.join(RUN_ROOT, concept.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'prompt.txt'), `${concept.prompt}\n\n--- NEGATIVE ---\n${concept.negativePrompt}`);

  console.log(`\n─── ${concept.slug.toUpperCase()} (${concept.count} × ${concept.aspectRatio}) ───`);

  const batchSize = 4;
  let idx = 0;

  for (let i = 0; i < Math.ceil(concept.count / batchSize); i++) {
    const count = Math.min(batchSize, concept.count - idx);
    console.log(`  batch ${i + 1}: ${count} images...`);

    const response = await ai.models.generateImages({
      model: MODEL,
      prompt: concept.prompt,
      config: {
        numberOfImages: count,
        aspectRatio: concept.aspectRatio,
        negativePrompt: concept.negativePrompt,
        personGeneration: 'dont_allow',
        safetyFilterLevel: 'block_only_high',
        addWatermark: false,
      } as Record<string, unknown>,
    });

    const images = (response?.generatedImages ?? []) as ImagenImage[];
    if (!images.length) {
      console.error(`  no images returned — skipping batch`);
      continue;
    }

    for (const img of images) {
      const b64 = extractBytes(img);
      if (!b64) continue;
      idx++;
      const file = path.join(outDir, `${concept.slug}-${String(idx).padStart(2, '0')}.png`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log(`    ✓ ${path.basename(file)}`);
    }

    if (i < Math.ceil(concept.count / batchSize) - 1) await new Promise((r) => setTimeout(r, 2000));
  }
}

async function main(): Promise<void> {
  if (!PROJECT && !API_KEY) throw new Error('Set GOOGLE_CLOUD_PROJECT or VERTEX_AI_KEY');

  const ai = API_KEY
    ? new GoogleGenAI({ vertexai: true, apiKey: API_KEY })
    : new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });

  const filter = process.argv[2];
  const concepts = !filter || filter === 'all'
    ? CONCEPTS
    : CONCEPTS.filter((c) => c.slug === filter);

  if (!concepts.length) {
    console.error(`Unknown concept. Options: ${CONCEPTS.map((c) => c.slug).join(', ')}, all`);
    process.exit(1);
  }

  fs.mkdirSync(RUN_ROOT, { recursive: true });
  console.log(`Output: ${RUN_ROOT}`);
  console.log(`Concepts: ${concepts.map((c) => c.slug).join(', ')}`);

  for (const c of concepts) {
    try { await runConcept(ai, c); }
    catch (e) { console.error(`FAIL ${c.slug}:`, (e as Error).message); }
  }

  console.log(`\nDone. ${RUN_ROOT}`);
}

main().catch((e: Error) => { console.error('Fatal:', e.message); process.exit(1); });
