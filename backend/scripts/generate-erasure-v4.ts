/**
 * Logo Erasure Generator v4
 *
 * Fixes from v3:
 * 1. Prompt asks which indices to KEEP (not remove) — makes Gemini more conservative
 * 2. Hard mode converts remaining elements to black outlines (no fills) to avoid white-on-white
 * 3. Better viewBox parsing for accurate position data
 * 4. Prompt is more specific about what each stage should look like
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const GEMINI_MODEL = 'gemini-2.5-flash';
const OUTPUT_DIR = '/private/tmp/logo-erasure-v4';

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
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

/** Get actual content bounds from all elements */
function getContentBounds(svgContent: string): { minX: number; minY: number; maxX: number; maxY: number } {
  const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
  const shapes = dom.window.document.querySelectorAll('path, circle, ellipse, rect, polygon');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  shapes.forEach(node => {
    const bb = estimateBBox(node);
    if (bb.w === 0 && bb.h === 0) return;
    minX = Math.min(minX, bb.x);
    minY = Math.min(minY, bb.y);
    maxX = Math.max(maxX, bb.x + bb.w);
    maxY = Math.max(maxY, bb.y + bb.h);
  });
  return { minX, minY, maxX, maxY };
}

function buildElementTable(svgContent: string): { table: string; totalElements: number } {
  const css = parseCssClasses(svgContent);
  const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  const shapes = doc.querySelectorAll('path, circle, ellipse, rect, polygon');

  const bounds = getContentBounds(svgContent);
  const contentH = bounds.maxY - bounds.minY;
  const contentW = bounds.maxX - bounds.minX;

  const lines: string[] = ['INDEX | TAG     | FILL       | POSITION       | RELATIVE SIZE'];
  lines.push('------|---------|------------|----------------|---------------');

  shapes.forEach((node, i) => {
    const fill = resolveColor(node, 'fill', css);
    const bbox = estimateBBox(node);
    const yCenterNorm = contentH > 0 ? ((bbox.y + bbox.h / 2 - bounds.minY) / contentH) : 0.5;
    const xCenterNorm = contentW > 0 ? ((bbox.x + bbox.w / 2 - bounds.minX) / contentW) : 0.5;
    const areaRatio = contentW * contentH > 0 ? (bbox.w * bbox.h) / (contentW * contentH) * 100 : 0;

    const yLabel = yCenterNorm < 0.25 ? 'TOP' : yCenterNorm > 0.75 ? 'BOTTOM' : 'CENTER';
    const xLabel = xCenterNorm < 0.35 ? 'LEFT' : xCenterNorm > 0.65 ? 'RIGHT' : 'CENTER';
    const pos = `${yLabel}-${xLabel}`;

    const sizeLabel = areaRatio > 50 ? 'VERY LARGE' : areaRatio > 20 ? 'LARGE' : areaRatio > 5 ? 'MEDIUM' : areaRatio > 1 ? 'SMALL' : 'TINY';

    lines.push(
      `${i.toString().padStart(5)} | ${node.tagName.toLowerCase().padEnd(7)} | ${fill.padEnd(10)} | ${pos.padEnd(14)} | ${sizeLabel} (${areaRatio.toFixed(1)}%)`,
    );
  });

  return { table: lines.join('\n'), totalElements: shapes.length };
}

function removeElements(svgContent: string, indices: Set<number>): string {
  const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  const shapes = doc.querySelectorAll('path, circle, ellipse, rect, polygon');
  const toRemove: Element[] = [];
  shapes.forEach((node, i) => { if (indices.has(i)) toRemove.push(node); });
  for (const node of toRemove) node.parentNode?.removeChild(node);
  return new dom.window.XMLSerializer().serializeToString(doc);
}

/** Convert remaining elements to black outlines only (for hard mode) */
function convertToOutlines(svgContent: string, keepIndices: Set<number>): string {
  const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  const shapes = doc.querySelectorAll('path, circle, ellipse, rect, polygon');
  const toRemove: Element[] = [];

  shapes.forEach((node, i) => {
    if (!keepIndices.has(i)) {
      toRemove.push(node);
    } else {
      // Convert to outline: remove fill, add black stroke
      const existingStyle = node.getAttribute('style') || '';
      // Remove existing fill and stroke from style
      const cleanedStyle = existingStyle
        .replace(/fill:\s*[^;]+;?/g, '')
        .replace(/stroke:\s*[^;]+;?/g, '')
        .replace(/stroke-width:\s*[^;]+;?/g, '')
        .trim();
      const newStyle = `${cleanedStyle}${cleanedStyle ? ';' : ''}fill:none;stroke:#000;stroke-width:3`;
      node.setAttribute('style', newStyle);
      node.removeAttribute('fill');
      node.removeAttribute('stroke');
      node.removeAttribute('class');
    }
  });

  for (const node of toRemove) node.parentNode?.removeChild(node);

  // Also remove style tag (CSS classes no longer needed)
  const styleEl = doc.querySelector('style');
  if (styleEl) styleEl.parentNode?.removeChild(styleEl);

  return new dom.window.XMLSerializer().serializeToString(doc);
}

