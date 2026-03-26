/**
 * Logo Erasure Generator v5
 *
 * Fixes from v4:
 * - Easy/medium were too conservative (kept everything)
 * - Now uses MINIMUM removal requirements
 * - Medium must be dramatically different from easy
 * - Prompt explicitly describes what to remove with examples
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const GEMINI_MODEL = 'gemini-2.5-flash';
const OUTPUT_DIR = '/private/tmp/logo-erasure-v5';

function parseCssClasses(svg: string): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  const m = svg.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!m) return map;
  for (const r of m[1].matchAll(/\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g)) {
    const props: Record<string, string> = {};
    for (const d of r[2].split(';')) { const [k, v] = d.split(':').map(s => s.trim()); if (k && v) props[k] = v; }
    map.set(r[1], props);
  }
  return map;
}

function resolveColor(el: Element, prop: 'fill' | 'stroke', css: Map<string, Record<string, string>>): string {
  const s = el.getAttribute('style') || '';
  const m = s.match(new RegExp(`${prop}:\\s*([^;]+)`));
  if (m) return m[1].trim();
  const a = el.getAttribute(prop);
  if (a) return a;
  const c = el.getAttribute('class');
  if (c && css.has(c) && css.get(c)![prop]) return css.get(c)![prop];
  const p = el.parentElement;
  if (p && p.tagName.toLowerCase() !== 'svg') return resolveColor(p, prop, css);
  return prop === 'fill' ? '#000' : 'none';
}

function estimateBBox(el: Element): { x: number; y: number; w: number; h: number } {
  const t = el.tagName.toLowerCase();
  if (t === 'circle') { const cx = +el.getAttribute('cx')!, cy = +el.getAttribute('cy')!, r = +el.getAttribute('r')!; return { x: cx-r, y: cy-r, w: r*2, h: r*2 }; }
  if (t === 'ellipse') { const cx = +el.getAttribute('cx')!, cy = +el.getAttribute('cy')!, rx = +el.getAttribute('rx')!, ry = +el.getAttribute('ry')!; return { x: cx-rx, y: cy-ry, w: rx*2, h: ry*2 }; }
  if (t === 'path') {
    const d = el.getAttribute('d') || '';
    const nums: number[] = []; for (const m of d.matchAll(/[-+]?[0-9]*\.?[0-9]+/g)) nums.push(+m[0]);
    if (nums.length < 4) return { x: 0, y: 0, w: 0, h: 0 };
    const xs = nums.filter((_,i)=>i%2===0), ys = nums.filter((_,i)=>i%2===1);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs)-Math.min(...xs), h: Math.max(...ys)-Math.min(...ys) };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

function getContentBounds(svg: string) {
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
  const shapes = dom.window.document.querySelectorAll('path, circle, ellipse, rect, polygon');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  shapes.forEach(n => { const b = estimateBBox(n); if (b.w === 0 && b.h === 0) return; minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x+b.w); maxY = Math.max(maxY, b.y+b.h); });
  return { minX, minY, maxX, maxY, w: maxX-minX, h: maxY-minY };
}

function buildElementTable(svg: string): { table: string; total: number } {
  const css = parseCssClasses(svg);
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
  const shapes = dom.window.document.querySelectorAll('path, circle, ellipse, rect, polygon');
  const b = getContentBounds(svg);
  const lines: string[] = ['IDX | TAG     | FILL       | VERTICAL | SIZE'];
  lines.push('----|---------|------------|----------|--------');
  shapes.forEach((n, i) => {
    const fill = resolveColor(n, 'fill', css);
    const bb = estimateBBox(n);
    const yN = b.h > 0 ? ((bb.y + bb.h/2 - b.minY) / b.h) : 0.5;
    const area = b.w * b.h > 0 ? (bb.w * bb.h) / (b.w * b.h) * 100 : 0;
    const yL = yN < 0.25 ? 'TOP   ' : yN > 0.75 ? 'BOTTOM' : 'MIDDLE';
    lines.push(`${i.toString().padStart(3)} | ${n.tagName.toLowerCase().padEnd(7)} | ${fill.padEnd(10)} | ${yL}   | ${area.toFixed(1)}%`);
  });
  return { table: lines.join('\n'), total: shapes.length };
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
    const s = (n.getAttribute('style') || '').replace(/fill:\s*[^;]+;?/g, '').replace(/stroke:\s*[^;]+;?/g, '').replace(/stroke-width:\s*[^;]+;?/g, '').trim();
    n.setAttribute('style', `${s}${s ? ';' : ''}fill:none;stroke:#000;stroke-width:3`);
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

const PROMPT = `You are analyzing a football club logo for a recognition quiz game. I'm showing you:
1. The rendered logo image
2. A numbered table of every SVG shape element (with fill color, position, size)

Tell me which indices to KEEP at each quiz difficulty. The goal: progressively erase the logo so it gets harder to recognize.

REFERENCE — here is what good erasure looks like for Club Brugge:
- EASY: Star removed, founding year removed, laurel wreaths removed. Everything else stays (ring, crown, stripes, text).
- MEDIUM: Only the inner striped circle remains (the distinctive blue+black diagonal stripes inside a circle). Everything else removed — no crown, no ring, no text, no star, no wreaths.
- HARD: Only the outer ring outline + crown outline remain. No fills, no colors — just black line outlines of the shape.

RULES:
1. **EASY must visibly remove things.** Remove at least: any stars, founding year text, small decorative elements, wreaths/laurels. If there are fewer than 4 things to remove, remove at least 2 visible elements. The user should notice something is missing.
2. **MEDIUM must be dramatically different from the original.** Keep ONLY the 3-5 elements that form the single most distinctive visual pattern (e.g. striped circle, diamond pattern, central emblem). Remove outer borders, text, crowns, secondary elements.
3. **HARD keeps only the 2-3 outermost structural elements** that form the logo's silhouette. These will be converted to black outlines (no fills).
4. hard_keep ⊂ medium_keep ⊂ easy_keep (each is a subset of the previous)
5. easy_keep must have FEWER elements than total (you MUST remove something for easy)
6. medium_keep should be roughly 20-40% of total elements
7. hard_keep should be 1-4 elements only

SVG ELEMENT TABLE:
{TABLE}

Total elements: {TOTAL}

Output JSON only:
{
  "team_name": "your guess",
  "easy_keep": [indices — must be less than {TOTAL}],
  "medium_keep": [indices — 20-40% of elements],
  "hard_keep": [indices — 1-4 elements only]
}`;

async function processLogo(gemini: GoogleGenAI, name: string, svgUrl: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(name);
  console.log('='.repeat(60));

  const svgContent = await (await fetch(svgUrl)).text();
  const { table, total } = buildElementTable(svgContent);
  console.log(`Elements: ${total}\n${table}`);

  const png = await svgToPng(svgContent);
  const prompt = PROMPT.replace(/\{TABLE\}/g, table).replace(/\{TOTAL\}/g, String(total));

  const resp = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'image/png', data: png.toString('base64') } },
      { text: prompt },
    ]}],
    config: { temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
  });

  let r: any;
  try { r = JSON.parse(resp.text ?? ''); } catch { console.error('Parse fail:', (resp.text ?? '').slice(0, 300)); return; }

  const v = (i: number) => i >= 0 && i < total;
  const easyKeep = new Set((r.easy_keep || []).filter(v) as number[]);
  const medKeep = new Set((r.medium_keep || []).filter(v) as number[]);
  const hardKeep = new Set((r.hard_keep || []).filter(v) as number[]);

  console.log(`\n${r.team_name}`);
  console.log(`Easy keep:   ${easyKeep.size}/${total} — removed ${total - easyKeep.size}`);
  console.log(`Medium keep: ${medKeep.size}/${total} — removed ${total - medKeep.size}`);
  console.log(`Hard keep:   ${hardKeep.size}/${total} — removed ${total - hardKeep.size}`);

  const all = Array.from({ length: total }, (_, i) => i);
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const dir = `${OUTPUT_DIR}/${slug}`;
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(`${dir}/0-original.png`, png);
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
