/**
 * Logo Erasure v6 — Color-coded segmentation map
 *
 * Shows Gemini TWO images:
 * 1. The original rendered logo
 * 2. A segmentation map where each SVG element is a unique bright color with its index number
 *
 * This lets Gemini visually see which index corresponds to which visual part.
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const GEMINI_MODEL = 'gemini-2.5-flash';
const OUTPUT_DIR = '/private/tmp/logo-erasure-v6';

// 22 distinct bright colors for segmentation
const SEG_COLORS = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#FF8000', '#8000FF', '#0080FF', '#FF0080', '#80FF00', '#00FF80',
  '#FF4040', '#40FF40', '#4040FF', '#FFAA00', '#AA00FF', '#00AAFF',
  '#FF6699', '#66FF99', '#9966FF', '#FF9933', '#33FF99', '#9933FF',
  '#CC0000', '#00CC00', '#0000CC', '#CCCC00', '#CC00CC', '#00CCCC',
];

function parseCss(svg: string): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  const m = svg.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!m) return map;
  for (const r of m[1].matchAll(/\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g)) {
    const p: Record<string, string> = {};
    for (const d of r[2].split(';')) { const [k, v] = d.split(':').map(s => s.trim()); if (k && v) p[k] = v; }
    map.set(r[1], p);
  }
  return map;
}

/** Create a segmentation map SVG where each element gets a unique color */
function createSegmentationSvg(svgContent: string): string {
  const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;

  // Remove style tag so CSS classes don't interfere
  const styleEl = doc.querySelector('style');
  if (styleEl) styleEl.parentNode?.removeChild(styleEl);

  const shapes = doc.querySelectorAll('path, circle, ellipse, rect, polygon');
  shapes.forEach((node, i) => {
    const color = SEG_COLORS[i % SEG_COLORS.length];
    // Override all styling with the segmentation color
    node.setAttribute('style', `fill:${color};stroke:${color};stroke-width:1`);
    node.removeAttribute('class');
  });

  return new dom.window.XMLSerializer().serializeToString(doc);
}

function removeElements(svg: string, indices: Set<number>): string {
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
  const shapes = dom.window.document.querySelectorAll('path, circle, ellipse, rect, polygon');
  const rm: Element[] = []; shapes.forEach((n, i) => { if (indices.has(i)) rm.push(n); });
  for (const n of rm) n.parentNode?.removeChild(n);
  return new dom.window.XMLSerializer().serializeToString(dom.window.document);
}

function convertToOutlines(svg: string, keep: Set<number>): string {
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  const shapes = doc.querySelectorAll('path, circle, ellipse, rect, polygon');
  const rm: Element[] = [];
  shapes.forEach((n, i) => {
    if (!keep.has(i)) { rm.push(n); return; }
    n.setAttribute('style', 'fill:none;stroke:#000;stroke-width:3');
    n.removeAttribute('fill'); n.removeAttribute('stroke'); n.removeAttribute('class');
  });
  for (const n of rm) n.parentNode?.removeChild(n);
  const st = doc.querySelector('style'); if (st) st.parentNode?.removeChild(st);
  return new dom.window.XMLSerializer().serializeToString(doc);
}

async function svgToPng(svg: string | Buffer, size = 512): Promise<Buffer> {
  return sharp(typeof svg === 'string' ? Buffer.from(svg) : svg)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png().toBuffer();
}

const PROMPT = `I'm showing you TWO images of a football club logo:
1. IMAGE 1: The original rendered logo
2. IMAGE 2: A SEGMENTATION MAP where each SVG element is colored differently with a unique color

The segmentation map shows you exactly which colored region corresponds to which SVG element index:
{COLOR_MAP}

Your task: For a logo quiz game, decide which elements to KEEP at each difficulty level.

**EASY** — Slightly modified logo. Remove small decorative items only.
MUST REMOVE: any stars, founding year numbers, tiny dots, small ornamental details
MUST KEEP: main shape, text (team name), central pattern, colors, borders, wreaths, crowns
Result should look 80-90% like the original, but a fan would notice something is missing.

**MEDIUM** — Core pattern only. Dramatically different from original.
MUST REMOVE: team name text, outer borders/frames, wreaths, crowns, stars, secondary elements
MUST KEEP: ONLY the single most distinctive visual element (e.g. the striped circle, the diamond pattern, the central shield colors)
Result should show roughly 20-40% of the visual content.

**HARD** — Bare structural skeleton. Just 2-4 elements forming the outer shape.
MUST KEEP: Only the outermost container shape (main ring, shield outline). Will be converted to black line outlines.
Result should be extremely hard to identify — just a simple outline shape.

RULES:
- hard_keep ⊂ medium_keep ⊂ easy_keep
- easy_keep MUST exclude at least 2 visually distinct elements
- medium_keep should be 3-8 elements maximum
- hard_keep should be 1-4 elements
- Look at the SEGMENTATION MAP to understand which colored region = which index

Output JSON:
{
  "team_name": "your guess",
  "easy_keep": [list of indices to keep],
  "medium_keep": [list of indices to keep — much fewer],
  "hard_keep": [list of indices — 1-4 only]
}`;