function svgToPng(svg: string | Buffer, size = 512): Promise<Buffer> {
  const buf = typeof svg === 'string' ? Buffer.from(svg) : svg;
  return sharp(buf)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

const PROMPT = `You are analyzing a football club logo SVG for a logo recognition quiz game.

I'm showing you the rendered logo image alongside a table of all SVG shape elements with their index, fill color, position, and size.

Your job: tell me which element indices to KEEP at each difficulty stage.

DIFFICULTY STAGES (each keeps FEWER elements than the previous):

**EASY (image_url)** — Remove only minor decorative details. Keep 70-90% of elements.
Remove: small stars, founding year text, tiny dots, small decorative circles, motto text
KEEP: main shape, all major visual elements, team name text, central patterns, colors, borders, wreaths, crowns

**MEDIUM (medium_image_url)** — Keep only the core distinctive visual. Keep 30-60% of elements.
Remove everything from easy PLUS: team name text, outer borders/rings, wreaths, crowns, secondary decorations
KEEP: the central distinctive pattern that makes this logo unique (stripes, diamond patterns, central emblems, the main colored shapes)

**HARD (hard_image_url)** — Keep only the bare structural outline. Keep 15-30% of elements.
Keep ONLY: the 2-4 largest elements that form the outer shape/silhouette of the logo (main ring, shield outline, container shape)
Remove: everything else including colors, patterns, text, small elements

IMPORTANT:
- EASY should look almost like the original with just minor things missing
- MEDIUM should still be somewhat recognizable but missing a lot
- HARD should be just the skeleton/outline — very difficult to identify
- Each stage keeps FEWER elements (easy_keep > medium_keep > hard_keep)
- hard_keep must be a SUBSET of medium_keep, which must be a SUBSET of easy_keep

SVG ELEMENT TABLE:
{TABLE}

Output valid JSON only:
{
  "team_name": "your guess",
  "easy_keep": [indices of ALL elements to keep for easy — should be most elements],
  "medium_keep": [indices to keep for medium — fewer elements, core pattern only],
  "hard_keep": [indices to keep for hard — just 2-4 structural elements]
}`;

async function processLogo(gemini: GoogleGenAI, name: string, svgUrl: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ${name}`);
  console.log(`${'='.repeat(60)}`);

  const res = await fetch(svgUrl);
  const svgContent = await res.text();
  const { table, totalElements } = buildElementTable(svgContent);
  console.log(`Elements: ${totalElements}`);
  console.log(table);

  const pngBuffer = await svgToPng(svgContent);
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

  let result: any;
  try {
    result = JSON.parse(response.text ?? '');
  } catch {
    console.error('Failed to parse:', (response.text ?? '').slice(0, 500));
    return;
  }

  console.log(`\nTeam: ${result.team_name}`);
  console.log(`Easy keep:   [${result.easy_keep?.join(', ')}] (${result.easy_keep?.length}/${totalElements})`);
  console.log(`Medium keep: [${result.medium_keep?.join(', ')}] (${result.medium_keep?.length}/${totalElements})`);
  console.log(`Hard keep:   [${result.hard_keep?.join(', ')}] (${result.hard_keep?.length}/${totalElements})`);

  const valid = (i: number) => i >= 0 && i < totalElements;
  const easyKeep = new Set((result.easy_keep || []).filter(valid) as number[]);
  const mediumKeep = new Set((result.medium_keep || []).filter(valid) as number[]);
  const hardKeep = new Set((result.hard_keep || []).filter(valid) as number[]);

  // Compute remove sets (everything NOT in keep)
  const allIndices = Array.from({ length: totalElements }, (_, i) => i);
  const easyRemove = new Set(allIndices.filter(i => !easyKeep.has(i)));
  const mediumRemove = new Set(allIndices.filter(i => !mediumKeep.has(i)));

  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const dir = `${OUTPUT_DIR}/${slug}`;
  fs.mkdirSync(dir, { recursive: true });

  // Original
  fs.writeFileSync(`${dir}/0-original.png`, pngBuffer);

  // Easy: remove decorative, keep most
  const easySvg = removeElements(svgContent, easyRemove);
  fs.writeFileSync(`${dir}/1-easy.png`, await svgToPng(easySvg));
  console.log(`Easy: keeping ${easyKeep.size}/${totalElements}, removed ${easyRemove.size}`);

  // Medium: keep core pattern only
  const mediumSvg = removeElements(svgContent, mediumRemove);
  fs.writeFileSync(`${dir}/2-medium.png`, await svgToPng(mediumSvg));
  console.log(`Medium: keeping ${mediumKeep.size}/${totalElements}, removed ${mediumRemove.size}`);

  // Hard: convert to outlines only (black strokes, no fills)
  const hardSvg = convertToOutlines(svgContent, hardKeep);
  fs.writeFileSync(`${dir}/3-hard.png`, await svgToPng(hardSvg));
  console.log(`Hard: keeping ${hardKeep.size}/${totalElements} as outlines`);

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
    { name: 'FC Barcelona', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f5633874f0b7adc82bc7f5_fc-barcelona-footballlogos-org.svg' },
    { name: 'Union Saint-Gilloise', url: 'https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6452043db6227ce0fad7d_union-saint-gilloise-footballlogos-org.svg' },
  ];

  for (const logo of logos) {
    try {
      await processLogo(gemini, logo.name, logo.url);
      await new Promise(r => setTimeout(r, 4000));
    } catch (err) {
      console.error(`ERROR ${logo.name}:`, (err as Error).message);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`All outputs: ${OUTPUT_DIR}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
