/**
 * Logo Erasure Generator v3 — Gemini sees image + SVG element table,
 * directly outputs which indices to remove per stage.
 *
 * Key insight: instead of AI describing elements → fuzzy match to paths,
 * show AI the rendered image alongside a numbered element list and ask
 * it to pick indices directly.
 *
 * Usage: npx ts-node scripts/generate-erasure-v3.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const GEMINI_MODEL = 'gemini-2.5-flash';
const OUTPUT_DIR = '/private/tmp/logo-erasure-v3';

/** Parse CSS classes from <style> tag */
function parseCssClasses(svgContent: string): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  const styleMatch = svgContent.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) return map;
  const ruleRegex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g;
  let m;
  while ((m = ruleRegex.exec(styleMatch[1])) !== null) {
    const props: Record<string, string> = {};
    for (const decl of m[2].split(';')) {
      const [k, v] = decl.split(':').map(s => s.trim());
      if (k && v) props[k] = v;
    }
    map.set(m[1], props);
  }
  return map;
}

/** Resolve fill color for an element, walking up to parents */
function resolveColor(el: Element, prop: 'fill' | 'stroke', css: Map<string, Record<string, string>>): string {
  const style = el.getAttribute('style') || '';
  const sm = style.match(new RegExp(`${prop}:\\s*([^;]+)`));
  if (sm) return sm[1].trim();
  const attr = el.getAttribute(prop);
  if (attr) return attr;
  const cls = el.getAttribute('class');
  if (cls && css.has(cls) && css.get(cls)![prop]) return css.get(cls)![prop];
  const parent = el.parentElement;
  if (parent && parent.tagName.toLowerCase() !== 'svg') return resolveColor(parent, prop, css);
  return prop === 'fill' ? '#000' : 'none';
}