async function processLogo(gemini: GoogleGenAI, name: string, svgUrl: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(name);
  console.log('='.repeat(60));

  const svgContent = await (await fetch(svgUrl)).text();

  // Count elements
  const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
  const shapes = dom.window.document.querySelectorAll('path, circle, ellipse, rect, polygon');
  const total = shapes.length;
  console.log(`Elements: ${total}`);

  // Render original
  const origPng = await svgToPng(svgContent);

  // Create and render segmentation map
  const segSvg = createSegmentationSvg(svgContent);
  const segPng = await svgToPng(segSvg);

  // Build color-index mapping text
  const colorLines: string[] = [];
  for (let i = 0; i < total; i++) {
    colorLines.push(`Index ${i} = ${SEG_COLORS[i % SEG_COLORS.length]} color region`);
  }

  // Save segmentation for debugging
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const dir = `${OUTPUT_DIR}/${slug}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/segmentation.png`, segPng);

  const prompt = PROMPT.replace('{COLOR_MAP}', colorLines.join('\n'));

  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/png', data: origPng.toString('base64') } },
        { inlineData: { mimeType: 'image/png', data: segPng.toString('base64') } },
        { text: prompt },
      ],
    }],
    config: { temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
  });

  let r: any;
  try { r = JSON.parse(response.text ?? ''); } catch { console.error('Parse fail:', (response.text ?? '').slice(0, 300)); return; }

  const v = (i: number) => i >= 0 && i < total;
  const easyKeep = new Set((r.easy_keep || []).filter(v) as number[]);
  const medKeep = new Set((r.medium_keep || []).filter(v) as number[]);
  const hardKeep = new Set((r.hard_keep || []).filter(v) as number[]);

  console.log(`Team: ${r.team_name}`);
  console.log(`Easy:   keep ${easyKeep.size}/${total}, remove ${total - easyKeep.size}`);
  console.log(`Medium: keep ${medKeep.size}/${total}, remove ${total - medKeep.size}`);
  console.log(`Hard:   keep ${hardKeep.size}/${total}, remove ${total - hardKeep.size}`);

  const all = Array.from({ length: total }, (_, i) => i);

  fs.writeFileSync(`${dir}/0-original.png`, origPng);
  fs.writeFileSync(`${dir}/1-easy.png`, await svgToPng(removeElements(svgContent, new Set(all.filter(i => !easyKeep.has(i))))));
  fs.writeFileSync(`${dir}/2-medium.png`, await svgToPng(removeElements(svgContent, new Set(all.filter(i => !medKeep.has(i))))));
  fs.writeFileSync(`${dir}/3-hard.png`, await svgToPng(convertToOutlines(svgContent, hardKeep)));
  fs.writeFileSync(`${dir}/classification.json`, JSON.stringify(r, null, 2));
  console.log(`Output: ${dir}/`);
}

async function main() {
  const k = process.env.VERTEX_AI_KEY, p = process.env.GOOGLE_CLOUD_PROJECT;
  const gemini = k ? new GoogleGenAI({ vertexai: true, apiKey: k }) : p ? new GoogleGenAI({ vertexai: true, project: p, location: 'us-central1' }) : null;
  if (!gemini) { console.error('No credentials'); process.exit(1); }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const logo of [
    { name: 'Club Brugge', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6445fa72f2d8896f6a9d5_club-brugge-footballlogos-org.svg' },
    { name: 'Bayern Munich', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f59397e06d4f150c04e9ef_bayern-munich-footballlogos-org.svg' },
    { name: 'FC Barcelona', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f5633874f0b7adc82bc7f5_fc-barcelona-footballlogos-org.svg' },
    { name: 'Union Saint-Gilloise', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6452043db6227ce0fad7d_union-saint-gilloise-footballlogos-org.svg' },
  ]) {
    try { await processLogo(gemini, logo.name, logo.url); await new Promise(r => setTimeout(r, 4000)); }
    catch (e) { console.error(`ERROR ${logo.name}:`, (e as Error).message); }
  }

  console.log(`\nAll outputs: ${OUTPUT_DIR}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
