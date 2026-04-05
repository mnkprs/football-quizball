/**
 * Phase 0: Gemini Vision Logo Classification Validation
 *
 * Tests whether Gemini can reliably classify football logo elements
 * as decorative/core/structural for the Logo Quiz erasure pipeline.
 *
 * Usage: npx ts-node scripts/test-logo-classification.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const GEMINI_MODEL = 'gemini-2.5-flash';

// 5 test logos of varying complexity
const TEST_LOGOS = [
  {
    name: 'Ajax Amsterdam',
    slug: 'ajax',
    paths: 2,
    url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f605fe448549ca2560b16b_ajax-amsterdam-footballlogos-org.svg',
    hasExistingErasure: false,
  },
  {
    name: 'Bayern Munich',
    slug: 'bayern-munich',
    paths: 6,
    url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f59397e06d4f150c04e9ef_bayern-munich-footballlogos-org.svg',
    hasExistingErasure: false,
  },
  {
    name: 'FC Barcelona',
    slug: 'fc-barcelona',
    paths: 22,
    url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f5633874f0b7adc82bc7f5_fc-barcelona-footballlogos-org.svg',
    hasExistingErasure: false,
  },
  {
    name: 'Club Brugge',
    slug: 'club-brugge',
    url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6445fa72f2d8896f6a9d5_club-brugge-footballlogos-org.svg',
    paths: 0, // will count
    hasExistingErasure: true,
    existingEasy: 'https://polhepsikshzgwjwltgt.supabase.co/storage/v1/object/public/logos/1764881404826_kwoca38.webp',
    existingMedium: 'https://polhepsikshzgwjwltgt.supabase.co/storage/v1/object/public/logos/1764881405208_r3zdym9.webp',
    existingHard: 'https://polhepsikshzgwjwltgt.supabase.co/storage/v1/object/public/logos/1764881405535_o4jzzpz.webp',
  },
  {
    name: 'Union Saint-Gilloise',
    slug: 'union-saint-gilloise',
    url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6452043db6227ce0fad7d_union-saint-gilloise-footballlogos-org.svg',
    paths: 0,
    hasExistingErasure: true,
    existingEasy: 'https://polhepsikshzgwjwltgt.supabase.co/storage/v1/object/public/logos/1764881406285_21w52e1.webp',
    existingMedium: 'https://polhepsikshzgwjwltgt.supabase.co/storage/v1/object/public/logos/1764881406664_5iaceek.webp',
    existingHard: 'https://polhepsikshzgwjwltgt.supabase.co/storage/v1/object/public/logos/1764881406970_22vgh4x.webp',
  },
];

const CLASSIFICATION_PROMPT = `Analyze this football club logo. Classify every visual element into one of three categories:

1. DECORATIVE: Small embellishments that can be removed without losing recognition
   (stars above shield, ribbons, founding year text, motto banners, laurel wreaths, small crosses)

2. CORE: The distinctive visual pattern that makes this logo recognizable
   (main colors, stripe patterns, central emblems, dominant shapes, team-specific imagery)

3. STRUCTURAL: The outermost frame/skeleton of the logo
   (shield outline, circle border, main container shape)

For each element, describe it visually, classify it, and identify its dominant color and position.

Output as JSON:
{
  "team_name_guess": "your guess of the team name",
  "total_elements": <number>,
  "elements": [
    {
      "description": "descriptive name of the visual element",
      "category": "decorative" | "core" | "structural",
      "dominant_color": "#hexcode",
      "position": "top" | "center" | "bottom" | "left" | "right" | "background",
      "approximate_area_percent": <number 1-100>
    }
  ],
  "erasure_recommendation": {
    "easy_remove": ["descriptions of elements to remove for easy difficulty"],
    "medium_remove": ["descriptions of additional elements to remove for medium"],
    "hard_keep": ["descriptions of elements to KEEP for hard difficulty (structural only)"]
  }
}`;

async function downloadSvg(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function countSvgPaths(svgContent: string): number {
  return (svgContent.match(/<path/g) || []).length;
}

function extractSvgColors(svgContent: string): string[] {
  const fills = svgContent.match(/fill[=:][\s"']*#[0-9a-fA-F]{3,8}/g) || [];
  const colors = fills.map((f) => {
    const match = f.match(/#[0-9a-fA-F]{3,8}/);
    return match ? match[0].toLowerCase() : '';
  });
  return [...new Set(colors.filter(Boolean))];
}

function svgToPng(svgBuffer: Buffer): Promise<Buffer> {
  return sharp(svgBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

async function classifyLogo(
  gemini: GoogleGenAI,
  svgBuffer: Buffer,
  logoName: string,
): Promise<any> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Classifying: ${logoName}`);
  console.log(`${'='.repeat(60)}`);

  // Convert SVG to PNG for Gemini Vision
  const pngBuffer = await svgToPng(svgBuffer);
  console.log(`Converted to PNG: ${pngBuffer.length} bytes`);

  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: pngBuffer.toString('base64'),
            },
          },
          { text: CLASSIFICATION_PROMPT },
        ],
      },
    ],
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const text = response.text ?? '';
  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    console.error('Failed to parse JSON response:', text.slice(0, 500));
    return null;
  }
}

function evaluateClassification(
  result: any,
  svgContent: string,
  logoName: string,
): void {
  if (!result) {
    console.log(`FAIL: No classification result for ${logoName}`);
    return;
  }

  const svgColors = extractSvgColors(svgContent);
  const pathCount = countSvgPaths(svgContent);

  console.log(`\nTeam guess: ${result.team_name_guess}`);
  console.log(`Elements classified: ${result.elements?.length ?? 0}`);
  console.log(`SVG paths: ${pathCount}`);
  console.log(`SVG colors: ${svgColors.join(', ')}`);

  // Check color matching
  let colorMatches = 0;
  let colorMisses = 0;
  for (const el of result.elements || []) {
    const aiColor = el.dominant_color?.toLowerCase();
    if (aiColor && svgColors.some((c) => c === aiColor || c.startsWith(aiColor))) {
      colorMatches++;
    } else {
      colorMisses++;
      console.log(
        `  COLOR MISS: "${el.description}" → ${aiColor} (not in SVG: ${svgColors.join(', ')})`,
      );
    }
  }

  console.log(
    `\nColor matching: ${colorMatches}/${colorMatches + colorMisses} elements matched SVG colors`,
  );

  // Show erasure recommendations
  if (result.erasure_recommendation) {
    console.log('\nErasure recommendations:');
    console.log(
      `  EASY (remove): ${(result.erasure_recommendation.easy_remove || []).join(', ')}`,
    );
    console.log(
      `  MEDIUM (also remove): ${(result.erasure_recommendation.medium_remove || []).join(', ')}`,
    );
    console.log(
      `  HARD (keep only): ${(result.erasure_recommendation.hard_keep || []).join(', ')}`,
    );
  }

  // Print full classification table
  console.log('\nFull classification:');
  console.log(
    `${'Element'.padEnd(40)} ${'Category'.padEnd(14)} ${'Color'.padEnd(10)} ${'Pos'.padEnd(10)} Area%`,
  );
  console.log('-'.repeat(90));
  for (const el of result.elements || []) {
    console.log(
      `${(el.description || '').slice(0, 38).padEnd(40)} ${(el.category || '').padEnd(14)} ${(el.dominant_color || '').padEnd(10)} ${(el.position || '').padEnd(10)} ${el.approximate_area_percent ?? '?'}`,
    );
  }
}

async function main() {
  const vertexKey = process.env.VERTEX_AI_KEY;
  const vertexProject = process.env.GOOGLE_CLOUD_PROJECT;

  let gemini: GoogleGenAI;
  if (vertexKey) {
    gemini = new GoogleGenAI({ vertexai: true, apiKey: vertexKey });
    console.log('Gemini initialized via Vertex AI (API key)');
  } else if (vertexProject) {
    gemini = new GoogleGenAI({
      vertexai: true,
      project: vertexProject,
      location: 'us-central1',
    });
    console.log('Gemini initialized via Vertex AI (ADC)');
  } else {
    console.error('No VERTEX_AI_KEY or GOOGLE_CLOUD_PROJECT set');
    process.exit(1);
  }

  const results: Array<{ name: string; success: boolean; result: any }> = [];

  for (const logo of TEST_LOGOS) {
    try {
      const svgBuffer = await downloadSvg(logo.url);
      const svgContent = svgBuffer.toString('utf-8');
      const pathCount = countSvgPaths(svgContent);

      console.log(`\nDownloaded ${logo.name}: ${svgBuffer.length} bytes, ${pathCount} paths`);

      const classification = await classifyLogo(gemini, svgBuffer, logo.name);
      evaluateClassification(classification, svgContent, logo.name);

      results.push({ name: logo.name, success: !!classification, result: classification });

      // Rate limit courtesy
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`ERROR processing ${logo.name}:`, (err as Error).message);
      results.push({ name: logo.name, success: false, result: null });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('PHASE 0 VALIDATION SUMMARY');
  console.log(`${'='.repeat(60)}`);
  const passed = results.filter((r) => r.success).length;
  console.log(`${passed}/${results.length} logos classified successfully`);

  for (const r of results) {
    const status = r.success ? 'PASS' : 'FAIL';
    const guess = r.result?.team_name_guess || 'N/A';
    const elements = r.result?.elements?.length || 0;
    console.log(`  ${status}: ${r.name} (guessed: ${guess}, ${elements} elements)`);
  }

  const verdict = passed >= 4 ? 'PASS' : 'FAIL';
  console.log(`\nVERDICT: ${verdict} (${passed}/5 logos classified, threshold: 4/5)`);
  if (verdict === 'FAIL') {
    console.log('ACTION: Pivot to Approach A (heuristic-only SVG surgery)');
  } else {
    console.log('ACTION: Proceed to Phase 1 (Database + Backend)');
  }

  // Write results to file for review
  const outputPath = path.join(__dirname, '..', '..', '.gstack', 'logo-classification-results.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nFull results saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