/** Estimate bounding box from element attributes */
function estimateBBox(el: Element): { x: number; y: number; w: number; h: number } {
  const tag = el.tagName.toLowerCase();
  if (tag === 'circle') {
    const cx = +el.getAttribute('cx')!, cy = +el.getAttribute('cy')!, r = +el.getAttribute('r')!;
    return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
  }
  if (tag === 'ellipse') {
    const cx = +el.getAttribute('cx')!, cy = +el.getAttribute('cy')!;
    const rx = +el.getAttribute('rx')!, ry = +el.getAttribute('ry')!;
    return { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 };
  }
  if (tag === 'path') {
    const d = el.getAttribute('d') || '';
    const nums: number[] = [];
    for (const m of d.matchAll(/[-+]?[0-9]*\.?[0-9]+/g)) nums.push(+m[0]);
    if (nums.length < 4) return { x: 0, y: 0, w: 0, h: 0 };
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

/** Build a human-readable element table for Gemini */
function buildElementTable(svgContent: string): { table: string; totalElements: number } {
  const css = parseCssClasses(svgContent);
  const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  const svg = doc.querySelector('svg')!;

  const vb = svg.getAttribute('viewBox');
  let svgH = 800;
  if (vb) { const p = vb.split(/[\s,]+/).map(Number); svgH = p[3] || svgH; }

  const shapes = svg.querySelectorAll('path, circle, ellipse, rect, polygon');
  const lines: string[] = ['INDEX | TAG     | FILL COLOR | Y-CENTER | APPROX SIZE'];
  lines.push('------|---------|------------|----------|------------');

  shapes.forEach((node, i) => {
    const fill = resolveColor(node, 'fill', css);
    const bbox = estimateBBox(node);
    const yCenter = ((bbox.y + bbox.h / 2) / svgH * 100).toFixed(0);
    const size = (bbox.w * bbox.h).toFixed(0);
    lines.push(
      `${i.toString().padStart(5)} | ${node.tagName.toLowerCase().padEnd(7)} | ${fill.padEnd(10)} | ${yCenter.padStart(7)}% | ${size}`,
    );
  });

  return { table: lines.join('\n'), totalElements: shapes.length };
}

/** Remove SVG elements by index */
function removeElements(svgContent: string, indices: Set<number>): string {
  const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  const shapes = doc.querySelectorAll('path, circle, ellipse, rect, polygon');
  const toRemove: Element[] = [];
  shapes.forEach((node, i) => { if (indices.has(i)) toRemove.push(node); });
  for (const node of toRemove) node.parentNode?.removeChild(node);
  return new dom.window.XMLSerializer().serializeToString(doc);
}

function svgToPng(svg: string | Buffer, size = 512): Promise<Buffer> {
  const buf = typeof svg === 'string' ? Buffer.from(svg) : svg;
  return sharp(buf)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

const PROMPT = `You are analyzing a football club logo. I'm showing you:
1. The rendered logo image
2. A table of all SVG elements (paths, circles, etc.) with their index, fill color, vertical position, and size

Your job: decide which SVG element indices to REMOVE at each difficulty stage to create a logo recognition quiz.

The erasure stages work like this:
- EASY (image_url): Remove small decorative elements — stars, founding year text, motto text, small emblems, team name text. The logo should still be very recognizable but have minor things missing.
- MEDIUM (medium_image_url): Remove MORE elements. Keep only the core distinctive pattern — the central visual that makes this logo unique (e.g. stripes, central emblem, main colors). Remove outer frames, text, crowns, wreaths, borders.
- HARD (hard_image_url): Keep ONLY the bare structural outline/skeleton — just the outer shape with no fills, no colors, no interior detail. Should be very hard to identify.

IMPORTANT RULES:
- For EASY: be aggressive — remove ALL text (team name, year, motto), small stars, small decorative elements. The user should notice things are missing.
- For MEDIUM: remove a LOT more. Only the core visual pattern should remain.
- For HARD: almost everything removed. Just the outline shape.
- Each stage removes MORE than the previous (hard removes everything from easy + medium + additional).
- Output valid JSON only.

SVG ELEMENT TABLE:
{TABLE}

Output JSON:
{
  "team_name": "your guess",
  "easy_remove": [list of indices to remove],
  "medium_remove": [list of ALL indices to remove — includes easy_remove plus more],
  "hard_remove": [list of ALL indices to remove — includes medium_remove plus more]
}`;

async function processLogo(gemini: GoogleGenAI, name: string, svgUrl: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ${name}`);
  console.log(`${'='.repeat(60)}`);

  const res = await fetch(svgUrl);
  const svgContent = await res.text();

  // Build element table
  const { table, totalElements } = buildElementTable(svgContent);
  console.log(`Elements: ${totalElements}`);
  console.log(table);

  // Render to PNG for Gemini
  const pngBuffer = await svgToPng(svgContent);

  // Ask Gemini
  const prompt = PROMPT.replace('{TABLE}', table);
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/png', data: pngBuffer.toString('base64') } },
        { text: prompt },
      ],
    }],
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const text = response.text ?? '';
  let result: any;
  try {
    result = JSON.parse(text);
  } catch {
    console.error('Failed to parse:', text.slice(0, 500));
    return;
  }

  console.log(`\nTeam guess: ${result.team_name}`);
  console.log(`Easy remove:   [${result.easy_remove?.join(', ')}]`);
  console.log(`Medium remove: [${result.medium_remove?.join(', ')}]`);
  console.log(`Hard remove:   [${result.hard_remove?.join(', ')}]`);

  // Validate indices
  const validIndex = (i: number) => i >= 0 && i < totalElements;
  const easyIndices = (result.easy_remove || []).filter(validIndex);
  const mediumIndices = (result.medium_remove || []).filter(validIndex);
  const hardIndices = (result.hard_remove || []).filter(validIndex);

  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const dir = `${OUTPUT_DIR}/${slug}`;
  fs.mkdirSync(dir, { recursive: true });

  // Generate images
  fs.writeFileSync(`${dir}/0-original.png`, pngBuffer);

  const easySvg = removeElements(svgContent, new Set(easyIndices));
  fs.writeFileSync(`${dir}/1-easy.png`, await svgToPng(easySvg));
  console.log(`Easy: removed ${easyIndices.length}/${totalElements} elements`);

  const mediumSvg = removeElements(svgContent, new Set(mediumIndices));
  fs.writeFileSync(`${dir}/2-medium.png`, await svgToPng(mediumSvg));
  console.log(`Medium: removed ${mediumIndices.length}/${totalElements} elements`);

  const hardSvg = removeElements(svgContent, new Set(hardIndices));
  fs.writeFileSync(`${dir}/3-hard.png`, await svgToPng(hardSvg));
  console.log(`Hard: removed ${hardIndices.length}/${totalElements} elements`);

  // Save classification
  fs.writeFileSync(`${dir}/classification.json`, JSON.stringify(result, null, 2));
  console.log(`Output: ${dir}/`);
}

async function main() {
  const vertexKey = process.env.VERTEX_AI_KEY;
  const vertexProject = process.env.GOOGLE_CLOUD_PROJECT;
  let gemini: GoogleGenAI;
  if (vertexKey) {
    gemini = new GoogleGenAI({ vertexai: true, apiKey: vertexKey });
  } else if (vertexProject) {
    gemini = new GoogleGenAI({ vertexai: true, project: vertexProject, location: 'us-central1' });
  } else {
    console.error('No Vertex AI credentials'); process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const logos = [
    { name: 'Club Brugge', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6445fa72f2d8896f6a9d5_club-brugge-footballlogos-org.svg' },
    { name: 'Bayern Munich', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f59397e06d4f150c04e9ef_bayern-munich-footballlogos-org.svg' },
    { name: 'Union Saint-Gilloise', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6452043db6227ce0fad7d_union-saint-gilloise-footballlogos-org.svg' },
  ];

  for (const logo of logos) {
    try {
      await processLogo(gemini, logo.name, logo.url);
      await new Promise(r => setTimeout(r, 3000)); // rate limit
    } catch (err) {
      console.error(`ERROR ${logo.name}:`, (err as Error).message);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`All outputs: ${OUTPUT_DIR}`);
  console.log(`open ${OUTPUT_DIR}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
